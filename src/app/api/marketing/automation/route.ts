import { NextRequest, NextResponse } from "next/server";
import { marketingEvents } from "@/lib/marketing-automation";
import { serverSupabase } from "@/lib/server-supabase";
import { LandingPage } from "@/lib/landing-pages";

function authorized(request: NextRequest) {
    const secrets = [process.env.LANDING_PAGE_ADMIN_SECRET, process.env.MARKETING_WEBHOOK_SECRET].filter(Boolean);
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    return secrets.length > 0 && secrets.some(secret => request.headers.get("x-marketing-secret") === secret || bearer === secret);
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeSlug(value: unknown) {
    return clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function landingPageResponse(request: NextRequest) {
    const id = request.nextUrl.searchParams.get("id");
    if (id) {
        const { data, error } = await serverSupabase.from("landing_pages").select("*").eq("id", id).single();
        if (error || !data) return NextResponse.json({ error: "Landing page not found." }, { status: 404 });
        const { data: sections, error: sectionError } = await serverSupabase.from("landing_page_sections").select("id,page_id,section_type,sort_order,content").eq("page_id", id).order("sort_order");
        if (sectionError) return NextResponse.json({ error: sectionError.message }, { status: 500 });
        return NextResponse.json({ page: { ...data, sections: sections || [] } });
    }
    const { data, error } = await serverSupabase.from("landing_pages").select("*").order("updated_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pages: data || [] });
}

async function saveLandingPage(body: { action?: string; id?: string; page?: Partial<LandingPage> }) {
    const input = body.page || {};
    const status = input.status === "published" || input.status === "archived" ? input.status : "draft";
    const fields = {
        name: clean(input.name, 120) || "Untitled landing page",
        slug: safeSlug(input.slug) || `campaign-${Date.now()}`,
        status,
        seo_title: clean(input.seo_title, 160) || clean(input.name, 160) || "Campaign landing page",
        seo_description: clean(input.seo_description, 320),
        updated_at: new Date().toISOString(),
        published_at: status === "published" ? new Date().toISOString() : null,
    };
    let page: any;
    if (body.id) {
        const result = await serverSupabase.from("landing_pages").update(fields).eq("id", body.id).select("*").single();
        if (result.error || !result.data) throw result.error || new Error("Landing page not found.");
        page = result.data;
        const { error } = await serverSupabase.from("landing_page_sections").delete().eq("page_id", body.id);
        if (error) throw error;
    } else {
        const result = await serverSupabase.from("landing_pages").insert(fields).select("*").single();
        if (result.error || !result.data) throw result.error || new Error("Could not create landing page.");
        page = result.data;
    }
    const sections = Array.isArray(input.sections) ? input.sections.map((section: any, index: number) => ({
        page_id: page.id,
        section_type: section.section_type || "hero",
        sort_order: index,
        content: section.content && typeof section.content === "object" ? section.content : {},
    })) : [];
    if (sections.length) {
        const { error } = await serverSupabase.from("landing_page_sections").insert(sections);
        if (error) throw error;
    }
    const { data: savedSections, error: loadError } = await serverSupabase.from("landing_page_sections").select("id,page_id,section_type,sort_order,content").eq("page_id", page.id).order("sort_order");
    if (loadError) throw loadError;
    return { ...page, sections: savedSections || [] };
}

export async function GET(request: NextRequest) {
    if (!process.env.MARKETING_WEBHOOK_SECRET && !process.env.LANDING_PAGE_ADMIN_SECRET) return NextResponse.json({ error: "MARKETING_WEBHOOK_SECRET or LANDING_PAGE_ADMIN_SECRET is not configured." }, { status: 503 });
    if (!authorized(request)) return NextResponse.json({ error: "Invalid automation admin secret." }, { status: 401 });
    if (request.nextUrl.searchParams.get("resource") === "landing-pages") return landingPageResponse(request);
    const [rulesResult, campaignsResult] = await Promise.all([
        serverSupabase.from("marketing_automation_rules").select("id,event_key,campaign_id,enabled,delay_minutes,stop_events,updated_at").order("event_key"),
        serverSupabase.from("campaigns").select("id,name,status").in("status", ["active", "draft"]).order("created_at", { ascending: false }),
    ]);
    return NextResponse.json({ ok: true, migration_required: Boolean(rulesResult.error), rules: rulesResult.data || [], campaigns: campaignsResult.data || [], integrations: { marketing_events: true, meta: Boolean(process.env.META_APP_SECRET && process.env.META_ACCESS_TOKEN && process.env.META_WEBHOOK_VERIFY_TOKEN), razorpay: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) } });
}

export async function POST(request: NextRequest) {
    if (!process.env.MARKETING_WEBHOOK_SECRET && !process.env.LANDING_PAGE_ADMIN_SECRET) return NextResponse.json({ error: "MARKETING_WEBHOOK_SECRET or LANDING_PAGE_ADMIN_SECRET is not configured." }, { status: 503 });
    if (!authorized(request)) return NextResponse.json({ error: "Invalid automation admin secret." }, { status: 401 });
    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    if (body.resource === "landing-pages") {
        try {
            if (body.action === "delete" && body.id) {
                const { error } = await serverSupabase.from("landing_pages").delete().eq("id", body.id);
                if (error) throw error;
                return NextResponse.json({ ok: true });
            }
            const page = await saveLandingPage({ action: body.action, id: body.id, page: body.page });
            return NextResponse.json({ ok: true, page });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not save landing page.";
            return NextResponse.json({ error: /duplicate|unique/i.test(message) ? "That slug is already used. Choose another." : message }, { status: 400 });
        }
    }
    if (!marketingEvents.includes(body.event_key)) return NextResponse.json({ error: "Unsupported automation event." }, { status: 400 });
    const delayMinutes = Math.max(0, Math.min(43200, Number(body.delay_minutes ?? 2)));
    const { data, error } = await serverSupabase.from("marketing_automation_rules").upsert({ event_key: body.event_key, campaign_id: body.campaign_id || null, enabled: body.enabled !== false, delay_minutes: delayMinutes, stop_events: Array.isArray(body.stop_events) ? body.stop_events.filter((event: unknown) => typeof event === "string") : [], updated_at: new Date().toISOString() }, { onConflict: "event_key" }).select("id,event_key,campaign_id,enabled,delay_minutes,stop_events,updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rule: data });
}
