import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { processMarketingEvent, MarketingEventName } from "@/lib/marketing-automation";

function verifyStripeSignature(rawBody: string, header: string | null) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    const parts = header.split(",").reduce<Record<string, string[]>>((result, part) => { const [key, value] = part.split("=", 2); if (key && value) (result[key] ||= []).push(value); return result; }, {});
    const timestamp = Number(parts.t?.[0]);
    if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    return (parts.v1 || []).some(value => value.length === expected.length && timingSafeEqual(Buffer.from(expected), Buffer.from(value)));
}

async function stripeCustomerEmail(customerId: string) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret || !customerId) return "";
    const response = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
    if (!response.ok) return "";
    const data = await response.json();
    return data.email || "";
}

function eventMapping(type: string, object: any): MarketingEventName | null {
    if (type === "checkout.session.completed") return object.payment_status === "paid" ? "paid" : "trial_started";
    if (type === "invoice.paid") return "paid";
    if (type === "invoice.payment_failed") return "invoice_failed";
    if (type === "customer.subscription.deleted") return "subscription_cancelled";
    if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
        if (["canceled", "unpaid"].includes(object.status)) return "subscription_cancelled";
        if (object.status === "past_due") return "invoice_failed";
        if (["trialing", "active"].includes(object.status)) return object.status === "trialing" ? "trial_started" : "paid";
    }
    return null;
}

export async function POST(request: NextRequest) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: "Stripe webhook is disabled until STRIPE_WEBHOOK_SECRET is configured." }, { status: 503 });
    const rawBody = await request.text();
    if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"))) return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 401 });

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }
    const object = event?.data?.object || {};
    const mappedEvent = eventMapping(event?.type || "", object);
    if (!mappedEvent) return NextResponse.json({ received: true, ignored: event?.type || "unknown" });

    const metadata = object.metadata || object.subscription_details?.metadata || {};
    const customerId = typeof object.customer === "string" ? object.customer : "";
    const subscriptionId = typeof object.subscription === "string" ? object.subscription : typeof object.id === "string" && String(object.id).startsWith("sub_") ? object.id : "";
    const email = object.customer_details?.email || object.customer_email || metadata.email || await stripeCustomerEmail(customerId);
    if (!email) return NextResponse.json({ received: true, ignored: "Stripe event did not include a customer email." });

    try {
        const result = await processMarketingEvent({
            email,
            event: mappedEvent,
            source: "stripe",
            event_id: `stripe:${event.id}`,
            external_id: event.id,
            name: object.customer_details?.name || metadata.name,
            company_name: metadata.company_name,
            campaign_id: metadata.campaign_id,
            stripe_customer_id: customerId || undefined,
            stripe_subscription_id: subscriptionId || undefined,
            metadata: { stripe_event_type: event.type, stripe_object_id: object.id, plan: metadata.plan, price_id: object.lines?.data?.[0]?.price?.id },
        });
        return NextResponse.json({ received: true, ...result });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Stripe automation failed." }, { status: 500 });
    }
}
