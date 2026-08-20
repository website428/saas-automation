import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Webhook } from 'standardwebhooks';

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
        const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
        if (!webhookSecret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        const rawBody = await req.text();
        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => { headers[key] = value; });
        let outer: any;
        try {
            outer = new Webhook(webhookSecret).verify(rawBody, headers);
        } catch {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        await supabase.rpc('record_resend_inbound_usage');
        // Resend wraps inbound payloads in { type, data } — unwrap if needed
        const data = outer?.data ?? outer;

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

        // Extract UUID from SES message-ID: match pattern xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
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

        // Resend webhook payload NEVER includes the email body.
        // We MUST call the Receiving API to get it.
        // Correct endpoint: GET /emails/receiving/{email_id}
        if (emailId) {
            try {
                const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
                    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
                });
                const rawText = await r.text();
                console.log(`[inbound] GET /emails/receiving/${emailId} → ${r.status}: ${rawText.substring(0, 300)}`);
                if (r.ok) {
                    const d = JSON.parse(rawText);
                    if (d.text) body = d.text;
                    else if (d.html) body = stripHtml(d.html);

                    // Also grab In-Reply-To from API response headers — extract UUID from SES format
                    const apiHeaders: Record<string, string> = d.headers || {};
                    const irtFromApi = apiHeaders['in-reply-to'] || apiHeaders['In-Reply-To'] || '';
                    if (!inReplyTo && irtFromApi) {
                        const uuidMatch = irtFromApi.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                        inReplyTo = uuidMatch ? uuidMatch[0] : null;
                        console.log(`[inbound] In-Reply-To UUID from API: ${inReplyTo}`);
                    }
                } else {
                    console.warn(`[inbound] Receiving API returned ${r.status}: ${rawText.substring(0, 200)}`);
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

        // ── Find contact ──────────────────────────────────────────────
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', fromEmail)
            .limit(1);
        const contact = contacts?.[0] ?? null;

        // ── Find matching email_queue item (3-tier fallback) ──────────
        let queueItem: any = null;

        // Tier 1: Match by In-Reply-To (most precise — Resend stores UUID as resend_id)
        if (inReplyTo) {
            const { data: q } = await supabase
                .from('email_queue')
                .select('id, campaign_id, contact_id, domain_id')
                .eq('resend_id', inReplyTo)
                .maybeSingle();
            queueItem = q;
            if (queueItem) console.log('[inbound] Matched by In-Reply-To');
        }

        // Tier 2: Match by contact_id (most recent sent/delivered/opened email)
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
            if (queueItem) console.log('[inbound] Matched by contact_id');
        }

        // Tier 3: Join through contacts table by email address
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
            if (queueItem) console.log('[inbound] Matched by email join');
        }

        // ── No queue match — still save to inbox using a fallback domain ──
        if (!queueItem) {
            console.warn('[inbound] No queue item matched for:', fromEmail, '— saving as unmatched reply');

            // Try to find ANY domain to attach this to (use the "to" address domain)
            const toDomain = toEmail.split('@')[1] || '';
            const { data: domain } = await supabase
                .from('domains')
                .select('id')
                .ilike('domain_name', `%${toDomain}%`)
                .limit(1)
                .maybeSingle();

            if (!domain) {
                // Can't save without a domain_id (FK constraint)
                return NextResponse.json({ received: true, matched: false, reason: 'No domain found' });
            }

            // Upsert a contact if not known
            let contactId: string | null = contact?.id || null;
            if (!contactId) {
                const { data: newContact } = await supabase
                    .from('contacts')
                    .insert({ email: fromEmail, name: fromEmail.split('@')[0], status: 'pending' })
                    .select('id')
                    .single();
                contactId = newContact?.id || null;
            }

            if (!contactId) {
                return NextResponse.json({ received: true, matched: false, reason: 'Could not create contact' });
            }

            // Find or create thread
            const { data: existingUnmatched } = await supabase
                .from('inbox_threads')
                .select('id, message_count')
                .eq('contact_id', contactId)
                .eq('domain_id', domain.id)
                .maybeSingle();

            let unmatchedThreadId: string;
            if (existingUnmatched) {
                await supabase.from('inbox_threads').update({
                    last_message: body.substring(0, 200),
                    last_at: new Date().toISOString(),
                    is_read: false,
                    message_count: existingUnmatched.message_count + 1,
                }).eq('id', existingUnmatched.id);
                unmatchedThreadId = existingUnmatched.id;
            } else {
                const { data: newThread, error: tErr } = await supabase
                    .from('inbox_threads')
                    .insert({
                        contact_id: contactId,
                        domain_id: domain.id,
                        campaign_id: null,
                        queue_id: null,
                        subject,
                        last_message: body.substring(0, 200),
                        last_at: new Date().toISOString(),
                        is_read: false,
                        message_count: 1,
                    })
                    .select('id')
                    .single();
                if (tErr || !newThread) {
                    return NextResponse.json({ received: true, matched: false, reason: 'Thread insert failed' });
                }
                unmatchedThreadId = newThread.id;
            }

            await supabase.from('inbox_messages').insert({
                thread_id: unmatchedThreadId,
                direction: 'inbound',
                body,
            });

            console.log(`[inbound] Unmatched reply saved: thread=${unmatchedThreadId} from=${fromEmail}`);
            return NextResponse.json({ received: true, matched: false, threadId: unmatchedThreadId });
        }

        // ── Find or create inbox thread (matched path) ────────────────
        const { data: existing } = await supabase
            .from('inbox_threads')
            .select('id, message_count')
            .eq('contact_id', queueItem.contact_id)
            .eq('domain_id', queueItem.domain_id)
            .maybeSingle();

        let threadId: string;

        if (existing) {
            await supabase.from('inbox_threads').update({
                last_message: body.substring(0, 200),
                last_at: new Date().toISOString(),
                is_read: false,
                message_count: existing.message_count + 1,
            }).eq('id', existing.id);
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
        await supabase.from('inbox_messages').insert({
            thread_id: threadId,
            direction: 'inbound',
            body,
        });

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
