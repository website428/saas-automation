// Supabase Edge Function: send-reply
// Sends a reply email via Resend in the same thread
// Deploy: supabase functions deploy send-reply --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
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
        const { threadId, replyText } = await req.json();
        if (!threadId || !replyText) {
            return new Response(JSON.stringify({ error: 'threadId and replyText required' }), { status: 400 });
        }

        // Fetch thread with contact and domain details
        const { data: thread } = await supabase
            .from('inbox_threads')
            .select('*, contacts(name, email), domains(domain_name, from_email, sender_name)')
            .eq('id', threadId)
            .single();

        if (!thread) {
            return new Response(JSON.stringify({ error: 'Thread not found' }), { status: 404 });
        }

        const contact = thread.contacts as any;
        const domain = thread.domains as any;

        // Find the original email's resend_id for threading (In-Reply-To header)
        let inReplyTo = '';
        if (thread.queue_id) {
            const { data: queueRow } = await supabase
                .from('email_queue')
                .select('resend_id')
                .eq('id', thread.queue_id)
                .maybeSingle();
            if (queueRow?.resend_id) {
                inReplyTo = queueRow.resend_id;
            }
        }

        // Send via Resend
        const emailPayload: any = {
            from: `${domain?.sender_name || domain?.domain_name} <${domain?.from_email}>`,
            to: [contact?.email],
            reply_to: `reply@${domain.domain_name}`,
            subject: `Re: ${thread.subject || ''}`,
            text: replyText,
        };

        // Add threading headers if we have the original resend_id
        if (inReplyTo) {
            emailPayload.headers = {
                'In-Reply-To': `<${inReplyTo}@resend.dev>`,
                'References': `<${inReplyTo}@resend.dev>`,
            };
        }

        const dailyLimit = Math.min(100, Math.max(1, Number(Deno.env.get('RESEND_DAILY_SEND_LIMIT')) || 100));
        const monthlyLimit = Math.min(3000, Math.max(1, Number(Deno.env.get('RESEND_MONTHLY_SEND_LIMIT')) || 3000));
        const { data: reserved, error: quotaError } = await supabase.rpc('reserve_resend_quota_slot', {
            max_daily: dailyLimit,
            max_monthly: monthlyLimit,
        });
        if (quotaError) {
            return new Response(JSON.stringify({ error: `Quota check failed: ${quotaError.message}` }), { status: 500 });
        }
        if (!reserved) {
            return new Response(JSON.stringify({ error: 'Resend free-plan daily or monthly quota reached' }), { status: 429 });
        }

        const { data: sent, error: sendError } = await resend.emails.send(emailPayload);
        if (sendError) {
            await supabase.rpc('release_resend_quota_slot');
            return new Response(JSON.stringify({ error: sendError.message }), { status: 500 });
        }

        // Store in inbox_messages
        await supabase.from('inbox_messages').insert({
            thread_id: threadId,
            direction: 'outbound',
            body: replyText,
            resend_id: sent?.id || null,
        });

        // Update thread
        await supabase.from('inbox_threads').update({
            last_message: replyText.substring(0, 200),
            last_at: new Date().toISOString(),
            message_count: thread.message_count + 1,
        }).eq('id', threadId);

        return new Response(JSON.stringify({ success: true, resendId: sent?.id }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err: any) {
        console.error('Send reply error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
});
