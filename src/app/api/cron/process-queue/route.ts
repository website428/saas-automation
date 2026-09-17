import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/server-supabase';

// This endpoint is designed to be triggered by an external cron service (like cron-job.org)
// every 2-5 minutes. It runs in the background and processes all active campaigns safely.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max execution

export async function GET(req: NextRequest) {
    try {
        // Vercel Cron automatically uses the Bearer form.  External schedulers
        // can use either that form, an X-Cron-Secret header, or HTTP Basic Auth
        // with username `cron` and the CRON_SECRET as its password.
        const authHeader = req.headers.get('authorization');
        const expectedSecret = process.env.CRON_SECRET;
        const expectedBasic = expectedSecret
            ? `Basic ${Buffer.from(`cron:${expectedSecret}`).toString('base64')}`
            : null;
        const isAuthorized = !expectedSecret
            || authHeader === `Bearer ${expectedSecret}`
            || authHeader === expectedBasic
            || req.headers.get('x-cron-secret') === expectedSecret;

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get the current base URL of the application
        const origin = req.nextUrl.origin;

        // 1. Fetch all currently active campaigns
        // This is a server-only worker.  It must use the service-role client,
        // not the browser/anonymous client, otherwise RLS can hide active
        // campaigns from the scheduler in production.
        const { data: campaigns, error } = await serverSupabase
            .from('campaigns')
            .select('id')
            .eq('status', 'active');

        if (error) throw error;
        if (!campaigns || campaigns.length === 0) {
            return NextResponse.json({ message: 'No active campaigns found.' });
        }

        const results = [];
        
        // 2. Loop through each active campaign and process its queue
        for (const camp of campaigns) {
            try {
                // Call the existing send-emails API. 
                // force: false ensures it perfectly respects scheduled delays and daily limits!
                const res = await fetch(`${origin}/api/send-emails`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ campaignId: camp.id, force: false }),
                });
                
                const data = await res.json();
                results.push({ campaignId: camp.id, ...data });
            } catch (err: any) {
                results.push({ campaignId: camp.id, error: err.message });
            }
        }

        return NextResponse.json({ success: true, processed: results });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
