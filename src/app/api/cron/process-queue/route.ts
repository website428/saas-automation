import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// This endpoint is designed to be triggered by an external cron service (like cron-job.org)
// every 2-5 minutes. It runs in the background and processes all active campaigns safely.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max execution

export async function GET(req: NextRequest) {
    try {
        // Optional: If you want to secure this, you can require a specific header or query param.
        // For Vercel Cron Jobs, they automatically send an Authorization header matching CRON_SECRET.
        const authHeader = req.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get the current base URL of the application
        const origin = req.nextUrl.origin;

        // 1. Fetch all currently active campaigns
        const { data: campaigns, error } = await supabase
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
