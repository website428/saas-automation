import { NextRequest, NextResponse } from "next/server";
import { marketingEvents } from "@/lib/marketing-automation";
import { serverSupabase } from "@/lib/server-supabase";

function authorized(request: NextRequest) {
    const secret = process.env.MARKETING_WEBHOOK_SECRET;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    return Boolean(secret && (request.headers.get("x-marketing-secret") === secret || bearer === secret));
}

export async function GET(request: NextRequest) {
    if (!process.env.MARKETING_WEBHOOK_SECRET) return NextResponse.json({ error: "MARKETING_WEBHOOK_SECRET is not configured." }, { status: 503 });
    if (!authorized(request)) return NextResponse.json({ error: "Invalid automation admin secret." }, { status: 401 });
    const [rulesResult, campaignsResult] = await Promise.all([
        serverSupabase.from("marketing_automation_rules").select("id,event_key,campaign_id,enabled,delay_minutes,stop_events,updated_at").order("event_key"),
        serverSupabase.from("campaigns").select("id,name,status").in("status", ["active", "draft"]).order("created_at", { ascending: false }),
    ]);
    return NextResponse.json({ ok: true, migration_required: Boolean(rulesResult.error), rules: rulesResult.data || [], campaigns: campaignsResult.data || [], integrations: { marketing_events: true, meta: Boolean(process.env.META_APP_SECRET && process.env.META_ACCESS_TOKEN && process.env.META_WEBHOOK_VERIFY_TOKEN), razorpay: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) } });
}

export async function POST(request: NextRequest) {
    if (!process.env.MARKETING_WEBHOOK_SECRET) return NextResponse.json({ error: "MARKETING_WEBHOOK_SECRET is not configured." }, { status: 503 });
    if (!authorized(request)) return NextResponse.json({ error: "Invalid automation admin secret." }, { status: 401 });
    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    if (!marketingEvents.includes(body.event_key)) return NextResponse.json({ error: "Unsupported automation event." }, { status: 400 });
    const delayMinutes = Math.max(0, Math.min(43200, Number(body.delay_minutes ?? 2)));
    const { data, error } = await serverSupabase.from("marketing_automation_rules").upsert({ event_key: body.event_key, campaign_id: body.campaign_id || null, enabled: body.enabled !== false, delay_minutes: delayMinutes, stop_events: Array.isArray(body.stop_events) ? body.stop_events.filter((event: unknown) => typeof event === "string") : [], updated_at: new Date().toISOString() }, { onConflict: "event_key" }).select("id,event_key,campaign_id,enabled,delay_minutes,stop_events,updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rule: data });
}
