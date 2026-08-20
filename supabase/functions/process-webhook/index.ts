// Supabase Edge Function: process-webhook
// Receives Resend webhook events and updates DB in real-time
// Deploy: supabase functions deploy process-webhook --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        const body = await req.text();
        const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
        if (!webhookSecret) {
            return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { status: 500 });
        }

        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => { headers[key] = value; });
        let payload: any;
        try {
            payload = new Webhook(webhookSecret).verify(body, headers);
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
        }

        const { type: eventType, data } = payload;
        const resendId = data?.email_id || data?.id;
        const toEmail = data?.to?.[0];

        console.log(`Webhook event: ${eventType} | resend_id: ${resendId}`);

        // Find the queue item by resend_id
        const { data: queueItem } = await supabase
            .from('email_queue')
            .select('id, campaign_id, contact_id, domain_id, status')
            .eq('resend_id', resendId)
            .maybeSingle();

        // Store raw event in webhook_events
        await supabase.from('webhook_events').insert({
            resend_id: resendId,
            event_type: eventType,
            email_to: toEmail,
            domain_id: queueItem?.domain_id ?? null,
            campaign_id: queueItem?.campaign_id ?? null,
            contact_id: queueItem?.contact_id ?? null,
            metadata: data,
        });

        // ── Granular status mapping ──────────────────────────────
        // Each event updates the email_queue row to its latest status
        const statusMap: Record<string, string> = {
            'email.sent': 'sent',
            'email.delivered': 'delivered',
            'email.opened': 'opened',
            'email.clicked': 'clicked',
            'email.bounced': 'bounced',
            'email.complained': 'complained',
        };

        const newStatus = statusMap[eventType];

        if (queueItem && newStatus) {
            const previousStatus = queueItem.status as string;
            const shouldApply =
                (newStatus === 'sent' && previousStatus === 'sending') ||
                (newStatus === 'delivered' && ['sending', 'sent'].includes(previousStatus)) ||
                (newStatus === 'opened' && ['sending', 'sent', 'delivered'].includes(previousStatus)) ||
                (newStatus === 'clicked' && previousStatus !== 'clicked' && !['bounced', 'complained', 'failed', 'cancelled'].includes(previousStatus)) ||
                (newStatus === 'bounced' && !['bounced', 'complained', 'failed', 'cancelled'].includes(previousStatus)) ||
                (newStatus === 'complained' && previousStatus !== 'complained');

            if (!shouldApply) {
                return new Response(JSON.stringify({ received: true, duplicate: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Update queue row status
            await supabase.from('email_queue')
                .update({
                    status: newStatus,
                    ...(newStatus === 'sent' ? { sent_at: new Date().toISOString() } : {}),
                    ...(newStatus === 'bounced' ? { error_message: 'Bounced' } : {}),
                })
                .eq('id', queueItem.id);

            // Campaign counter increments
            if (newStatus === 'delivered') {
                await supabase.rpc('increment_campaign_sent', { cid: queueItem.campaign_id });
                await updateDomainHealth(queueItem.domain_id);
            }
            if (newStatus === 'opened') {
                await supabase.rpc('increment_campaign_opened', { cid: queueItem.campaign_id });
                await updateDomainHealth(queueItem.domain_id);
            }
            if (newStatus === 'clicked') {
                await supabase.rpc('increment_campaign_clicked', { cid: queueItem.campaign_id });
            }
            if (newStatus === 'bounced') {
                await supabase.from('contacts')
                    .update({ status: 'bounced' })
                    .eq('id', queueItem.contact_id);
                await supabase.rpc('increment_campaign_bounced', { cid: queueItem.campaign_id });
                await updateDomainHealth(queueItem.domain_id);
            }
            if (newStatus === 'complained') {
                await supabase.from('contacts')
                    .update({ status: 'unsubscribed' })
                    .eq('id', queueItem.contact_id);
                await supabase.from('domains')
                    .update({ status: 'paused', health_score: 0 })
                    .eq('id', queueItem.domain_id);
            }
        }

        // ── Inbox: Handle inbound reply (email.received from Resend inbound) ─
        // This fires when someone replies to our email (via Reply-To: inbound address)
        // The data contains: from, subject, message_id, tags (with queue_id)
        if (eventType === 'email.received') {
            await supabase.rpc('record_resend_inbound_usage');
            await handleInboundReceived(data);
        }

        // ── Inbox: Handle reply events (legacy fallback) ──────────────
        // When someone replies to our email, create/update an inbox thread
        if (eventType === 'email.replied' && queueItem) {
            await handleReply(queueItem, data);
        }

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        console.error('Webhook handler error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
});

// ── Handler: Resend inbound email.received ─────────────────────────────
// Fires when a contact replies to our email (via Reply-To inbound address)
// data.tags contains queue_id which links the reply to the original email
async function handleInboundReceived(data: any) {
    // Extract queue_id from tags (we set this when sending)
    const tags: Array<{ name: string; value: string }> = data?.tags || [];
    const queueIdTag = tags.find(t => t.name === 'queue_id');
    const queueId = queueIdTag?.value;

    // The reply body -- Resend inbound includes text in data.text
    const replyBody = data?.text || data?.html || data?.subject || '(reply received)';
    const fromEmail = data?.from?.match(/<(.+?)>/)?.[1] || data?.from || '';
    const subject = data?.subject || '';

    let queueItem: any = null;

    if (queueId) {
        // Find the queue item via tag
        const { data: q } = await supabase
            .from('email_queue')
            .select('id, campaign_id, contact_id, domain_id')
            .eq('id', queueId)
            .maybeSingle();
        queueItem = q;
    } else if (fromEmail) {
        // Fallback: search by sender email if no queue_id tag
        const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', fromEmail)
            .maybeSingle();

        if (contact) {
            const { data: q } = await supabase
                .from('email_queue')
                .select('id, campaign_id, contact_id, domain_id')
                .eq('contact_id', contact.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            queueItem = q;
        }
    }

    if (!queueItem) {
        console.log('email.received: could not match to a queue item, from:', fromEmail);
        return;
    }

    await handleReply(queueItem, { text: replyBody, subject });
}

async function handleReply(

    queueItem: { id: string; campaign_id: string; contact_id: string; domain_id: string },
    data: any
) {
    // Find or create inbox thread for this contact + domain
    const { data: existing } = await supabase
        .from('inbox_threads')
        .select('id, message_count')
        .eq('contact_id', queueItem.contact_id)
        .eq('domain_id', queueItem.domain_id)
        .maybeSingle();

    const replyBody = data?.text || data?.body || data?.html || '(reply received)';
    const subject = data?.subject || '';

    if (existing) {
        // Update existing thread
        await supabase.from('inbox_threads').update({
            last_message: replyBody.substring(0, 200),
            last_at: new Date().toISOString(),
            is_read: false,
            message_count: existing.message_count + 1,
        }).eq('id', existing.id);

        // Add inbound message
        await supabase.from('inbox_messages').insert({
            thread_id: existing.id,
            direction: 'inbound',
            body: replyBody,
        });
    } else {
        // Create new thread
        const { data: thread } = await supabase.from('inbox_threads').insert({
            contact_id: queueItem.contact_id,
            domain_id: queueItem.domain_id,
            campaign_id: queueItem.campaign_id,
            queue_id: queueItem.id,
            subject: subject,
            last_message: replyBody.substring(0, 200),
            last_at: new Date().toISOString(),
            is_read: false,
            message_count: 1,
        }).select('id').single();

        if (thread) {
            await supabase.from('inbox_messages').insert({
                thread_id: thread.id,
                direction: 'inbound',
                body: replyBody,
            });
        }
    }
}

async function updateDomainHealth(domainId: string) {
    const { data: stats } = await supabase
        .from('email_queue')
        .select('status')
        .eq('domain_id', domainId)
        .in('status', ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed']);

    if (!stats || stats.length === 0) return;
    
    const total = stats.length;
    const bounced = stats.filter(s => s.status === 'bounced').length;
    const opened = stats.filter(s => s.status === 'opened' || s.status === 'clicked').length;
    const complained = stats.filter(s => s.status === 'complained').length;

    const bounceRate = bounced / total;
    const openRate = opened / total;
    const complaintRate = complained / total;

    const bounceScore = Math.max(0, 100 - bounceRate * 1000); 
    const openScore = Math.min(100, openRate * 200); 
    const complaintScore = Math.max(0, 100 - complaintRate * 10000); 

    const healthScore = Math.round(bounceScore * 0.4 + openScore * 0.25 + complaintScore * 0.35);
    const bounceRatePct = bounceRate * 100;

    await supabase.from('domains').update({
        bounce_rate: bounceRatePct,
        health_score: healthScore,
        ...(total >= 25 && bounceRate >= 0.02 ? { status: 'paused' } : {}),
    }).eq('id', domainId);
}
