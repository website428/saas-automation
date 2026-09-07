import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/server-supabase";
import { processMarketingEvent } from "@/lib/marketing-automation";
import { calculateLeadQualification, qualificationEvent } from "@/lib/lead-scoring";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rateWindowMs = 10 * 60 * 1000;
const maxSubmissionsPerWindow = 30;
const submissionWindows = new Map<string, { startedAt: number; count: number }>();

export const runtime = "nodejs";
export const maxDuration = 30;

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function numberValue(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
}

function attributionTags(input: Record<string, unknown>) {
  const tags = ["marketing-lead", "source:landing-page"];
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
    const value = clean(input[key], 80).replace(/[^a-zA-Z0-9_:.\-/]/g, "-");
    if (value) tags.push(`${key}:${value}`);
  }
  return tags;
}

function requestKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(request: Request) {
  const key = requestKey(request);
  const now = Date.now();
  const current = submissionWindows.get(key);
  if (!current || now - current.startedAt > rateWindowMs) {
    submissionWindows.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > maxSubmissionsPerWindow;
}

export async function POST(request: Request) {
  try {
    if (isRateLimited(request)) {
      return NextResponse.json({ error: "Please try again in a few minutes." }, { status: 429, headers: { "cache-control": "no-store" } });
    }
    const body = await request.json() as Record<string, unknown>;

    // A filled honeypot is treated as a successful submission without touching the database.
    if (clean(body.website, 120)) {
      return NextResponse.json({ ok: true, message: "Thanks — we will be in touch shortly." });
    }

    const email = clean(body.email, 254).toLowerCase();
    const name = clean(body.name, 120);
    if (!emailPattern.test(email) || !name) {
      return NextResponse.json({ error: "Enter your name and a valid work email." }, { status: 400 });
    }

    const pageSlug = clean(body.page_slug, 100).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const companyName = clean(body.company_name, 160);
    const companyWebsite = clean(body.company_website, 300);
    const industry = clean(body.industry, 100).toLowerCase();
    const requirement = clean(body.requirement, 100);
    const problemStatement = clean(body.problem_statement || body.message, 2000);
    const budgetBand = clean(body.budget_band, 40);
    const timeline = clean(body.timeline, 40);
    const decisionMaker = body.decision_maker === true || body.decision_maker === "true";
    const employeeCount = numberValue(body.employee_count, 0, 100000);
    const repetitiveWorkflows = numberValue(body.repetitive_workflows, 0, 100);
    const manualHoursWeekly = numberValue(body.manual_hours_weekly, 0, 10000);
    const hourlyCost = numberValue(body.hourly_cost, 0, 100000);
    const qualification = calculateLeadQualification({ email, company_website: companyWebsite, industry, employee_count: employeeCount, requirement, problem_statement: problemStatement, budget_band: budgetBand, timeline, decision_maker: decisionMaker, repetitive_workflows: repetitiveWorkflows, manual_hours_weekly: manualHoursWeekly, hourly_cost: hourlyCost });
    const tags = attributionTags(body);
    tags.push(`temperature:${qualification.temperature}`, `score:${qualification.score}`);
    if (pageSlug) tags.push(`page:${pageSlug}`);
    const { data: existing, error: lookupError } = await serverSupabase
      .from("contacts")
      .select("id,tags,status")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const currentTags = Array.isArray(existing?.tags) ? existing.tags : [];
    const basePayload = {
      email,
      name,
      company_name: companyName || null,
      job_title: clean(body.job_title, 120) || null,
      tags: Array.from(new Set([...currentTags, ...tags])),
      status: existing?.status === "unsubscribed" ? "unsubscribed" : "pending",
      source: "landing_page",
    };
    const payload = {
      ...basePayload,
      phone: clean(body.phone, 40) || null,
      company_website: companyWebsite || null,
      industry: industry || null,
      employee_count: employeeCount || null,
      requirement: requirement || null,
      problem_statement: problemStatement || null,
      budget_band: budgetBand || null,
      timeline: timeline || null,
      decision_maker: decisionMaker,
      manual_hours_weekly: manualHoursWeekly || null,
      hourly_cost: hourlyCost || null,
      repetitive_workflows: repetitiveWorkflows || null,
      estimated_monthly_savings: qualification.estimatedMonthlySavings,
      lead_score: qualification.score,
      lead_temperature: qualification.temperature,
      pipeline_stage: qualification.pipelineStage,
      last_utm_source: clean(body.utm_source, 80) || null,
      last_utm_medium: clean(body.utm_medium, 80) || null,
      last_utm_campaign: clean(body.utm_campaign, 80) || null,
      updated_at: new Date().toISOString(),
    };

    const mutation = existing
      ? serverSupabase.from("contacts").update(payload).eq("id", existing.id).select("id").single()
      : serverSupabase.from("contacts").insert(payload).select("id").single();
    const mutationResult = await mutation;
    let savedContact = mutationResult.data;
    const mutationError = mutationResult.error;
    if (mutationError) {
      // Keep basic lead capture working while migration 024 is being applied.
      if (/schema cache|column|phone|lead_score|pipeline_stage/i.test(mutationError.message)) {
        const retry = existing
          ? serverSupabase.from("contacts").update(basePayload).eq("id", existing.id).select("id").single()
          : serverSupabase.from("contacts").insert(basePayload).select("id").single();
        const { data: retryContact, error: retryError } = await retry;
        if (retryError) throw retryError;
        savedContact = retryContact;
      } else {
        throw mutationError;
      }
    }
    const contactId = savedContact?.id || existing?.id;

    let auditId = "";
    if (contactId && (problemStatement || manualHoursWeekly || requirement)) {
      try {
        const { data: audit } = await serverSupabase.from("automation_audits").insert({
          contact_id: contactId,
          offer_slug: pageSlug || "ai-automation",
          industry: industry || null,
          requirement: requirement || null,
          problem_statement: problemStatement || null,
          employee_count: employeeCount || null,
          repetitive_workflows: repetitiveWorkflows || null,
          manual_hours_weekly: manualHoursWeekly || null,
          hourly_cost: hourlyCost || null,
          budget_band: budgetBand || null,
          timeline: timeline || null,
          decision_maker: decisionMaker,
          lead_score: qualification.score,
          lead_temperature: qualification.temperature,
          estimated_monthly_cost: qualification.monthlyManualCost,
          estimated_monthly_savings: qualification.estimatedMonthlySavings,
          potential: qualification.potential,
          utm_source: clean(body.utm_source, 80) || null,
          utm_medium: clean(body.utm_medium, 80) || null,
          utm_campaign: clean(body.utm_campaign, 80) || null,
          utm_content: clean(body.utm_content, 80) || null,
        }).select("id").single();
        auditId = audit?.id || "";

        await serverSupabase.from("sales_activity").insert({ contact_id: contactId, activity_type: "audit_submitted", title: "AI opportunity audit submitted", details: { score: qualification.score, temperature: qualification.temperature, offer_slug: pageSlug || "ai-automation" } });

        if (qualification.temperature === "hot") {
          await serverSupabase.from("sales_tasks").insert({ contact_id: contactId, title: `Contact ${name} about the AI audit`, task_type: "hot_lead_follow_up", priority: "urgent", due_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
        }

        const preferredDate = clean(body.preferred_date, 20);
        if (preferredDate) {
          await serverSupabase.from("sales_bookings").insert({ contact_id: contactId, requested_date: preferredDate, requested_time: clean(body.preferred_time, 40) || null, timezone: clean(body.timezone, 80) || "Asia/Kolkata", notes: "Requested with AI opportunity audit" });
          await serverSupabase.from("sales_tasks").insert({ contact_id: contactId, title: `Confirm AI audit call with ${name}`, task_type: "booking_confirmation", priority: qualification.temperature === "hot" ? "urgent" : "high", due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
        }
      } catch (growthError) {
        console.error("Growth-engine enrichment failed; run migration 024", growthError);
      }
    }

    // Keep a page-level conversion record in addition to the existing contacts
    // table. This is best-effort so an older database still captures the lead.
    if (pageSlug) {
      try {
        const { data: landingPage } = await serverSupabase
          .from("landing_pages")
          .select("id")
          .eq("slug", pageSlug)
          .eq("status", "published")
          .maybeSingle();
        if (landingPage?.id) {
          await serverSupabase.from("landing_page_submissions").insert({
            page_id: landingPage.id,
            email,
            name,
            company_name: clean(body.company_name, 160) || null,
            job_title: clean(body.job_title, 120) || null,
            source: "landing-page",
            metadata: {
              utm_source: clean(body.utm_source, 80),
              utm_medium: clean(body.utm_medium, 80),
              utm_campaign: clean(body.utm_campaign, 80),
              utm_content: clean(body.utm_content, 80),
              requirement,
              budget_band: budgetBand,
              timeline,
              lead_score: qualification.score,
              lead_temperature: qualification.temperature,
            },
          });
        }
      } catch (submissionError) {
        console.error("Landing-page submission log failed", submissionError);
      }
    }

    // Route the lead to the campaign configured for its qualification tier.
    if (process.env.PUBLIC_LEAD_AUTOMATION_ENABLED === "true") {
      try {
        await processMarketingEvent({
          email,
          event: qualificationEvent(qualification.temperature),
          event_id: `growth:${auditId || crypto.randomUUID()}`,
          source: "landing-page",
          name,
          company_name: companyName,
          job_title: clean(body.job_title, 120),
          metadata: {
            utm_source: clean(body.utm_source, 80),
            utm_medium: clean(body.utm_medium, 80),
            utm_campaign: clean(body.utm_campaign, 80),
            utm_content: clean(body.utm_content, 80),
            offer_slug: pageSlug,
            requirement,
            industry,
            budget_band: budgetBand,
            timeline,
            lead_score: qualification.score,
            lead_temperature: qualification.temperature,
            estimated_monthly_savings: qualification.estimatedMonthlySavings,
          },
        });
      } catch (automationError) {
        // Keep the lead capture successful if a campaign is not configured yet;
        // the event is logged server-side for diagnosis.
        console.error("Landing-page lead automation failed", automationError);
      }
    }

    return NextResponse.json({
      ok: true,
      message: qualification.temperature === "hot" ? "Your audit request is prioritized. Choose a call time and we will review your workflow." : "Your audit request is saved. We will send the next steps by email.",
      result: {
        potential: qualification.potential,
        estimated_monthly_cost: qualification.monthlyManualCost,
        estimated_monthly_savings: qualification.estimatedMonthlySavings,
        next_step: qualification.temperature === "hot" ? "priority-audit" : qualification.temperature === "qualified" ? "audit-review" : "opportunity-guide",
      },
      booking_url: process.env.NEXT_PUBLIC_BOOKING_URL || null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Public lead capture failed", error);
    return NextResponse.json({ error: "We could not save that yet. Please try again." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
}
