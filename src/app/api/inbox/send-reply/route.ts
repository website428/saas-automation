import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { serverSupabase as supabase } from '@/lib/server-supabase';

/**
 * Same-origin Inbox reply endpoint.
 *
 * Keeping this in the Next.js app avoids browser-to-Supabase Edge Function
 * CORS/network failures while still sending with Resend on the server.
 */
export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_RECEIVING_API_KEY;
        if (!apiKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({ error: 'Server email configuration is incomplete' }, { status: 500 });
        }

        const { threadId, replyText } = await req.json();
        if (!threadId || typeof replyText !== 'string' || !replyText.trim()) {
            return NextResponse.json({ error: 'threadId and replyText are required' }, { status: 400 });
        }

        const { data: thread, error: threadError } = await supabase
            .from('inbox_threads')
            .select('*, contacts(name, email), domains(domain_name, from_email, sender_name)')
            .eq('id', threadId)
            .single();
        if (threadError || !thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

        const contact = Array.isArray(thread.contacts) ? thread.contacts[0] : thread.contacts;
        const domain = Array.isArray(thread.domains) ? thread.domains[0] : thread.domains;
        if (!contact?.email || !domain?.from_email) {
            return NextResponse.json({ error: 'Thread contact or sending domain is incomplete' }, { status: 400 });
        }

        const { data: latestInbound } = await supabase
            .from('inbox_messages')
            .select('resend_id')
            .eq('thread_id', threadId)
            .eq('direction', 'inbound')
            .not('resend_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const inReplyTo = normalizeMessageId(latestInbound?.resend_id || '');
        if (!inReplyTo.includes('@')) {
            return NextResponse.json({ error: 'This message has no valid email thread reference. Do not reply from this Inbox thread.' }, { status: 409 });
        }

        // Set INBOX_REPLY_FROM_EMAIL=reply@modelingflow.info in Vercel when
        // all human Inbox replies must be sent from that mailbox. Without it,
        // the sender remains the domain used for the original campaign.
        const inboxFromEmail = process.env.INBOX_REPLY_FROM_EMAIL?.trim();
        const fromEmail = inboxFromEmail || domain.from_email;
        const configuredSenderName = String(domain.sender_name || '').trim();
        const senderName = configuredSenderName && configuredSenderName.toLowerCase() !== 'prince gupta'
            ? configuredSenderName
            : 'FinaSoft Ventures LLP';
        const cleanSubject = String(thread.subject || '').replace(/^\s*re:\s*/i, '').trim();
        const resend = new Resend(apiKey);
        const { data: sent, error: sendError } = await resend.emails.send({
            from: `${senderName} <${fromEmail}>`,
            to: [contact.email],
            replyTo: (inboxFromEmail || process.env.REPLY_TO_EMAIL || `reply@${domain.domain_name}`).trim(),
            subject: `Re: ${cleanSubject || 'your message'}`,
            text: replyText.trim(),
            headers: { 'In-Reply-To': inReplyTo, References: inReplyTo },
        });
        if (sendError) return NextResponse.json({ error: sendError.message }, { status: 502 });

        // Store the RFC Message-ID, not only Resend's API ID. When the
        // recipient answers this message, Gmail/Outlook puts this exact value
        // in In-Reply-To so the inbound webhook can continue this thread.
        let outboundMessageId = '';
        if (sent?.id) {
            try {
                const { data: sentEmail, error: sentEmailError } = await resend.emails.get(sent.id);
                if (!sentEmailError) outboundMessageId = normalizeMessageId((sentEmail as any)?.message_id || '');
            } catch (messageIdError) {
                console.warn('[inbox/send-reply] Could not retrieve outbound Message-ID:', messageIdError);
            }
        }

        const { error: messageError } = await supabase.from('inbox_messages').insert({
            thread_id: threadId,
            direction: 'outbound',
            body: replyText.trim(),
            resend_id: outboundMessageId || sent?.id || null,
        });
        if (messageError) throw new Error(`Could not save sent reply: ${messageError.message}`);

        await supabase.from('inbox_threads').update({
            last_message: replyText.trim().slice(0, 200),
            last_at: new Date().toISOString(),
            message_count: Number(thread.message_count || 0) + 1,
        }).eq('id', threadId);

        return NextResponse.json({ success: true, resendId: sent?.id, threaded: true });
    } catch (error) {
        console.error('[inbox/send-reply]', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Reply could not be sent' }, { status: 500 });
    }
}

function normalizeMessageId(input: unknown): string {
    const value = String(input || '').trim();
    const bracketed = value.match(/<[^<>]+>/);
    return bracketed ? bracketed[0] : value;
}
