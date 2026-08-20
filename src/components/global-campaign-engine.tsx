"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export default function GlobalCampaignEngine() {
    const isRunning = useRef(false);

    useEffect(() => {
        // Runs every 15 seconds in the background as long as the dashboard is open.
        // This processes ALL active campaigns automatically, respecting schedules and limits.
        const interval = setInterval(async () => {
            if (isRunning.current) return;
            isRunning.current = true;
            try {
                // Find all active campaigns
                const { data: campaigns } = await supabase
                    .from('campaigns')
                    .select('id')
                    .eq('status', 'active');
                
                if (campaigns && campaigns.length > 0) {
                    // Process them sequentially to avoid rate-limiting the Vercel API
                    for (const campaign of campaigns) {
                        try {
                            await fetch('/api/send-emails', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                // force: false ensures it respects domain daily limits and scheduled_at times
                                body: JSON.stringify({ campaignId: campaign.id, force: false }),
                            });
                        } catch (e) {
                            console.error(`Error processing campaign ${campaign.id}:`, e);
                        }
                    }
                }
            } catch (e) {
                console.error('Global Engine Error:', e);
            } finally {
                isRunning.current = false;
            }
        }, 15000);

        return () => clearInterval(interval);
    }, []);

    return null;
}
