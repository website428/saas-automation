import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/server-supabase";
import { processMarketingEvent, MarketingEventName } from "@/lib/marketing-automation";

export const runtime = "nodejs";

const pipelineStages = ["new", "contacted", "qualified", "audit_booked", "proposal", "pilot", "won", "lost"] as const;

function authorized(request: NextRequest) {
  const secrets = [process.env.LANDING_PAGE_ADMIN_SECRET, process.env.MARKETING_WEBHOOK_SECRET].filter(Boolean);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = request.headers.get("x-marketing-secret");
  return secrets.length > 0 && secrets.some(secret => secret === supplied || secret === bearer);
}

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numberValue(value: unknown, min = 0, max = 100_000_000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
}

async function recordActivity(contactId: string | null, activityType: string, title: string, details: Record<string, unknown> = {}) {
  await serverSupabase.from("sales_activity").insert({ contact_id: contactId || null, activity_type: activityType, title, details });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Invalid automation admin secret." }, { status: 401 });
  const [leads, tasks, bookings, partners, content, activities] = await Promise.all([
    serverSupabase.from("contacts").select("id,email,name,company_name,job_title,phone,company_website,industry,requirement,problem_statement,budget_band,timeline,decision_maker,estimated_monthly_savings,lead_score,lead_temperature,pipeline_stage,next_action_at,owner_notes,last_utm_source,last_utm_medium,last_utm_campaign,meta_campaign_id,meta_adset_id,meta_ad_id,meta_form_id,last_event,created_at,updated_at").order("lead_score", { ascending: false }).limit(500),
    serverSupabase.from("sales_tasks").select("id,contact_id,title,task_type,priority,due_at,status,completed_at,created_at,contacts(name,email,company_name)").eq("status", "open").order("due_at", { ascending: true, nullsFirst: false }).limit(100),
    serverSupabase.from("sales_bookings").select("id,contact_id,requested_date,requested_time,timezone,status,meeting_url,notes,created_at,contacts(name,email,company_name)").in("status", ["requested", "confirmed"]).order("requested_date", { ascending: true }).limit(100),
    serverSupabase.from("growth_partners").select("*").order("follow_up_at", { ascending: true, nullsFirst: false }).limit(250),
    serverSupabase.from("growth_content").select("*").order("scheduled_for", { ascending: true, nullsFirst: false }).limit(250),
    serverSupabase.from("sales_activity").select("id,contact_id,activity_type,title,details,created_at,contacts(name,email)").order("created_at", { ascending: false }).limit(50),
  ]);

  const error = [leads.error, tasks.error, bookings.error, partners.error, content.error, activities.error].find(Boolean);
  if (error) return NextResponse.json({ error: `${error.message}. Run Supabase migration 024_finasoft_growth_engine.sql.` }, { status: 409 });

  const leadRows = leads.data || [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = leadRows.filter(lead => new Date(lead.created_at).getTime() >= monthStart);
  const sourceCounts = leadRows.reduce<Record<string, number>>((result, lead) => {
    const source = lead.last_utm_source || "direct";
    result[source] = (result[source] || 0) + 1;
    return result;
  }, {});

  return NextResponse.json({
    leads: leadRows,
    tasks: tasks.data || [],
    bookings: bookings.data || [],
    partners: partners.data || [],
    content: content.data || [],
    activities: activities.data || [],
    summary: {
      total_leads: leadRows.length,
      leads_this_month: thisMonth.length,
      hot_leads: leadRows.filter(lead => lead.lead_temperature === "hot").length,
      qualified_leads: leadRows.filter(lead => ["hot", "qualified"].includes(lead.lead_temperature)).length,
      booked_calls: (bookings.data || []).length,
      open_tasks: (tasks.data || []).length,
      proposals: leadRows.filter(lead => lead.pipeline_stage === "proposal").length,
      customers: leadRows.filter(lead => lead.pipeline_stage === "won").length,
      potential_monthly_savings: leadRows.reduce((sum, lead) => sum + Number(lead.estimated_monthly_savings || 0), 0),
      sources: sourceCounts,
    },
    integrations: { razorpay_payment_link: process.env.NEXT_PUBLIC_RAZORPAY_PILOT_PAYMENT_LINK || null },
  });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Invalid automation admin secret." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const action = clean(body.action, 60);

  try {
    if (action === "update_lead") {
      const contactId = clean(body.contact_id, 80);
      const pipelineStage = clean(body.pipeline_stage, 40) as typeof pipelineStages[number];
      if (!contactId || !pipelineStages.includes(pipelineStage)) return NextResponse.json({ error: "A valid lead and pipeline stage are required." }, { status: 400 });
      const fields = { pipeline_stage: pipelineStage, owner_notes: clean(body.owner_notes, 4000) || null, next_action_at: clean(body.next_action_at, 60) || null, updated_at: new Date().toISOString() };
      const { data: lead, error } = await serverSupabase.from("contacts").update(fields).eq("id", contactId).select("id,email,name,company_name,pipeline_stage").single();
      if (error || !lead) throw error || new Error("Lead not found.");
      await recordActivity(contactId, "pipeline_changed", `Moved to ${pipelineStage.replaceAll("_", " ")}`, { pipeline_stage: pipelineStage });
      const lifecycle: Partial<Record<typeof pipelineStages[number], MarketingEventName>> = { audit_booked: "audit_booked", proposal: "proposal_sent", pilot: "pilot_paid", won: "customer_won" };
      if (lifecycle[pipelineStage]) {
        await processMarketingEvent({ email: lead.email, event: lifecycle[pipelineStage]!, source: "sales-pipeline", event_id: `pipeline:${contactId}:${pipelineStage}:${Date.now()}`, name: lead.name || undefined, company_name: lead.company_name || undefined });
      }
      return NextResponse.json({ ok: true, lead });
    }

    if (action === "complete_task") {
      const id = clean(body.id, 80);
      const { error } = await serverSupabase.from("sales_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "create_task") {
      const title = clean(body.title, 240);
      if (!title) return NextResponse.json({ error: "Task title is required." }, { status: 400 });
      const { data, error } = await serverSupabase.from("sales_tasks").insert({ contact_id: clean(body.contact_id, 80) || null, title, task_type: clean(body.task_type, 60) || "follow_up", priority: clean(body.priority, 20) || "normal", due_at: clean(body.due_at, 60) || null }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, task: data });
    }

    if (action === "save_partner") {
      const id = clean(body.id, 80);
      const fields = { name: clean(body.name, 160), company: clean(body.company, 160) || null, email: clean(body.email, 254).toLowerCase() || null, partner_type: clean(body.partner_type, 50) || "agency", stage: clean(body.stage, 40) || "prospect", potential_value: numberValue(body.potential_value) || null, follow_up_at: clean(body.follow_up_at, 60) || null, notes: clean(body.notes, 4000) || null, updated_at: new Date().toISOString() };
      if (!fields.name) return NextResponse.json({ error: "Partner name is required." }, { status: 400 });
      const query = id ? serverSupabase.from("growth_partners").update(fields).eq("id", id) : serverSupabase.from("growth_partners").insert(fields);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, partner: data });
    }

    if (action === "save_content") {
      const id = clean(body.id, 80);
      const fields = { channel: clean(body.channel, 40) || "linkedin", pillar: clean(body.pillar, 60) || "education", title: clean(body.title, 240), body: clean(body.body, 8000) || null, cta: clean(body.cta, 500) || null, status: clean(body.status, 30) || "idea", scheduled_for: clean(body.scheduled_for, 60) || null, published_url: clean(body.published_url, 500) || null, updated_at: new Date().toISOString() };
      if (!fields.title) return NextResponse.json({ error: "Content title is required." }, { status: 400 });
      const query = id ? serverSupabase.from("growth_content").update(fields).eq("id", id) : serverSupabase.from("growth_content").insert(fields);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, content: data });
    }

    return NextResponse.json({ error: "Unsupported growth action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Growth action failed." }, { status: 500 });
  }
}
