import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
    const secrets = [process.env.LANDING_PAGE_ADMIN_SECRET, process.env.MARKETING_WEBHOOK_SECRET].filter(Boolean);
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const supplied = request.headers.get("x-marketing-secret");
    return secrets.length > 0 && secrets.some((secret) => secret === supplied || secret === bearer);
}

export async function GET(request: NextRequest) {
    if (!process.env.LANDING_PAGE_ADMIN_SECRET && !process.env.MARKETING_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Add LANDING_PAGE_ADMIN_SECRET or MARKETING_WEBHOOK_SECRET in Vercel first." }, { status: 503 });
    }
    if (!authorized(request)) {
        return NextResponse.json({ error: "Invalid automation admin secret." }, { status: 401 });
    }

    try {
        const [pages, campaigns, domains, rule, recentEvent, recentQueue] = await Promise.all([
            serverSupabase.from("landing_pages").select("id,name,slug,status").eq("status", "published").order("updated_at", { ascending: false }).limit(5),
            serverSupabase.from("campaigns").select("id,name,status").eq("status", "active").order("created_at", { ascending: false }).limit(10),
            serverSupabase.from("domains").select("id,domain_name,from_email,status,health_score").in("status", ["warming", "warm"]).order("created_at", { ascending: false }).limit(10),
            serverSupabase.from("marketing_automation_rules").select("campaign_id,enabled,delay_minutes").eq("event_key", "lead_created").maybeSingle(),
            serverSupabase.from("marketing_event_log").select("event_key,status,campaign_id,created_at,error_message").eq("event_key", "lead_created").order("created_at", { ascending: false }).limit(1).maybeSingle(),
            serverSupabase.from("email_queue").select("id,status,scheduled_at,created_at,campaign_id").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);

        const databaseError = [pages.error, campaigns.error, domains.error, rule.error, recentEvent.error, recentQueue.error].find(Boolean);
        const linkedCampaign = rule.data?.campaign_id
            ? campaigns.data?.find((campaign) => campaign.id === rule.data?.campaign_id)
            : null;

        return NextResponse.json({
            ok: !databaseError,
            error: databaseError?.message || null,
            integrations: {
                appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL),
                supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
                resendApi: Boolean(process.env.RESEND_API_KEY),
                resendWebhook: Boolean(process.env.RESEND_WEBHOOK_SECRET),
                metaPixel: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
                razorpay: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
                cronSecret: Boolean(process.env.CRON_SECRET),
                publicLeadAutomation: process.env.PUBLIC_LEAD_AUTOMATION_ENABLED === "true",
            },
            resources: {
                pages: pages.data || [],
                campaigns: campaigns.data || [],
                domains: domains.data || [],
                leadRule: rule.data || null,
                linkedCampaign: linkedCampaign || null,
                recentLeadEvent: recentEvent.data || null,
                recentQueueItem: recentQueue.data || null,
            },
            checks: {
                database: !databaseError,
                sender: Boolean(process.env.RESEND_API_KEY && domains.data?.length),
                landingPage: Boolean(pages.data?.length),
                campaign: Boolean(campaigns.data?.length),
                automation: Boolean(rule.data?.enabled && rule.data?.campaign_id && linkedCampaign),
                endToEnd: Boolean(recentEvent.data?.campaign_id && recentQueue.data?.campaign_id === recentEvent.data?.campaign_id),
            },
        });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not check setup." }, { status: 500 });
    }
}
