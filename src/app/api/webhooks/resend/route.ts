import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { supabase } from '@/lib/supabase';

// This Next.js route handles Resend webhooks when deployed to Vercel.
// For Supabase-only: use the process-webhook Edge Function instead.



export async function POST(req: NextRequest) {
    try {
        const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
        if (!webhookSecret) {
            return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        }

        const wh = new Webhook(webhookSecret);
        const body = await req.text();
        const headers: Record<string, string> = {};
        req.headers.forEach((v, k) => { headers[k] = v; });

        let payload: any;
        try {
            payload = wh.verify(body, headers) as any;
        } catch {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const { type: eventType, data } = payload;
        const resendId = data?.email_id || data?.id;
        const toEmail = data?.to?.[0];

        // Find queue item
        const { data: queueItem } = await supabase
            .from('email_queue')
            .select('id, campaign_id, contact_id, domain_id, status')
            .eq('resend_id', resendId)
            .maybeSingle();

        // Store event
        await supabase.from('webhook_events').insert({
            resend_id: resendId,
            event_type: eventType,
            email_to: toEmail,
            domain_id: queueItem?.domain_id ?? null,
            campaign_id: queueItem?.campaign_id ?? null,
            contact_id: queueItem?.contact_id ?? null,
            metadata: data,
        });

        if (!queueItem) {
            return NextResponse.json({ received: true, note: 'Queue item not matched' });
        }

        switch (eventType) {
            case 'email.sent':
            case 'email.delivered':
                // Only increment stats if it hasn't already been marked as sent/delivered
                if (queueItem.status === 'queued') {
                    await supabase.from('email_queue')
                        .update({ status: 'sent', sent_at: new Date().toISOString() })
                        .eq('id', queueItem.id);
                        
                    // Increment campaign sent count via RPC correctly
                    await supabase.rpc('increment_campaign_sent', { cid: queueItem.campaign_id });
                } else if (eventType === 'email.delivered' && ['sending', 'sent'].includes(queueItem.status)) {
                    await supabase.from('email_queue')
                        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
                        .eq('id', queueItem.id);
                }
                break;

            case 'email.opened': {
                const openedAt = data?.created_at || new Date().toISOString();
                const userAgent = data?.user_agent || null;
                const ipAddress = data?.ip_address || null;

                // Update queue status to 'opened' (only if not already opened/clicked)
                if (queueItem.status === 'sent' || queueItem.status === 'delivered') {
                    await supabase.from('email_queue').update({
                        status: 'opened',
                        opened_at: openedAt,
                    }).eq('id', queueItem.id);
                    // Increment campaign counter only on first open
                    await supabase.rpc('increment_campaign_opened', { cid: queueItem.campaign_id });
                }

                // Always log every open event to email_opens table (tracks repeated opens too)
                await supabase.from('email_opens').insert({
                    queue_id: queueItem.id,
                    contact_id: queueItem.contact_id,
                    campaign_id: queueItem.campaign_id,
                    domain_id: queueItem.domain_id,
                    opened_at: openedAt,
                    user_agent: userAgent,
                    ip_address: ipAddress,
                });
                break;
            }

            case 'email.clicked':
                if (queueItem.status !== 'clicked' && queueItem.status !== 'failed' && queueItem.status !== 'bounced') {
                    await supabase.from('email_queue').update({ status: 'clicked' }).eq('id', queueItem.id);
                    await supabase.rpc('increment_campaign_clicked', { cid: queueItem.campaign_id });
                }
                break;

            case 'email.bounced':
                if (!['failed', 'bounced', 'complained', 'cancelled'].includes(queueItem.status)) {
                    await supabase.from('email_queue')
                        .update({ status: 'bounced', error_message: 'Bounced' })
                        .eq('id', queueItem.id);
                    await supabase.from('contacts')
                        .update({ status: 'bounced' })
                        .eq('id', queueItem.contact_id);
                    await supabase.rpc('increment_campaign_bounced', { cid: queueItem.campaign_id });

                    // ⭐ Auto-Pause Logic (Subdomain Protection)
                    const { data: campStats } = await supabase
                        .from('campaigns')
                        .select('sent_count, bounced_count')
                        .eq('id', queueItem.campaign_id)
                        .single();
                        
                    if (campStats) {
                        const totalBounces = campStats.bounced_count;
                        const totalSent = campStats.sent_count;
                        const bounceRate = totalSent > 0 ? totalBounces / totalSent : 0;

                        // Stop early: continuing above 2% bounces compounds reputation damage.
                        const MIN_SAMPLE_SIZE = 25;
                        const MAX_BOUNCE_RATE = 0.02;

                        if (totalSent >= MIN_SAMPLE_SIZE && bounceRate > MAX_BOUNCE_RATE) {
                            await supabase.from('campaigns')
                                .update({ status: 'paused' })
                                .eq('id', queueItem.campaign_id);
                            await supabase.from('domains')
                                .update({ status: 'paused' })
                                .eq('id', queueItem.domain_id);
                        }
                    }
                }
                break;

            case 'email.complained':
                await supabase.from('email_queue')
                    .update({ status: 'complained', error_message: 'Spam complaint' })
                    .eq('id', queueItem.id);
                await supabase.from('contacts')
                    .update({ status: 'unsubscribed' })
                    .eq('id', queueItem.contact_id);
                await supabase.from('domains')
                    .update({ status: 'paused', health_score: 0 })
                    .eq('id', queueItem.domain_id);
                break;
        }

        return NextResponse.json({ received: true, event: eventType });
    } catch (err: any) {
        console.error('Webhook error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
