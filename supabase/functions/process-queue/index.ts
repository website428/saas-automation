// Supabase Edge Function: process-queue (v5 – Fixed)
// ─────────────────────────────────────────────────────────────────────────────
// Processes the email_queue table and sends emails via Resend.
//   • Warmup curve: Day 1 = 20, +20%/day, capped at 100 account-wide
//   • Business hours: Mon–Sat, 9 AM – 8 PM IST
//   • Domain time windows: each domain has send_hour_start / send_hour_end
//   • Role-based email filter (inbox protection)
//   • MX record validation (fake email detection)
//   • Multipart emails (HTML + plain-text fallback)
//   • Human-like jitter between sends (300–700ms)
//   • Force mode: bypasses time windows for immediate sends

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

type PersonalizableContact = {
    name: string | null;
    email: string;
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

// ── WARMUP CURVE ─────────────────────────────────────────────────────────────
function getDailyLimit(warmupDay: number): number {
    const raw = 20 * Math.pow(1.20, warmupDay - 1);
    return Math.max(5, Math.min(100, Math.floor(raw)));
}

function healthMultiplier(bounceRate: number, openRate: number): number {
    if (bounceRate >= 0.15) return 0.25;
    if (bounceRate >= 0.08) return 0.5;
    if (bounceRate >= 0.05) return 0.75;
    if (bounceRate >= 0.02) return 1.0;
    if (openRate >= 0.20) return 1.10;
    return 1.0;
}

function getAdaptiveLimit(warmupDay: number, bounceRate: number, openRate: number): number {
    const base = getDailyLimit(warmupDay);
    const mult = healthMultiplier(bounceRate, openRate);
    if (mult === 0) return 0;
    return Math.max(1, Math.min(100, Math.floor(base * mult)));
}

function computeHealth(bounceRate: number, openRate: number, complaintRate: number): number {
    const b = Math.max(0, 100 - bounceRate * 1000);
    const o = Math.min(100, openRate * 200);
    const c = Math.max(0, 100 - complaintRate * 10000);
    return Math.round(b * 0.4 + o * 0.25 + c * 0.35);
}

// ── BUSINESS HOURS + DOMAIN TIME WINDOWS ─────────────────────────────────────
function currentISTHour(): number {
    const ist = new Date(Date.now() + 5.5 * 3600000);
    return ist.getUTCHours();
}

function isBusinessHours(): boolean {
    const ist = new Date(Date.now() + 5.5 * 3600000);
    const h = ist.getUTCHours();
    const d = ist.getUTCDay();
    return d !== 0 && h >= 9 && h < 20; // Mon–Sat, 9 AM–8 PM IST
}

function isInDomainWindow(sendHourStart: number, sendHourEnd: number): boolean {
    const h = currentISTHour();
    return h >= (sendHourStart ?? 9) && h < (sendHourEnd ?? 20);
}

// ── HTML UTILITIES ────────────────────────────────────────────────────────────
function isHtml(s: string): boolean {
    return /<\s*(html|body|div|p|table|td|a|span|strong|h[1-6])\b/i.test(s);
}

function htmlToText(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&rarr;/g, '->')
        .replace(/&middot;/g, '.')
        .replace(/&#[0-9]+;/g, '')
        .replace(/^[ \t]+/g, ' ')
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

// ── EMAIL VALIDATION ──────────────────────────────────────────────────────────
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
        return true; // assume valid if DNS check fails
    }
}

// ── ROLE-BASED EMAIL FILTER ───────────────────────────────────────────────────
const ROLE_BASED_PREFIXES = ['info', 'admin', 'support', 'sales', 'contact', 'hello', 'billing', 'webmaster', 'jobs', 'hr', 'marketing', 'team'];
function isRoleBasedOrRisky(email: string): boolean {
    const prefix = email.split('@')[0].toLowerCase();
    return ROLE_BASED_PREFIXES.includes(prefix);
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const log = {
        sent: 0,
        retried: 0,
        completed: 0,
        skipped: 0,
        dedup_skipped: 0,
        window_skipped: 0,
        errors: [] as string[],
    };

    try {
        // Parse body — support both cron (empty body) and manual invocation
        let force_campaign_id: string | null = null;
        let isForced = false;
        try {
            const body = await req.json();
            force_campaign_id = body?.force_campaign_id ?? null;
            isForced = !!force_campaign_id;
        } catch {
            // Cron trigger — no body, not forced
        }

        // ── 1. Business hours gate (skip if forced) ────────────────────────────
        if (!isForced && !isBusinessHours()) {
            return new Response(JSON.stringify({ skipped: 'Outside business hours (IST Mon–Sat 9am–8pm)' }), {
                status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }

        // ── 2. Fetch active domains ────────────────────────────────────────────
        const { data: activeDomains } = await supabase
            .from('domains')
            .select('id, domain_name, from_email, sender_name, warmup_day, daily_limit, emails_sent_today, health_score, send_hour_start, send_hour_end')
            .in('status', ['warming', 'warm'])
            .gt('daily_limit', 0)
            .gt('health_score', 30);

        for (const domain of (activeDomains || [])) {
            // ── Domain time window check ───────────────────────────────────────
            if (!isForced && !isInDomainWindow(domain.send_hour_start ?? 9, domain.send_hour_end ?? 20)) {
                log.window_skipped++;
                continue;
            }

            // Manual sends may bypass the time window, but never the reputation cap.
            const slots = Math.max(0, domain.daily_limit - domain.emails_sent_today);
            if (slots <= 0) continue;

            // ── Fetch queued emails for this domain ────────────────────────────
            let query = supabase
                .from('email_queue')
                .select('*, campaigns(name, subject_a, body_html), contacts(name, email, status, company_name, job_title, website, personalization, custom_subject, custom_body)')
                .eq('domain_id', domain.id)
                .eq('status', 'queued')
                .lte('scheduled_at', new Date().toISOString())
                .order('scheduled_at', { ascending: true })
                .limit(slots * 2); // 2× to account for skips

            if (isForced && force_campaign_id) {
                query = query.eq('campaign_id', force_campaign_id);
            }

            const { data: queued } = await query;
            let sentThisDomain = 0;

            for (const item of (queued || [])) {
                if (sentThisDomain >= slots) break;

                const contact = item.contacts as PersonalizableContact | null;
                const campaign = item.campaigns as { name: string; subject_a: string; body_html: string } | null;
                if (!contact || !campaign) continue;

                if (contact.status === 'unsubscribed' || contact.status === 'bounced') {
                    await supabase.from('email_queue').update({
                        status: 'cancelled',
                        error_message: `Suppressed contact: ${contact.status}`,
                    }).eq('id', item.id);
                    log.skipped++;
                    continue;
                }

                // ── Role-based filter ──────────────────────────────────────────
                if (isRoleBasedOrRisky(contact.email)) {
                    await supabase.from('email_queue').update({
                        status: 'failed',
                        error_message: 'Skipped: Risky Role-Based Email',
                        attempts: item.attempts + 1,
                    }).eq('id', item.id);
                    log.skipped++;
                    continue;
                }

                // ── MX record validation ───────────────────────────────────────
                const validMail = await isValidEmail(contact.email);
                if (!validMail) {
                    await supabase.from('email_queue').update({
                        status: 'failed',
                        error_message: 'Fake/Invalid Email (No MX Record)',
                        attempts: item.attempts + 1,
                    }).eq('id', item.id);
                    await supabase.from('contacts').update({ status: 'bounced' }).eq('id', item.contact_id);
                    log.errors.push(`${contact.email}: Fake/Invalid Email`);
                    continue;
                }

                // ── Mark as sending ────────────────────────────────────────────
                const { data: claimed } = await supabase.from('email_queue')
                    .update({ status: 'sending' })
                    .eq('id', item.id)
                    .eq('status', 'queued')
                    .select('id')
                    .maybeSingle();
                if (!claimed) {
                    log.dedup_skipped++;
                    continue;
                }

                // ── Build email payload ────────────────────────────────────────
                const finalSubject = personalize(contact.custom_subject?.trim() || campaign.subject_a, contact);
                const finalBody = personalize(contact.custom_body?.trim() || campaign.body_html, contact);

                const inboundAddress = `reply@${domain.domain_name}`;
                const appBaseUrl = (Deno.env.get('APP_BASE_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || '').replace(/\/$/, '');
                if (!appBaseUrl) {
                    await supabase.from('email_queue').update({
                        status: 'queued',
                        error_message: 'APP_BASE_URL is required so unsubscribe links point to the application',
                    }).eq('id', item.id);
                    log.errors.push('APP_BASE_URL is not configured. Sending stopped safely.');
                    break;
                }
                const unsubUrl = `${appBaseUrl}/api/unsubscribe?cid=${item.contact_id}&qid=${item.id}`;

                const payload: any = {
                    from: `${domain.sender_name || domain.domain_name} <${domain.from_email}>`,
                    to: [contact.email],
                    subject: finalSubject,
                    reply_to: inboundAddress,
                    tags: [{ name: 'queue_id', value: item.id }],
                    headers: {
                        'List-Unsubscribe': `<${unsubUrl}>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                    },
                };

                if (isHtml(finalBody)) {
                    payload.html = addHtmlUnsubscribe(finalBody, unsubUrl);
                    payload.text = addTextUnsubscribe(htmlToText(finalBody), unsubUrl);
                } else {
                    payload.text = addTextUnsubscribe(finalBody, unsubUrl);
                }

                let quotaReserved = false;
                try {
                    const dailyLimit = Math.min(100, Math.max(1, Number(Deno.env.get('RESEND_DAILY_SEND_LIMIT')) || 100));
                    const monthlyLimit = Math.min(3000, Math.max(1, Number(Deno.env.get('RESEND_MONTHLY_SEND_LIMIT')) || 3000));
                    const { data: reserved, error: quotaError } = await supabase.rpc('reserve_resend_quota_slot', {
                        max_daily: dailyLimit,
                        max_monthly: monthlyLimit,
                    });
                    if (quotaError) {
                        await supabase.from('email_queue').update({
                            status: 'queued',
                            error_message: `Quota check failed: ${quotaError.message}`,
                        }).eq('id', item.id);
                        log.errors.push('Account quota could not be checked. Apply migration 016. Sending stopped safely.');
                        break;
                    }
                    if (!reserved) {
                        await supabase.from('email_queue').update({
                            status: 'queued',
                            error_message: 'Resend free-plan daily or monthly quota reached',
                        }).eq('id', item.id);
                        log.errors.push(`Account-wide Resend quota reached (${dailyLimit}/day, ${monthlyLimit}/month).`);
                        break;
                    }
                    quotaReserved = true;

                    // ── SEND THE EMAIL ─────────────────────────────────────────
                    const { data: sent, error: sendErr } = await resend.emails.send(
                        payload,
                        { idempotencyKey: `queue/${item.id}` },
                    );
                    if (sendErr) throw new Error(sendErr.message);
                    quotaReserved = false;

                    // ── Mark as sent ───────────────────────────────────────────
                    await supabase.from('email_queue').update({
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                        resend_id: sent?.id,
                        attempts: item.attempts + 1,
                    }).eq('id', item.id);

                    // ── Atomic counters ────────────────────────────────────────
                    await supabase.rpc('increment_domain_sent', { did: domain.id });
                    await supabase.rpc('increment_campaign_sent', { cid: item.campaign_id });

                    sentThisDomain++;
                    log.sent++;

                    // ── Human-like jitter ──────────────────────────────────────
                    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));

                } catch (err: any) {
                    if (quotaReserved) await supabase.rpc('release_resend_quota_slot');
                    const attempts = item.attempts + 1;
                    const backoff = Math.pow(3, attempts) * 5 * 60 * 1000;
                    await supabase.from('email_queue').update({
                        status: attempts >= 3 ? 'failed' : 'queued',
                        error_message: err.message,
                        attempts,
                        scheduled_at: attempts < 3
                            ? new Date(Date.now() + backoff).toISOString()
                            : item.scheduled_at,
                    }).eq('id', item.id);
                    log.errors.push(`${contact.email}: ${err.message}`);
                    if (attempts < 3) log.retried++;
                }
            }
        }

        // ── 3. Auto-complete drained campaigns ─────────────────────────────────
        const { data: activeCampaigns } = await supabase
            .from('campaigns').select('id').eq('status', 'active');

        for (const c of (activeCampaigns || [])) {
            const { count: remaining } = await supabase
                .from('email_queue').select('id', { count: 'exact', head: true })
                .eq('campaign_id', c.id).eq('status', 'queued');

            const { count: activeAutomationRules } = await supabase
                .from('marketing_automation_rules')
                .select('id', { count: 'exact', head: true })
                .eq('campaign_id', c.id)
                .eq('enabled', true);

            if ((remaining ?? 0) === 0 && (activeAutomationRules ?? 0) === 0) {
                const { count: sentCount } = await supabase
                    .from('email_queue').select('id', { count: 'exact', head: true })
                    .eq('campaign_id', c.id).eq('status', 'sent');

                await supabase.from('campaigns').update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    sent_count: sentCount ?? 0,
                }).eq('id', c.id);
                log.completed++;
            }
        }

        // ── 4. Log run ─────────────────────────────────────────────────────────
        await supabase.from('autopilot_log').insert({
            sent: log.sent,
            retried: log.retried,
            completed: log.completed,
            skipped: `dedup:${log.dedup_skipped} window:${log.window_skipped}`,
            errors: log.errors.length > 0 ? log.errors : null,
        });

        return new Response(JSON.stringify({ success: true, ...log }), {
            status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });

    } catch (err: any) {
        console.error('process-queue error:', err);
        log.errors.push(err.message);
        try { await supabase.from('autopilot_log').insert(log); } catch { /* ignore */ }
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
});
