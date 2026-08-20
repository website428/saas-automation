import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

// This endpoint should be triggered once a day at midnight.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all domains
        const { data: domains, error: domainsErr } = await supabase.from('domains').select('*');
        if (domainsErr) throw domainsErr;

        const results = [];
        
        for (const domain of domains || []) {
            const todayStr = new Date().toISOString().split('T')[0];

            // Safety check: If we already reset this domain today, skip it!
            // This prevents the limits from increasing multiple times if the cron runs twice.
            if (domain.last_reset_date === todayStr) {
                results.push({ domain: domain.domain_name, status: 'already_reset_today' });
                continue;
            }

            let newStatus = domain.status;
            let newLimit = domain.daily_limit;
            let newWarmupDay = domain.warmup_day;

            // If the domain is in the warming phase, slowly ramp up its sending limit
            if (newStatus === 'warming') {
                newWarmupDay = (newWarmupDay || 0) + 1;
                // Increase gradually only while list health remains safe.
                newLimit = domain.bounce_rate >= 2
                    ? Math.max(5, Math.floor((newLimit || 20) * 0.5))
                    : Math.floor((newLimit || 20) * 1.2);

                // Safe maximum limit for a warmed domain
                if (newLimit >= 100) {
                    newLimit = 100;
                    newStatus = 'warm'; // Domain is fully warmed
                }

                if (domain.bounce_rate >= 2) {
                    newStatus = 'paused';
                }
            }

            // Reset today's sent count to 0 and apply any warmup changes
            const updates = {
                emails_sent_today: 0,
                status: newStatus,
                daily_limit: newLimit,
                warmup_day: newWarmupDay,
                last_reset_date: new Date().toISOString().split('T')[0]
            };

            const { error: updateErr } = await supabase
                .from('domains')
                .update(updates)
                .eq('id', domain.id);

            if (updateErr) {
                results.push({ domain: domain.domain_name, error: updateErr.message });
            } else {
                results.push({ domain: domain.domain_name, ...updates });
            }
        }

        return NextResponse.json({ success: true, processed: results });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
