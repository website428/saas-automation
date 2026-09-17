import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/server-supabase';
import { Resend } from 'resend';

/**
 * POST /api/webhooks/inbound
 *
 * Receives inbound email webhooks from Resend when a contact replies.
 * Configure in Resend Dashboard → Inbound → Webhook URL:
 *   https://YOUR-APP.vercel.app/api/webhooks/inbound
 *
 * This stores the reply in inbox_threads + inbox_messages so it
 * appears in the Inbox / Chat section of the dashboard in real-time.
 */
export async function POST(req: NextRequest) {
    try {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 500 });
        }
        // A Resend signing secret belongs to one webhook endpoint.  Keep the
        // inbound secret separate from the delivery-events secret, but accept
        // either during a safe migration from older deployments.
        const webhookSecrets = [
            process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim(),
            process.env.RESEND_WEBHOOK_SECRET?.trim(),
        ].filter((secret): secret is string => Boolean(secret));
        if (!webhookSecrets.length) {
            return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        }
        const rawBody = await req.text();
        const id = req.headers.get('svix-id');
        const timestamp = req.headers.get('svix-timestamp');
        const signature = req.headers.get('svix-signature');
        if (!id || !timestamp || !signature) {
            console.warn('[inbound] Missing Resend Svix signature headers');
            return NextResponse.json({ error: 'Missing Resend signature headers' }, { status: 400 });
        }

        // This is Resend's official SDK verification API. It verifies the
        // exact, unmodified body Resend signed plus the three Svix headers.
        const resend = new Resend(process.env.RESEND_RECEIVING_API_KEY || process.env.RESEND_API_KEY);
        let outer: any;
        for (const webhookSecret of webhookSecrets) {
            try {
                outer = resend.webhooks.verify({
                    payload: rawBody,
                    headers: { id, timestamp, signature },
                    webhookSecret,
                });
                break;
            } catch {
                // Try the legacy delivery-webhook secret once before rejecting.
            }
        }
        if (!outer) {
            console.warn('[inbound] Invalid Resend signature', {
                hasInboundSecret: Boolean(process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim()),
                hasDeliverySecret: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
                candidateCount: webhookSecrets.length,
                hasSvixHeaders: Boolean(id && timestamp && signature),
            });
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        // Resend wraps inbound payloads in { type, data } — unwrap if needed
        const data = outer?.data ?? outer;

        // Capture the RFC Message-ID on the provider's email.sent event. This
        // is more reliable than an immediate API lookup after a send, and it
        // is the exact ID Gmail/Outlook put in In-Reply-To when replying.
        if (outer?.type === 'email.sent') {
            const sentResendId = data?.email_id || data?.id || '';
            const outboundMessageId = normalizeMessageId(data?.message_id || '');
            if (sentResendId && outboundMessageId) {
                const { data: updatedRows, error } = await supabase
                    .from('email_queue')
                    .update({ outbound_message_id: outboundMessageId })
                    .eq('resend_id', sentResendId)
                    .select('id');
                if (error) throw new Error(`Could not store outbound Message-ID: ${error.message}`);
                // The email.sent webhook can arrive before the sending worker
                // finishes writing resend_id. Return a retryable response so
                // Resend tries again instead of permanently losing the link.
                if (!updatedRows?.length) {
                    return NextResponse.json({ error: 'Queue row not ready; retry email.sent' }, { status: 503 });
                }
                console.log(`[inbound] Stored outbound Message-ID for ${sentResendId}`);
            }
            return NextResponse.json({ received: true, stored: Boolean(sentResendId && outboundMessageId), event: 'email.sent' });
        }

        // This endpoint is intentionally shared by email.received and
        // email.sent. Acknowledge other event types without treating them as
        // inbound replies.
        if (outer?.type && outer.type !== 'email.received') {
            return NextResponse.json({ received: true, ignored: outer.type });
        }

        await supabase.rpc('record_resend_inbound_usage');

        // Optional clean-start guard. Old Resend retries are acknowledged but
        // not added back after an Inbox reset.
        const resetAt = process.env.INBOX_RESET_AT;
        const eventCreatedAt = outer?.created_at || data?.created_at;
        if (resetAt && eventCreatedAt) {
            const resetTime = Date.parse(resetAt);
            const eventTime = Date.parse(eventCreatedAt);
            if (Number.isFinite(resetTime) && Number.isFinite(eventTime) && eventTime < resetTime) {
                return NextResponse.json({ received: true, ignored: 'before inbox reset' });
            }
        }

        // ── Debug: log full payload so we can see exactly what Resend sends ──
        console.log('[inbound] Raw payload:', JSON.stringify(outer, null, 2));

        // ── Extract fields ────────────────────────────────────────────
        const fromEmail: string = extractEmail(data.from);
        const toEmail: string = Array.isArray(data.to)
            ? extractEmail(data.to[0])
            : extractEmail(data.to ?? '');
        const subject: string = data.subject || '(no subject)';

        // Resend inbound uses email_id or id for the received message ID
        const emailId: string = data.email_id || data.id || '';
        const inboundMessageId = normalizeMessageId(data.message_id || '');

        // ── In-Reply-To — Resend sends via Amazon SES, so the Message-ID format is:
        //   <0106019de6e-{RESEND_UUID}-000000@region.amazonses.com>
        //   We need to extract the UUID part (stored as resend_id in email_queue)
        const inlineHeaders: Record<string, string> = data.headers || {};
        const inReplyToRaw: string =
            inlineHeaders['in-reply-to'] ||
            inlineHeaders['In-Reply-To'] ||
            data.in_reply_to ||
            data.inReplyTo ||
            '';

        // Keep the full RFC Message-ID for precise modern matching. Retain the
        // UUID extraction only as a fallback for campaign emails sent before
        // outbound Message-IDs were stored.
        let inReplyToMessageId = normalizeMessageId(inReplyToRaw);
        let inReplyTo: string | null = null;
        if (inReplyToRaw) {
            const uuidMatch = inReplyToRaw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            inReplyTo = uuidMatch ? uuidMatch[0] : null;
        }

        console.log(`[inbound] from=${fromEmail} to=${toEmail} subject="${subject}" email_id=${emailId} inReplyTo=${inReplyTo}`);

        if (!fromEmail) {
            return NextResponse.json({ error: 'No from email' }, { status: 400 });
        }

        // ── Get reply body (try all field variants first) ─────────────
        let body = '';

        // Resend inbound may use text, plain, or html
        if (data.text) {
            body = data.text;
        } else if (data.plain) {
            body = data.plain;
        } else if (data.html) {
            body = stripHtml(data.html);
        }

        // Resend webhook payloads intentionally contain metadata only. Fetch
        // the full received email immediately with the official Receiving API.
        // This is what supplies the Gmail/Outlook reply body for Inbox.
        if (emailId) {
            try {
                const { data: receivedEmail, error: receivingError } = await resend.emails.receiving.get(emailId);
                if (receivingError || !receivedEmail) {
                    console.warn('[inbound] Receiving API could not retrieve message body', {
                        emailId,
                        error: receivingError?.message || 'No email returned',
                    });
                } else {
                    if (receivedEmail.text) body = receivedEmail.text;
                    else if (receivedEmail.html) body = stripHtml(receivedEmail.html);

                    // The complete email includes the reply headers, unlike the
                    // webhook metadata. They let us match the right campaign.
                    const apiHeaders: Record<string, string> = receivedEmail.headers || {};
                    const irtFromApi = apiHeaders['in-reply-to'] || apiHeaders['In-Reply-To'] || '';
                    if (irtFromApi) inReplyToMessageId = inReplyToMessageId || normalizeMessageId(irtFromApi);
                    if (!inReplyTo && irtFromApi) {
                        const uuidMatch = irtFromApi.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                        inReplyTo = uuidMatch ? uuidMatch[0] : null;
                        console.log(`[inbound] In-Reply-To UUID from Receiving API: ${inReplyTo}`);
                    }
                }
            } catch (e) {
                console.warn('[inbound] Receiving API fetch error:', e);
            }
        }

        // ── Strip quoted reply text (Gmail, Outlook, Apple Mail) ──────
        if (body) {
            body = body
                // Gmail wraps "On Date, Name <email>\nwrote:" across TWO lines.
                // Use [\s\S]{5,300}? (non-greedy, spans newlines) to match it.
                .replace(/\r?\nOn [\s\S]{5,300}?wrote:\s*[\s\S]*/i, '')
                .replace(/^On [\s\S]{5,300}?wrote:\s*[\s\S]*/i, '')
                // Outlook: "From: Name\nSent:\nTo:\nSubject:"
                .replace(/\r?\nFrom:[\s\S]*/i, '')
                // Generic email separator (-- or _____)
                .replace(/\r?\n--\s*\r?\n[\s\S]*/, '')
                .replace(/\r?\n_{5,}[\s\S]*/, '')
                .trim();

            // Remove > quoted lines (RFC inline quotes)
            const lines = body.split('\n');
            body = lines.filter(l => !l.trimStart().startsWith('>')).join('\n').trim();
        }


        // Use a descriptive fallback only if we truly got nothing
        if (!body) body = '(reply received — content unavailable)';

        // ── Find the precise outbound email that this message replies to ─
        // Never attach a direct email merely because the sender happens to be
        // a contact from an old campaign. That caused replies sent to one
        // receiving address to appear under a different sending domain.
        let queueItem: any = null;

        // Match the full RFC Message-ID first. Gmail and Outlook put this in
        // their In-Reply-To header when the recipient replies to a campaign.
        if (inReplyToMessageId) {
            const { data: q } = await supabase
                .from('email_queue')
                .select('id, campaign_id, contact_id, domain_id')
                .eq('outbound_message_id', inReplyToMessageId)
                .maybeSingle();
            queueItem = q;
            if (queueItem) console.log('[inbound] Matched by outbound RFC Message-ID');
        }

        // A reply to a message that was sent from the portal is part of an
        // existing Inbox conversation, not a fresh campaign message. Resolve
        // the stored portal outbound Message-ID back to its original thread.
        if (!queueItem && inReplyToMessageId) {
            const { data: portalMessage } = await supabase
                .from('inbox_messages')
                .select('thread_id')
                .eq('direction', 'outbound')
                .eq('resend_id', inReplyToMessageId)
                .maybeSingle();
            if (portalMessage?.thread_id) {
                const { data: portalThread } = await supabase
                    .from('inbox_threads')
                    .select('queue_id, campaign_id, contact_id, domain_id')
                    .eq('id', portalMessage.thread_id)
                    .maybeSingle();
                if (portalThread) {
                    queueItem = {
                        id: portalThread.queue_id,
                        campaign_id: portalThread.campaign_id,
                        contact_id: portalThread.contact_id,
                        domain_id: portalThread.domain_id,
                    };
                    console.log('[inbound] Matched reply to an existing Inbox conversation');
                }
            }
        }

        // Legacy fallback for past queue records that stored only Resend's
        // API UUID rather than the RFC Message-ID.
        if (inReplyTo) {
            const { data: q } = await supabase
                .from('email_queue')
                .select('id, campaign_id, contact_id, domain_id')
                .eq('resend_id', inReplyTo)
                .maybeSingle();
            queueItem = queueItem || q;
            if (queueItem) console.log('[inbound] Matched by In-Reply-To');
        }

        // ── No queue match — acknowledge but do not pollute the reply Inbox ──
        if (!queueItem) {
            console.warn('[inbound] No In-Reply-To match for:', fromEmail, '— ignored');
            return NextResponse.json({
                received: true,
                matched: false,
                stored: false,
                reason: inReplyToMessageId
                    ? 'the original campaign Message-ID has not been stored yet; run Repair replies or send a new campaign after enabling email.sent'
                    : 'this message has no In-Reply-To header; use Reply on the original campaign email instead of composing a new email',
            });
        }

        // Optional Outlook copy. Set INBOX_FORWARD_TO_EMAIL in Vercel; only
        // matched campaign replies are forwarded, never unrelated inbound mail.
        await forwardMatchedReply({ resend, fromEmail, toEmail, subject, body });

        // ── Find or create inbox thread (matched path) ────────────────
        const { data: existing } = await supabase
            .from('inbox_threads')
            .select('id, message_count')
            .eq('contact_id', queueItem.contact_id)
            .eq('domain_id', queueItem.domain_id)
            .maybeSingle();

        let threadId: string;

        if (existing) {
            const { error: updateThreadError } = await supabase.from('inbox_threads').update({
                last_message: body.substring(0, 200),
                last_at: new Date().toISOString(),
                is_read: false,
                message_count: existing.message_count + 1,
            }).eq('id', existing.id);
            if (updateThreadError) throw new Error(`Thread update failed: ${updateThreadError.message}`);
            threadId = existing.id;
        } else {
            // Get original campaign content for the thread
            const { data: queueData } = await supabase
                .from('email_queue')
                .select('sent_at, campaigns(subject_a, body_html), contacts(name)')
                .eq('id', queueItem.id)
                .single();

            let originalBody = '';
            let originalSubject = subject;

            if (queueData) {
                const name = (queueData.contacts as any)?.name || 'there';
                const camp = queueData.campaigns as any;
                originalSubject = camp?.subject_a || subject;
                const rawBody = camp?.body_html || '';
                const rendered = rawBody.replace(/\{name\}/gi, name);
                originalBody = rendered.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || originalSubject;
            }

            const { data: thread, error } = await supabase
                .from('inbox_threads')
                .insert({
                    contact_id: queueItem.contact_id,
                    domain_id: queueItem.domain_id,
                    campaign_id: queueItem.campaign_id,
                    queue_id: queueItem.id,
                    subject: originalSubject,
                    last_message: body.substring(0, 200),
                    last_at: new Date().toISOString(),
                    is_read: false,
                    message_count: 1,
                })
                .select('id')
                .single();

            if (error || !thread) {
                return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
            }
            threadId = thread.id;

            // Insert the original sent email as the first outbound message
            if (originalBody) {
                await supabase.from('inbox_messages').insert({
                    thread_id: threadId,
                    direction: 'outbound',
                    body: originalBody,
                });
            }
        }

        // ── Insert the inbound reply ──────────────────────────────────
        // Supabase Realtime pushes this to the Inbox page instantly
        const { error: messageError } = await supabase.from('inbox_messages').insert({
            thread_id: threadId,
            direction: 'inbound',
            body,
            resend_id: inboundMessageId || null,
        });
        if (messageError) throw new Error(`Reply insert failed: ${messageError.message}`);

        // A real reply is the strongest stop signal. Cancel all remaining
        // automated follow-ups for this contact on this sending domain.
        await supabase.from('email_queue').update({
            status: 'cancelled',
            error_message: 'Follow-up stopped: recipient replied',
        }).eq('contact_id', queueItem.contact_id)
          .eq('domain_id', queueItem.domain_id)
          .eq('status', 'queued')
          .gt('sequence_step', 1);

        console.log(`[inbound] Reply captured: thread=${threadId} from=${fromEmail}`);
        return NextResponse.json({ received: true, matched: true, threadId });

    } catch (err: any) {
        console.error('[inbound] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function extractEmail(input: any): string {
    if (!input) return '';
    if (typeof input === 'string') {
        const match = input.match(/<(.+?)>/);
        return match ? match[1].trim() : input.trim();
    }
    if (typeof input === 'object') {
        return input.address || input.email || '';
    }
    return '';
}

function normalizeMessageId(input: unknown): string {
    const value = String(input || '').trim();
    if (!value) return '';
    const bracketed = value.match(/<[^<>]+>/);
    return bracketed ? bracketed[0] : value;
}

async function forwardMatchedReply({
    resend,
    fromEmail,
    toEmail,
    subject,
    body,
}: {
    resend: Resend;
    fromEmail: string;
    toEmail: string;
    subject: string;
    body: string;
}) {
    const forwardTo = process.env.INBOX_FORWARD_TO_EMAIL?.trim();
    if (!forwardTo) return;

    const forwardFrom = (
        process.env.INBOX_FORWARD_FROM_EMAIL ||
        process.env.INBOX_REPLY_FROM_EMAIL ||
        process.env.REPLY_TO_EMAIL ||
        toEmail
    ).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forwardFrom)) {
        console.warn('[inbound] Outlook forwarding skipped: configure a verified sender address');
        return;
    }

    const { error } = await resend.emails.send({
        from: `Campaign Reply <${forwardFrom}>`,
        to: [forwardTo],
        subject: `[Campaign reply] ${subject}`,
        text: `From: ${fromEmail}\nReceived at: ${toEmail}\n\n${body}`,
    });
    if (error) console.warn('[inbound] Outlook forwarding failed:', error.message);
}
