import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { processMarketingEvent } from "@/lib/marketing-automation";

function verifyMetaSignature(rawBody: string, signature: string | null) {
    const secret = process.env.META_APP_SECRET;
    if (!secret || !signature?.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const received = signature.slice(7);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function values(fields: any[], names: string[]) {
    const field = fields?.find(item => names.includes(String(item.field_name || "").toLowerCase()));
    return field?.values?.[0] ? String(field.values[0]) : "";
}

async function fetchMetaLead(leadId: string) {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error("META_ACCESS_TOKEN is not configured.");
    const version = process.env.META_GRAPH_API_VERSION || "v23.0";
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(leadId)}?access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Meta lead retrieval failed.");
    return body;
}

export async function GET(request: NextRequest) {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!verifyToken) return NextResponse.json({ error: "META_WEBHOOK_VERIFY_TOKEN is not configured." }, { status: 503 });
    const mode = request.nextUrl.searchParams.get("hub.mode");
    const token = request.nextUrl.searchParams.get("hub.verify_token");
    const challenge = request.nextUrl.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === verifyToken && challenge) return new NextResponse(challenge, { status: 200 });
    return NextResponse.json({ error: "Meta webhook verification failed." }, { status: 403 });
}

export async function POST(request: NextRequest) {
    if (!process.env.META_APP_SECRET || !process.env.META_ACCESS_TOKEN) return NextResponse.json({ error: "Meta webhook is disabled until META_APP_SECRET and META_ACCESS_TOKEN are configured." }, { status: 503 });
    const rawBody = await request.text();
    if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid Meta webhook signature." }, { status: 401 });

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }
    const processed: unknown[] = [];
    const errors: string[] = [];
    for (const entry of payload?.entry || []) {
        for (const change of entry?.changes || []) {
            const value = change?.value || {};
            const leadId = value.leadgen_id;
            if (!leadId) continue;
            try {
                const lead = await fetchMetaLead(String(leadId));
                const fields = lead.field_data || [];
                const email = values(fields, ["email", "work_email"]);
                if (!email) throw new Error("Meta lead did not include an email address.");
                const name = values(fields, ["full_name", "name"]) || [values(fields, ["first_name"]), values(fields, ["last_name"])].filter(Boolean).join(" ");
                processed.push(await processMarketingEvent({
                    email,
                    event: "lead_created",
                    source: "meta",
                    event_id: `meta:${leadId}:lead_created`,
                    external_id: String(leadId),
                    name,
                    company_name: values(fields, ["company_name", "company", "business_name"]),
                    job_title: values(fields, ["job_title", "role", "job_title_description"]),
                    meta_lead_id: String(leadId),
                    metadata: { page_id: value.page_id, form_id: value.form_id, ad_id: value.ad_id, adset_id: value.adset_id, campaign_id: value.campaign_id },
                }));
            } catch (error) {
                errors.push(error instanceof Error ? error.message : "Meta lead processing failed.");
            }
        }
    }
    return NextResponse.json({ received: true, processed: processed.length, errors });
}
