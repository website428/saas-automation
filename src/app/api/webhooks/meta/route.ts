import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { processMarketingEvent } from "@/lib/marketing-automation";
import { serverSupabase } from "@/lib/server-supabase";
import { calculateLeadQualification, qualificationEvent } from "@/lib/lead-scoring";

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

function numberValue(value: string, max = 100000) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0;
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
                const companyName = values(fields, ["company_name", "company", "business_name"]);
                const companyWebsite = values(fields, ["company_website", "website", "url"]);
                const industry = values(fields, ["industry", "business_industry"]);
                const requirement = values(fields, ["requirement", "what_do_you_need", "service"]);
                const problemStatement = values(fields, ["problem_statement", "what_are_you_trying_to_solve", "message", "challenge"]);
                const budgetBand = values(fields, ["budget_band", "budget", "expected_budget"]);
                const timeline = values(fields, ["timeline", "project_timeline"]);
                const decisionMaker = ["true", "yes", "1"].includes(values(fields, ["decision_maker", "are_you_the_decision_maker"]).toLowerCase());
                const qualification = calculateLeadQualification({ email, company_website: companyWebsite, industry, requirement, problem_statement: problemStatement, budget_band: budgetBand, timeline, decision_maker: decisionMaker, employee_count: numberValue(values(fields, ["employee_count", "employees"])), repetitive_workflows: numberValue(values(fields, ["repetitive_workflows", "number_of_workflows"]), 100), manual_hours_weekly: numberValue(values(fields, ["manual_hours_weekly", "manual_hours"]), 10000), hourly_cost: numberValue(values(fields, ["hourly_cost", "employee_cost"]), 100000) });
                const result = await processMarketingEvent({
                    email,
                    event: qualificationEvent(qualification.temperature),
                    source: "meta",
                    event_id: `meta:${leadId}:${qualification.temperature}`,
                    external_id: String(leadId),
                    name,
                    company_name: companyName,
                    job_title: values(fields, ["job_title", "role", "job_title_description"]),
                    meta_lead_id: String(leadId),
                    metadata: { page_id: value.page_id, form_id: value.form_id, ad_id: value.ad_id, adset_id: value.adset_id, campaign_id: value.campaign_id, company_website: companyWebsite, industry, requirement, problem_statement: problemStatement, budget_band: budgetBand, timeline, decision_maker: decisionMaker, lead_score: qualification.score, lead_temperature: qualification.temperature, estimated_monthly_savings: qualification.estimatedMonthlySavings },
                });
                if (result.contactId) {
                    await serverSupabase.from("contacts").update({ phone: values(fields, ["phone", "phone_number"] ) || null, company_website: companyWebsite || null, industry: industry || null, requirement: requirement || null, problem_statement: problemStatement || null, budget_band: budgetBand || null, timeline: timeline || null, decision_maker: decisionMaker, lead_score: qualification.score, lead_temperature: qualification.temperature, pipeline_stage: qualification.pipelineStage, estimated_monthly_savings: qualification.estimatedMonthlySavings, last_utm_source: "meta", meta_campaign_id: String(value.campaign_id || "") || null, meta_adset_id: String(value.adset_id || "") || null, meta_ad_id: String(value.ad_id || "") || null, meta_form_id: String(value.form_id || "") || null, updated_at: new Date().toISOString() }).eq("id", result.contactId);
                    await serverSupabase.from("automation_audits").insert({ contact_id: result.contactId, offer_slug: "meta-lead-ad", industry: industry || null, requirement: requirement || null, problem_statement: problemStatement || null, budget_band: budgetBand || null, timeline: timeline || null, decision_maker: decisionMaker, lead_score: qualification.score, lead_temperature: qualification.temperature, estimated_monthly_cost: qualification.monthlyManualCost, estimated_monthly_savings: qualification.estimatedMonthlySavings, potential: qualification.potential, metadata: { page_id: value.page_id, form_id: value.form_id, ad_id: value.ad_id, adset_id: value.adset_id, campaign_id: value.campaign_id } });
                    await serverSupabase.from("sales_activity").insert({ contact_id: result.contactId, activity_type: "meta_lead_received", title: "Meta lead received and scored", details: { score: qualification.score, temperature: qualification.temperature, ad_id: value.ad_id, campaign_id: value.campaign_id } });
                    if (qualification.temperature === "hot") await serverSupabase.from("sales_tasks").insert({ contact_id: result.contactId, title: `Contact ${name || email} from Meta`, task_type: "hot_lead_follow_up", priority: "urgent", due_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
                }
                processed.push({ ...result, leadScore: qualification.score, leadTemperature: qualification.temperature });
            } catch (error) {
                errors.push(error instanceof Error ? error.message : "Meta lead processing failed.");
            }
        }
    }
    return NextResponse.json({ received: true, processed: processed.length, errors });
}
