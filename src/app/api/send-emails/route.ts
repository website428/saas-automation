import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';

type PersonalizableContact = {
    email: string;
    name: string | null;
    status: string;
    company_name: string | null;
    job_title: string | null;
    website: string | null;
    personalization: string | null;
    custom_subject: string | null;
    custom_body: string | null;
};

function personalize(template: string, contact: PersonalizableContact): string {
    const values: Record<string, string> = {
        name: contact.name || 'there',
        email: contact.email,
        company: contact.company_name || 'your company',
        company_name: contact.company_name || 'your company',
        job_title: contact.job_title || '',
        role: contact.job_title || '',
        website: contact.website || '',
        personalization: contact.personalization || '',
        personalized_line: contact.personalization || '',
    };
    return template.replace(/\{([a-z_]+)\}/gi, (match, key: string) => values[key.toLowerCase()] ?? match);
}

function isHtml(body: string): boolean {
    return /<\s*(html|body|div|p|table|td|a|span|strong|h[1-6])\b/i.test(body);
}

function htmlToText(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function addHtmlUnsubscribe(html: string, unsubscribeUrl: string): string {
    const unsubscribeAnchor = /<a\b([^>]*)href=(["'])[^"']*\2([^>]*)>([\s\S]*?unsubscribe[\s\S]*?)<\/a>/i;
    if (unsubscribeAnchor.test(html)) {
        return html.replace(unsubscribeAnchor, `<a$1href="${unsubscribeUrl}"$3>$4</a>`);
    }
    const footer = `<p style="margin:32px 0 0;font-size:12px;color:#666;text-align:center;">You received this email because you opted in. <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">Unsubscribe</a></p>`;
    return /<\/body>/i.test(html)
        ? html.replace(/<\/body>/i, `${footer}</body>`)
        : `${html}${footer}`;
}

function addTextUnsubscribe(text: string, unsubscribeUrl: string): string {
    return `${text.trim()}\n\nUnsubscribe: ${unsubscribeUrl}`;
}

/** Build a minimal HTML alternative without claiming inbox placement. */
function toMinimalHtml(plainText: string, unsubscribeUrl: string): string {
    const escaped = plainText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    // Use <p> + <div> — avoids the <pre> spam-filter pattern while still tracking opens
    const paragraphs = escaped
        .split(/\n\n+/)
        .map(para => `<p style="margin:0 0 12px 0;">${para.replace(/\n/g, '<br>')}</p>`)
        .join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:20px;font-family:Arial,sans-serif;font-size:14px;color:#000;background:#fff;">${paragraphs}<p style="margin:32px 0 0 0;font-size:11px;color:#888;">You received this email because you opted in. <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a></p></body></html>`;
}

// ── FAKE EMAIL CHECK USING DNS OVER HTTPS (Cloudflare) ──
async function isValidEmail(email: string): Promise<boolean> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    const domain = email.split('@')[1];
    if (!domain) return false;

    try {
        const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`, {
            headers: { 'accept': 'application/dns-json' }
        });
        const data = await res.json();
        return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
    } catch {
        return true;
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 500 });
        }
        // Initialise Resend only when a request is actually handled. Vercel
        // imports route modules during build, when runtime secrets may not be
        // available yet.
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { campaignId, force } = await req.json();
        // `force` only skips the scheduled_at time filter — it NEVER bypasses daily limits.
        // Daily limit is a hard wall enforced at every step.
        if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

        // Fetch campaign + domain
        const { data: campaign, error: cErr } = await supabase
            .from('campaigns')
            .select('*, domains(id, domain_name, from_email, sender_name, daily_limit, emails_sent_today, send_hour_start, send_hour_end)')
            .eq('id', campaignId)
            .single();
        if (cErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

        const domain = campaign.domains as any;
        if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });

        // ALWAYS Check Office Hours Window (in IST) - even on manual sends!
        const s = domain.send_hour_start ?? 9;
        const e = domain.send_hour_end ?? 20;
        const currentISTHour = new Date(Date.now() + 5.5 * 3600000).getUTCHours();
        
        const isOfficeHours = s <= e 
            ? (currentISTHour >= s && currentISTHour < e)
            : (currentISTHour >= s || currentISTHour < e); // Overnight shift
            
        if (!isOfficeHours) {
            return NextResponse.json({ error: `Outside office hours (Window: ${s}:00 to ${e}:00 IST)`, sent: 0 }, { status: 429 });
        }

        // ── HARD DAILY LIMIT — always enforced, force=true cannot bypass this ──
        if (domain.emails_sent_today >= domain.daily_limit) {
            return NextResponse.json({
                error: `Hard daily limit reached: ${domain.emails_sent_today}/${domain.daily_limit} sent today`,
                sent: 0
            }, { status: 429 });
        }

        // How many slots remain today — this is the absolute ceiling for this call
        const remainingSlots = domain.daily_limit - domain.emails_sent_today;

        // Cap batch at remaining slots, max 20 per cron call (keeps send pattern human-like)
        const batchSize = Math.min(remainingSlots, force ? 20 : 10);
        const nowIso = new Date().toISOString();

        // Build the query
        let query = supabase
            .from('email_queue')
            .select('*, contacts(email, name, status, company_name, job_title, website, personalization, custom_subject, custom_body)')
            .eq('campaign_id', campaignId)
            .eq('status', 'queued')
            .order('scheduled_at', { ascending: true })
            .limit(batchSize);

        // Apply schedule filter ONLY if not forced
        if (!force) {
            query = query.lte('scheduled_at', nowIso);
        }

        const { data: queued, error: qErr } = await query;

        if (qErr || !queued || queued.length === 0) {
            return NextResponse.json({ message: 'No emails ready to send right now', sent: 0 });
        }

        const fromName = domain.sender_name || process.env.SENDER_NAME || 'Prince Gupta';
        // Base URL for unsubscribe links — set NEXT_PUBLIC_APP_URL in env for production
        const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
        let sent = 0;
        const errors: string[] = [];

        for (const item of queued) {
            const contact = item.contacts as PersonalizableContact | null;
            if (!contact) continue;

            // A contact may opt out or bounce after the queue was created. Re-check at
            // send time so stale queue rows can never override suppression state.
            if (contact.status === 'unsubscribed' || contact.status === 'bounced') {
                await supabase.from('email_queue').update({
                    status: 'cancelled',
                    error_message: `Suppressed contact: ${contact.status}`,
                }).eq('id', item.id);
                continue;
            }

            // ── RE-FETCH LIVE COUNTER before each send (prevents race conditions
            //    when multiple cron calls run concurrently for different campaigns
            //    that share the same domain) ──
            const { data: freshDomain } = await supabase
                .from('domains')
                .select('emails_sent_today, daily_limit')
                .eq('id', domain.id)
                .single();

            if (freshDomain && freshDomain.emails_sent_today >= freshDomain.daily_limit) {
                // Hard cap hit mid-batch — stop immediately, don't send more
                errors.push(`Hard daily cap hit mid-batch (${freshDomain.emails_sent_today}/${freshDomain.daily_limit}). Stopping.`);
                break;
            }

            const { data: claimed } = await supabase.from('email_queue')
                .update({ status: 'sending' })
                .eq('id', item.id)
                .eq('status', 'queued')
                .select('id')
                .maybeSingle();
            if (!claimed) continue;

            const pickSubject = contact.custom_subject?.trim() || campaign.subject_a;
            const pickBody = contact.custom_body?.trim() || campaign.body_html;
            const finalSubject = personalize(pickSubject, contact);
            const finalBody = personalize(pickBody, contact);

            // Unsubscribe URL — one-click unsubscribe (CAN-SPAM / GDPR / Gmail policy)
            const unsubscribeUrl = `${appBaseUrl}/api/unsubscribe?cid=${item.contact_id}&qid=${item.id}`;

            let quotaReserved = false;
            try {
                // Reply-To: keep as the sending domain email so Resend inbound can intercept
                // the reply and route it to the dashboard Inbox (chat section).
                // If REPLY_TO_EMAIL is explicitly set in env, use that instead.
                const replyToEmail = process.env.REPLY_TO_EMAIL || domain.from_email;

                const emailPayload: any = {
                    from: `${fromName} <${domain.from_email}>`,
                    to: [contact.email],
                    reply_to: replyToEmail,
                    subject: finalSubject,
                    // List-Unsubscribe: required by Gmail bulk sender policy (Feb 2024) for >5k/day
                    // and strongly recommended for all bulk senders to avoid spam classification
                    headers: {
                        'List-Unsubscribe': `<${unsubscribeUrl}>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                    },
                    tags: [
                        { name: 'campaign_id', value: campaignId },
                        { name: 'contact_id', value: item.contact_id },
                    ],
                };
                if (isHtml(finalBody)) {
                    // Actual HTML template — inject unsubscribe footer if not already present
                    emailPayload.html = addHtmlUnsubscribe(finalBody, unsubscribeUrl);
                    emailPayload.text = addTextUnsubscribe(htmlToText(finalBody), unsubscribeUrl);
                } else {
                    // Keep a standards-compliant multipart message and a visible opt-out.
                    emailPayload.html = toMinimalHtml(finalBody, unsubscribeUrl);
                    emailPayload.text = addTextUnsubscribe(finalBody, unsubscribeUrl);
                }

                // ── CHECK FAKE MAIL FIRST ──
                const validMail = await isValidEmail(contact.email);
                if (!validMail) {
                    await supabase.from('email_queue').update({
                        status: 'failed',
                        error_message: 'Fake/Invalid Email (No MX Record)',
                        attempts: item.attempts + 1,
                    }).eq('id', item.id);
                    await supabase.from('contacts').update({ status: 'bounced' }).eq('id', item.contact_id);
                    errors.push(`${contact.email}: Fake/Invalid Email`);
                    continue; // Skip without actually bouncing the resend domain
                }

                const dailyLimit = Math.min(100, Math.max(1, Number(process.env.RESEND_DAILY_SEND_LIMIT) || 100));
                const monthlyLimit = Math.min(3000, Math.max(1, Number(process.env.RESEND_MONTHLY_SEND_LIMIT) || 3000));
                const { data: reserved, error: quotaError } = await supabase.rpc('reserve_resend_quota_slot', {
                    max_daily: dailyLimit,
                    max_monthly: monthlyLimit,
                });
                if (quotaError) {
                    await supabase.from('email_queue').update({
                        status: 'queued',
                        error_message: `Quota check failed: ${quotaError.message}`,
                    }).eq('id', item.id);
                    errors.push('Account quota could not be checked. Apply migration 016. Sending stopped safely.');
                    break;
                }
                if (!reserved) {
                    await supabase.from('email_queue').update({
                        status: 'queued',
                        error_message: 'Resend free-plan daily or monthly quota reached',
                    }).eq('id', item.id);
                    errors.push(`Account-wide Resend quota reached (${dailyLimit}/day, ${monthlyLimit}/month).`);
                    break;
                }
                quotaReserved = true;

                // Resend keeps idempotency keys for 24 hours, preventing a retry or
                // overlapping worker from delivering this queue item twice.
                const { data: resendData, error: resendErr } = await resend.emails.send(
                    emailPayload,
                    { idempotencyKey: `queue/${item.id}` },
                );
                if (resendErr) throw new Error(resendErr.message);
                // The provider accepted the message, so this slot is consumed even
                // if a later database update fails.
                quotaReserved = false;

                await supabase.from('email_queue').update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    resend_id: resendData?.id,
                    attempts: item.attempts + 1,
                }).eq('id', item.id);

                // Atomic increments — no stale reads
                await supabase.rpc('increment_domain_sent', { did: domain.id });
                await supabase.rpc('increment_campaign_sent', { cid: campaignId });

                sent++;
            } catch (err: any) {
                if (quotaReserved) await supabase.rpc('release_resend_quota_slot');
                errors.push(err.message);
                await supabase.from('email_queue').update({
                    status: 'failed',
                    error_message: err.message,
                    attempts: item.attempts + 1,
                }).eq('id', item.id);
            }

            // ── HUMAN-LIKE PACING: random delay between sends ──
            // Fixed 600ms looked like a bot pattern to spam filters.
            // Random 3–12 second gaps mimic how a human would send emails
            // and significantly reduce spam scoring from pattern detection.
            const minDelay = 3000;  // 3 seconds minimum
            const maxDelay = 12000; // 12 seconds maximum
            const delay = minDelay + Math.random() * (maxDelay - minDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Auto-complete if no queued emails remain
        const { count: remaining } = await supabase
            .from('email_queue')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .eq('status', 'queued');

        if ((remaining ?? 0) === 0 && sent > 0) {
            await supabase.from('campaigns').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
            }).eq('id', campaignId);
        }

        return NextResponse.json({ sent, errors, remaining });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
