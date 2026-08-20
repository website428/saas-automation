import { NextRequest, NextResponse } from "next/server";
import { processMarketingEvent } from "@/lib/marketing-automation";
import { serverSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    return Boolean(secret && (request.headers.get("x-cron-secret") === secret || bearer === secret));
}

async function run(request: NextRequest) {
    if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
    if (!authorized(request)) return NextResponse.json({ error: "Invalid cron secret." }, { status: 401 });
    const { data: contacts, error } = await serverSupabase.from("contacts").select("id,email,name,company_name,trial_started_at,paid_at,status,tags").not("trial_started_at", "is", null).is("paid_at", null).not("status", "in", "(unsubscribed,bounced)").limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const now = Date.now();
    const results: unknown[] = [];
    for (const contact of contacts || []) {
        const ageDays = Math.floor((now - new Date(contact.trial_started_at).getTime()) / 86400000);
        const event = ageDays >= 14 ? "trial_expired" : ageDays >= 13 ? "trial_day_13" : ageDays >= 11 ? "trial_day_11" : null;
        if (!event) continue;
        try {
            results.push(await processMarketingEvent({ email: contact.email, name: contact.name || undefined, company_name: contact.company_name || undefined, event, source: "lifecycle-cron", event_id: `lifecycle:${contact.id}:${event}`, metadata: { trial_age_days: ageDays } }));
        } catch (eventError) {
            results.push({ email: contact.email, event, error: eventError instanceof Error ? eventError.message : "Lifecycle event failed" });
        }
    }
    return NextResponse.json({ ok: true, checked: contacts?.length || 0, processed: results.length, results });
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
