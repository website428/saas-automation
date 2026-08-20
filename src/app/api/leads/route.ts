import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/server-supabase";
import { processMarketingEvent } from "@/lib/marketing-automation";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rateWindowMs = 10 * 60 * 1000;
const maxSubmissionsPerWindow = 30;
const submissionWindows = new Map<string, { startedAt: number; count: number }>();

export const runtime = "nodejs";
export const maxDuration = 30;

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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

    const tags = attributionTags(body);
    const { data: existing, error: lookupError } = await serverSupabase
      .from("contacts")
      .select("id,tags,status")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const currentTags = Array.isArray(existing?.tags) ? existing.tags : [];
    const payload = {
      email,
      name,
      company_name: clean(body.company_name, 160) || null,
      job_title: clean(body.job_title, 120) || null,
      tags: Array.from(new Set([...currentTags, ...tags])),
      status: existing?.status === "unsubscribed" ? "unsubscribed" : "pending",
      source: "landing_page",
    };

    const mutation = existing
      ? serverSupabase.from("contacts").update(payload).eq("id", existing.id)
      : serverSupabase.from("contacts").insert(payload);
    const { error: mutationError } = await mutation;
    if (mutationError) {
      // The source column is added by the FinModel Pro migration. Keep basic capture
      // compatible while a deployment is being migrated, without losing the lead.
      if (/source|schema cache|column/i.test(mutationError.message)) {
        const fallback = { ...payload } as Record<string, unknown>;
        delete fallback.source;
        const retry = existing
          ? serverSupabase.from("contacts").update(fallback).eq("id", existing.id)
          : serverSupabase.from("contacts").insert(fallback);
        const { error: retryError } = await retry;
        if (retryError) throw retryError;
      } else {
        throw mutationError;
      }
    }

    // Website leads can use the same configured lead_created rule as Meta Instant
    // Forms, but only when explicitly enabled on the server. The browser cannot
    // choose an event, campaign, or delay.
    if (process.env.PUBLIC_LEAD_AUTOMATION_ENABLED === "true") {
      try {
        await processMarketingEvent({
          email,
          event: "lead_created",
          event_id: `landing-page:${email}`,
          source: "landing-page",
          name,
          company_name: clean(body.company_name, 160),
          job_title: clean(body.job_title, 120),
          metadata: {
            utm_source: clean(body.utm_source, 80),
            utm_medium: clean(body.utm_medium, 80),
            utm_campaign: clean(body.utm_campaign, 80),
            utm_content: clean(body.utm_content, 80),
          },
        });
      } catch (automationError) {
        // Keep the lead capture successful if a campaign is not configured yet;
        // the event is logged server-side for diagnosis.
        console.error("Landing-page lead automation failed", automationError);
      }
    }

    return NextResponse.json({ ok: true, message: "Thanks — we will be in touch shortly." }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Public lead capture failed", error);
    return NextResponse.json({ error: "We could not save that yet. Please try again." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
}
