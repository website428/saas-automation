import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { processMarketingEvent } from "@/lib/marketing-automation";
import { serverSupabase } from "@/lib/server-supabase";
import { recordSalesActivity } from "@/lib/sales-activity";

export const runtime = "nodejs";
export const maxDuration = 30;

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function verifySignature(rawBody: string, header: string | null) {
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!signingKey || !header) return false;
  const values = Object.fromEntries(header.split(",").map(part => part.split("=", 2) as [string, string]));
  const timestamp = values.t;
  const received = values.v1;
  if (!timestamp || !received) return false;
  const expected = createHmac("sha256", signingKey).update(`${timestamp}.${rawBody}`).digest("hex");
  return expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function iso(value: unknown) {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localDate(value: string | null, timezone: string) {
  if (!value) return null;
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
  catch { return value.slice(0, 10); }
}

async function upsertContact(email: string, name: string, companyName: string, booked: boolean) {
  const { data: existing, error: lookupError } = await serverSupabase.from("contacts").select("id,tags,status,name,company_name").eq("email", email).maybeSingle();
  if (lookupError) throw lookupError;
  const eventName = booked ? "demo_booked" : "demo_cancelled";
  const tags = Array.from(new Set([...(Array.isArray(existing?.tags) ? existing.tags : []), `event:${eventName}`, "source:calendly"]));
  const payload = { email, name: name || existing?.name || null, company_name: companyName || existing?.company_name || null, tags, source: "calendly", last_event: eventName, last_event_at: new Date().toISOString(), pipeline_stage: booked ? "audit_booked" : "qualified", updated_at: new Date().toISOString() };
  if (existing?.id) {
    const { error } = await serverSupabase.from("contacts").update(payload).eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }
  const { data: created, error } = await serverSupabase.from("contacts").insert({ ...payload, status: "pending" }).select("id").single();
  if (error || !created) throw error || new Error("Could not create Calendly contact.");
  return created.id as string;
}

export async function POST(request: NextRequest) {
  if (!process.env.CALENDLY_WEBHOOK_SIGNING_KEY) return NextResponse.json({ error: "Calendly webhook is disabled until CALENDLY_WEBHOOK_SIGNING_KEY is configured." }, { status: 503 });
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("calendly-signature"))) return NextResponse.json({ error: "Invalid Calendly webhook signature." }, { status: 401 });

  let body: RecordValue;
  try { body = record(JSON.parse(rawBody)); } catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }
  const eventType = text(body.event);
  if (!['invitee.created', 'invitee.canceled'].includes(eventType)) return NextResponse.json({ received: true, ignored: eventType || "unknown" });

  const payload = record(body.payload);
  const scheduledEvent = record(payload.scheduled_event);
  const invitee = record(payload.invitee);
  const inviteeUri = text(payload.invitee) || text(payload.uri) || text(invitee.uri);
  const eventUri = text(payload.event) || text(scheduledEvent.uri);
  const eventKey = inviteeUri || eventUri;
  if (!eventKey) return NextResponse.json({ received: true, ignored: "Calendly event did not include an event identifier." });
  const email = text(payload.email || invitee.email).toLowerCase();
  const name = text(payload.name || invitee.name);
  const timezone = text(payload.timezone || invitee.timezone) || "Asia/Kolkata";
  const startAt = iso(payload.start_time || scheduledEvent.start_time);
  const endAt = iso(payload.end_time || scheduledEvent.end_time);
  const location = record(payload.location || scheduledEvent.location);
  const meetingUrl = text(location.join_url || payload.join_url);
  const companyName = text(payload.company_name);

  try {
    let contactId = "";
    if (email) contactId = await upsertContact(email, name, companyName, eventType === "invitee.created");

    const { data: existingBooking } = await serverSupabase.from("sales_bookings").select("id,contact_id").eq("external_event_id", eventKey).maybeSingle();
    if (!contactId && existingBooking?.contact_id) contactId = existingBooking.contact_id as string;
    if (!contactId) return NextResponse.json({ received: true, ignored: "Calendly event did not include an email or known booking." });

    const bookingPayload = {
      contact_id: contactId,
      provider: "calendly",
      external_event_id: eventKey || null,
      external_invitee_id: inviteeUri || null,
      event_uri: eventUri || null,
      invitee_uri: inviteeUri || null,
      event_name: text(record(payload.event_type).name || scheduledEvent.name) || null,
      requested_date: localDate(startAt, timezone),
      requested_time: startAt ? new Date(startAt).toLocaleTimeString("en-IN", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }) : null,
      timezone,
      status: eventType === "invitee.canceled" ? "cancelled" : "confirmed",
      meeting_url: meetingUrl || null,
      start_at: startAt,
      end_at: endAt,
      cancel_reason: text(payload.cancel_reason || record(payload.cancellation).reason) || null,
      notes: "Synced from Calendly",
      metadata: { calendly_event: eventType, event_uri: eventUri, invitee_uri: inviteeUri },
      updated_at: new Date().toISOString(),
    };
    const bookingQuery = existingBooking
      ? serverSupabase.from("sales_bookings").update(bookingPayload).eq("id", existingBooking.id)
      : serverSupabase.from("sales_bookings").insert(bookingPayload);
    const { error: bookingError } = await bookingQuery;
    if (bookingError) throw bookingError;

    if (eventType === "invitee.created") {
      await serverSupabase.from("email_queue").update({ status: "cancelled", error_message: "Stopped because a Calendly meeting was booked." }).eq("contact_id", contactId).eq("status", "queued");
      await recordSalesActivity(contactId, "calendly_booked", "Calendly meeting booked", { event_uri: eventUri, start_at: startAt, meeting_url: meetingUrl });
      await serverSupabase.from("sales_tasks").insert({ contact_id: contactId, title: `Prepare for meeting with ${name || email}`, task_type: "meeting_preparation", priority: "high", due_at: startAt || new Date(Date.now() + 60 * 60 * 1000).toISOString() });
      await processMarketingEvent({ email: email || `calendly-${contactId}@placeholder.invalid`, event: "demo_booked", source: "calendly", event_id: `calendly:${eventKey}:booked`, name, company_name: companyName, metadata: { event_uri: eventUri, invitee_uri: inviteeUri, start_at: startAt, meeting_url: meetingUrl } });
    } else {
      await recordSalesActivity(contactId, "calendly_cancelled", "Calendly meeting cancelled", { event_uri: eventUri, reason: bookingPayload.cancel_reason });
    }
    return NextResponse.json({ received: true, event: eventType, contact_id: contactId });
  } catch (error) {
    console.error("Calendly webhook failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Calendly automation failed." }, { status: 500 });
  }
}
