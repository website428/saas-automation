// Supabase Edge Function: resend-inbound
// Handles INBOUND emails from Resend (when contacts reply to our emails)
// This is separate from process-webhook which handles outbound email events
//
// Deploy: supabase functions deploy resend-inbound --no-verify-jwt
// Set as the webhook URL in Resend Dashboard > Inbound Settings

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        // Resend email.received webhook structure:
        // { type: 'email.received', data: { email_id, from, to, subject, message_id, ... } }
        // NOTE: body text is NOT included in the webhook — must call GET /emails/receiving/{id}
        const inboundWebhookSecret = Deno.env.get('RESEND_INBOUND_WEBHOOK_SECRET')?.trim();
        const outboundWebhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')?.trim();
        const webhookSecret = inboundWebhookSecret || outboundWebhookSecret;
        if (!webhookSecret) return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { status: 500 });
        const rawBody = await req.text();
        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => { headers[key] = value; });
        let outer: any;
        try {
            outer = new Webhook(webhookSecret).verify(rawBody, headers);
        } catch {
            console.warn('[resend-inbound] Invalid Resend signature; using', inboundWebhookSecret ? 'RESEND_INBOUND_WEBHOOK_SECRET' : 'RESEND_WEBHOOK_SECRET fallback');
            return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
        }
        await supabase.rpc('record_resend_inbound_usage');
        const data = outer?.data ?? outer; // handle both nested and flat payloads

        // Optional clean-start guard. Set INBOX_RESET_AT to an ISO timestamp
        // immediately before clearing the Inbox. Resend retries created before
        // that timestamp are acknowledged but not written back into the Inbox.
        const resetAt = Deno.env.get('INBOX_RESET_AT');
        const eventCreatedAt = outer?.created_at || data?.created_at;
        if (resetAt && eventCreatedAt) {
            const resetTime = Date.parse(resetAt);
            const eventTime = Date.parse(eventCreatedAt);
            if (Number.isFinite(resetTime) && Number.isFinite(eventTime) && eventTime < resetTime) {
                console.log(`[resend-inbound] Ignoring pre-reset event ${eventCreatedAt}`);
                return new Response(
                    JSON.stringify({ received: true, ignored: 'before inbox reset' }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
        }

        // Debug: log full payload keys
        console.log('[resend-inbound] Raw payload type:', outer?.type, '| data keys:', Object.keys(data).join(', '));

        // Normalize from/to — can be string "Name <email>" or object { address, name }
        const fromEmail: string = extractEmail(data.from);
        const toEmail: string = Array.isArray(data.to)
            ? extractEmail(data.to[0])
            : extractEmail(data.to ?? '');
        const subject: string = data.subject || '(no subject)';
        const emailId: string = data.email_id || data.id || '';
        // RFC Message-ID from the sender's email client. Keeping this lets the
        // portal's send-reply function reply in the same external email thread.
        const inboundMessageId = normalizeMessageId(data.message_id || '');

        console.log(`[resend-inbound] from=${fromEmail} to=${toEmail} subject="${subject}" email_id=${emailId}`);

        if (!fromEmail) {
            return new Response(JSON.stringify({ error: 'No from email' }), { status: 400 });
        }

        // ── Get reply body ─────────────────────────────────────────────
        // Resend does NOT include body in the webhook payload.
        // We MUST call GET /emails/receiving/{email_id} to retrieve text/html.
        let body = '';
        let inReplyTo: string | null = null;
        let inReplyToMessageId: string | null = null;

        // Step 1: Try inline fields (future-proofing — Resend may add these)
        if (data.text) {
            body = data.text;
        } else if (data.plain) {
            body = data.plain;
        } else if (data.html) {
            body = stripHtml(data.html);
        }

        // Also extract In-Reply-To from inline headers if present
        const inlineHeaders: Record<string, string> = data.headers || {};
        const inReplyToRawInline =
            inlineHeaders['in-reply-to'] ||
            inlineHeaders['In-Reply-To'] ||
            data.in_reply_to ||
            data.inReplyTo ||
            '';
        if (inReplyToRawInline) {
            inReplyToMessageId = normalizeMessageId(inReplyToRawInline);
            const uuidMatch = inReplyToRawInline.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            inReplyTo = uuidMatch ? uuidMatch[0] : null;
        }

        // Step 2: Fetch full email from Resend Receiving API
        // Correct endpoint: GET /emails/receiving/{email_id} (NOT /emails/{id})
        // This returns: html, text, headers (including In-Reply-To), message_id
        if (emailId) {
            // Keep outbound sending and inbound reading scoped separately. A
            // sending_access key cannot call /emails/receiving/{id}.
            const resendApiKey = Deno.env.get('RESEND_RECEIVING_API_KEY') || Deno.env.get('RESEND_API_KEY') || '';
            if (resendApiKey) {
                try {
                    const url = `https://api.resend.com/emails/receiving/${emailId}`;
                    const r = await fetch(url, {
                        headers: { 'Authorization': `Bearer ${resendApiKey}` },
                    });
                    const raw = await r.text();
                    console.log(`[resend-inbound] GET ${url} → ${r.status}: ${raw.substring(0, 300)}`);
                    if (r.ok) {
                        const d = JSON.parse(raw);

                        // Get body from API response (overrides empty inline fields)
                        if (!body && d.text) body = d.text;
                        if (!body && d.html) body = stripHtml(d.html);

                        // Extract In-Reply-To from API response headers (most reliable)
                        const apiHeaders: Record<string, string> = d.headers || {};
                        const inReplyToRawApi =
                            apiHeaders['in-reply-to'] ||
                            apiHeaders['In-Reply-To'] ||
                            '';
                        if (inReplyToRawApi) {
                            inReplyToMessageId = inReplyToMessageId || normalizeMessageId(inReplyToRawApi);
                        }
                        if (!inReplyTo && inReplyToRawApi) {
                            const uuidMatch = inReplyToRawApi.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                            inReplyTo = uuidMatch ? uuidMatch[0] : null;
                            console.log('[resend-inbound] In-Reply-To from API headers:', inReplyTo);
                        }
                    }
                } catch (e) {
                    console.warn('[resend-inbound] Receiving API error:', e);
                }
            }
        }

        // Step 3: Strip quoted reply text — handles Gmail, Outlook, Apple Mail
        if (body) {
            body = body
                .replace(/\r?\nOn .{10,200}wrote:\s*[\s\S]*/i, '')
                .replace(/On .{10,200}wrote:[\s\S]*/i, '')
                .replace(/\r?\nFrom:[\s\S]*/i, '')
                .replace(/\r?\n--\s*\r?\n[\s\S]*/, '')
                .replace(/\r?\n_{5,}[\s\S]*/, '')
                .trim();

            const lines = body.split('\n');
            body = lines.filter(l => !l.trimStart().startsWith('>')).join('\n').trim();
        }

        // Fallback only if truly empty
        if (!body) body = '(reply received — content unavailable)';

        // ── 1. Find contact by email ────────────────────────────────────
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', fromEmail)
            .limit(1);
        const contact = contacts?.[0] ?? null;

        // ── 2. Find the latest queue item (3-tier fallback) ────────────
        let queueItem: any = null;

        // Tier 1: RFC Message-ID matching (most precise)
        if (inReplyToMessageId) {
            const { data: q } = await supabase
                .from('email_queue')
                .select('id, campaign_id, contact_id, domain_id')
                .eq('outbound_message_id', inReplyToMessageId)
                .maybeSingle();
            queueItem = q;
            if (queueItem) console.log('[resend-inbound] Matched by outbound RFC Message-ID');
        }

        // Legacy fallback for older queue rows.
        if (inReplyTo) {
            const { data: q } = await supabase
                .from('email_queue')
                .select('id, campaign_id, contact_id, domain_id')
                .eq('resend_id', inReplyTo)
                .maybeSingle();
            queueItem = queueItem || q;
            if (queueItem) console.log('[resend-inbound] Matched by In-Reply-To');
        }

        // Tier 2: Most recent sent email to this contact
        if (!queueItem && contact) {
            const { data: q } = await supabase
                .from('email_queue')
                .select('id, campaign_id, contact_id, domain_id')
                .eq('contact_id', contact.id)
                .in('status', ['sent', 'delivered', 'opened', 'clicked'])
                .order('sent_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            queueItem = q;
            if (queueItem) console.log('[resend-inbound] Matched by contact_id');
        }

        // Tier 3: Join via contacts table by email
        if (!queueItem) {
            const { data: q } = await supabase
                .from('email_queue')
                .select('id, campaign_id, contact_id, domain_id, contacts!inner(email)')
                .eq('contacts.email', fromEmail)
                .in('status', ['sent', 'delivered', 'opened', 'clicked'])
                .order('sent_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            queueItem = q;
            if (queueItem) console.log('[resend-inbound] Matched by email join');
        }

        // ── Ignore unrelated inbound mail ──────────────────────────────
        if (!queueItem) {
            console.warn('[resend-inbound] No sent-email match for:', fromEmail, '— ignored');
            return new Response(JSON.stringify({
                received: true,
                matched: false,
                stored: false,
                reason: 'not a reply to a tracked sent email',
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // ── 3. Find or create inbox thread ─────────────────────────────
        const { data: existing } = await supabase
            .from('inbox_threads')
            .select('id, message_count')
            .eq('contact_id', queueItem.contact_id)
            .eq('domain_id', queueItem.domain_id)
            .maybeSingle();

        let threadId: string;

        if (existing) {
            // Update existing thread — mark as unread
            await supabase.from('inbox_threads').update({
                last_message: body.substring(0, 200),
                last_at: new Date().toISOString(),
                is_read: false,
                message_count: existing.message_count + 1,
            }).eq('id', existing.id);
            threadId = existing.id;
        } else {
            // Create new thread
            const { data: thread, error } = await supabase
                .from('inbox_threads')
                .insert({
                    contact_id: queueItem.contact_id,
                    domain_id: queueItem.domain_id,
                    campaign_id: queueItem.campaign_id,
                    queue_id: queueItem.id,
                    subject: subject,
                    last_message: body.substring(0, 200),
                    last_at: new Date().toISOString(),
                    is_read: false,
                    message_count: 1,
                })
                .select('id')
                .single();

            if (error || !thread) {
                console.error('Failed to create thread:', error);
                return new Response(JSON.stringify({ error: 'Failed to create thread' }), { status: 500 });
            }
            threadId = thread.id;
        }

        // ── 4. Fetch original email content for new threads ────────────
        let originalBody = '';
        let originalSubject = subject;
        if (!existing) {
            const { data: queueData } = await supabase
                .from('email_queue')
                .select('sent_at, campaigns(subject_a, body_html), contacts(name)')
                .eq('id', queueItem.id)
                .single();

            if (queueData) {
                const name = (queueData.contacts as any)?.name || 'there';
                const camp = queueData.campaigns as any;
                originalSubject = camp?.subject_a || subject;
                const rawBody = camp?.body_html || '';
                // Render {name} placeholder + strip HTML tags for plain text preview
                const rendered = rawBody.replace(/\{name\}/gi, name);
                originalBody = rendered.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
                    || originalSubject;
            }
        }

        // Update thread subject to the actual sent subject (not "Re: ..." from reply)
        if (!existing && originalSubject) {
            await supabase.from('inbox_threads')
                .update({ subject: originalSubject })
                .eq('id', threadId!);
        }

        // ── 5. Insert outbound message (original sent email) for new threads ─
        if (!existing && originalBody) {
            await supabase.from('inbox_messages').insert({
                thread_id: threadId,
                direction: 'outbound',
                body: originalBody,
            });
        }

        // ── 6. Insert inbound message (the reply) ──────────────────────
        // Supabase Realtime will push this to any subscribed Inbox page clients
        await supabase.from('inbox_messages').insert({
            thread_id: threadId,
            direction: 'inbound',
            body: body || '(reply received)',
            resend_id: inboundMessageId || null,
        });

        await supabase.from('email_queue').update({
            status: 'cancelled',
            error_message: 'Follow-up stopped: recipient replied',
        }).eq('contact_id', queueItem.contact_id)
          .eq('domain_id', queueItem.domain_id)
          .eq('status', 'queued')
          .gt('sequence_step', 1);

        console.log(`Reply captured: thread=${threadId} from=${fromEmail}`);

        return new Response(JSON.stringify({ received: true, matched: true, threadId }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err: any) {
        console.error('Inbound handler error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
});

/** Strip HTML tags and decode entities to get plain text */
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

// Normalize email — handles both "Name <email@domain.com>" strings and objects
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
