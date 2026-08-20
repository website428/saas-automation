import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { processMarketingEvent, MarketingEventName } from "@/lib/marketing-automation";

type RecordValue = Record<string, unknown>;

export const runtime = "nodejs";
export const maxDuration = 30;

function record(value: unknown): RecordValue {
    return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown) {
    return typeof value === "string" ? value : "";
}

function epochToIso(value: unknown) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
}

function verifyRazorpaySignature(rawBody: string, header: string | null) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return header.length === expected.length && timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

function mappedEvent(type: string, entity: RecordValue): MarketingEventName | null {
    if (["payment.captured", "order.paid", "payment_link.paid"].includes(type)) return "paid";
    if (["payment.failed", "subscription.pending", "subscription.halted"].includes(type)) return "invoice_failed";
    if (["refund.processed", "payment.refunded"].includes(type)) return "refunded";
    if (["subscription.authenticated", "subscription.activated", "subscription.charged", "subscription.resumed"].includes(type)) return "paid";
    if (["subscription.cancelled", "subscription.paused"].includes(type)) return "subscription_cancelled";
    if (type === "subscription.updated") {
        const status = text(entity.status).toLowerCase();
        if (["cancelled", "paused"].includes(status)) return "subscription_cancelled";
        if (["pending", "halted"].includes(status)) return "invoice_failed";
        if (["active", "authenticated"].includes(status)) return "paid";
    }
    return null;
}

async function razorpayGet(path: string) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { Authorization: `Basic ${authorization}` }, cache: "no-store" });
    if (!response.ok) return null;
    return record(await response.json());
}

async function resolveCustomerDetails(input: { email: string; paymentId: string; subscriptionId: string; customerId: string }) {
    if (input.email) return { email: input.email, name: "" };
    if (input.paymentId) {
        const payment = await razorpayGet(`payments/${encodeURIComponent(input.paymentId)}`);
        if (payment) return { email: text(payment.email), name: text(payment.name) };
    }
    if (input.subscriptionId) {
        const subscription = await razorpayGet(`subscriptions/${encodeURIComponent(input.subscriptionId)}`);
        if (subscription) {
            const email = text(subscription.customer_email);
            if (email) return { email, name: text(subscription.customer_name) };
        }
    }
    if (input.customerId) {
        const customer = await razorpayGet(`customers/${encodeURIComponent(input.customerId)}`);
        if (customer) return { email: text(customer.email), name: text(customer.name) };
    }
    return { email: "", name: "" };
}

export async function POST(request: NextRequest) {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return NextResponse.json({ error: "Razorpay webhook is disabled until RAZORPAY_WEBHOOK_SECRET is configured." }, { status: 503 });

    const rawBody = await request.text();
    if (!verifyRazorpaySignature(rawBody, request.headers.get("x-razorpay-signature"))) return NextResponse.json({ error: "Invalid Razorpay webhook signature." }, { status: 401 });

    let event: RecordValue;
    try { event = record(JSON.parse(rawBody)); } catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }

    const type = text(event.event);
    const payload = record(event.payload);
    const payment = record(record(payload.payment).entity);
    const order = record(record(payload.order).entity);
    const subscription = record(record(payload.subscription).entity);
    const invoice = record(record(payload.invoice).entity);
    const refund = record(record(payload.refund).entity);
    const primaryEntity = Object.keys(subscription).length ? subscription : Object.keys(payment).length ? payment : Object.keys(order).length ? order : invoice;
    const eventName = mappedEvent(type, primaryEntity);
    if (!eventName) return NextResponse.json({ received: true, ignored: type || "unknown" });

    const notes = { ...record(order.notes), ...record(payment.notes), ...record(subscription.notes), ...record(invoice.notes), ...record(refund.notes) };
    const paymentId = text(payment.id) || text(refund.payment_id);
    const orderId = text(order.id) || text(payment.order_id) || text(invoice.order_id);
    const subscriptionId = text(subscription.id) || text(invoice.subscription_id) || text(payment.subscription_id);
    const customerId = text(subscription.customer_id) || text(invoice.customer_id) || text(payment.customer_id);
    const invoiceCustomer = record(invoice.customer_details);
    const initialEmail = text(payment.email) || text(invoiceCustomer.email) || text(invoiceCustomer.customer_email) || text(subscription.customer_email) || text(notes.email);
    const customer = await resolveCustomerDetails({ email: initialEmail, paymentId, subscriptionId, customerId });
    const email = customer.email || initialEmail;
    if (!email) return NextResponse.json({ received: true, ignored: "Razorpay event did not include a customer email." });

    const razorpayEventId = request.headers.get("x-razorpay-event-id") || text(event.id) || `${type}:${text(event.created_at)}:${paymentId || subscriptionId || orderId}`;
    try {
        const result = await processMarketingEvent({
            email,
            event: eventName,
            source: "razorpay",
            event_id: `razorpay:${razorpayEventId}`,
            external_id: razorpayEventId,
            occurred_at: epochToIso(event.created_at),
            name: customer.name || text(payment.name) || text(invoiceCustomer.name) || text(notes.name),
            company_name: text(notes.company_name),
            job_title: text(notes.job_title),
            razorpay_customer_id: customerId || undefined,
            razorpay_subscription_id: subscriptionId || undefined,
            razorpay_payment_id: paymentId || undefined,
            razorpay_order_id: orderId || undefined,
            metadata: {
                razorpay_event_type: type,
                razorpay_entity_id: text(primaryEntity.id),
                plan_id: text(subscription.plan_id),
                amount: payment.amount || order.amount || invoice.amount || refund.amount,
                currency: text(payment.currency) || text(order.currency) || text(invoice.currency),
                status: text(subscription.status) || text(payment.status) || text(order.status),
            },
        });
        return NextResponse.json({ received: true, ...result });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Razorpay automation failed." }, { status: 500 });
    }
}
