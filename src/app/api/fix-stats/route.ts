import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const { data: campaigns, error: campErr } = await supabase.from('campaigns').select('id');
        if (campErr) throw campErr;

        for (const camp of campaigns || []) {
            const { data: queueItems } = await supabase
                .from('email_queue')
                .select('status')
                .eq('campaign_id', camp.id);
            
            if (!queueItems) continue;

            let sentCount = 0;
            let openedCount = 0;
            let clickedCount = 0;
            let bouncedCount = 0;

            for (const item of queueItems) {
                if (['sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'complained'].includes(item.status)) {
                    // Any of these mean it was sent out of our system
                    sentCount++;
                }
                
                if (item.status === 'opened') openedCount++;
                if (item.status === 'clicked') {
                    // if it was clicked, it also counts as opened
                    openedCount++;
                    clickedCount++;
                }
                if (item.status === 'failed' || item.status === 'bounced') bouncedCount++;
            }

            // Also check webhook_events if we want to be hyper-accurate, but queue item status is our source of truth now.

            await supabase.from('campaigns').update({
                sent_count: sentCount,
                opened_count: openedCount,
                clicked_count: clickedCount,
                bounced_count: bouncedCount
            }).eq('id', camp.id);
        }

        return NextResponse.json({ success: true, message: 'Stats successfully synced from email queue records.' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
