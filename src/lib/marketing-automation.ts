import { serverSupabase } from "@/lib/server-supabase";

export const marketingEvents = [
    "lead_created",
    "trial_started",
    "integration_connected",
    "model_generated",
    "aha_reached",
    "activated",
    "demo_booked",
    "email_clicked",
    "trial_day_11",
    "trial_day_13",
    "trial_expired",
    "paid",
    "refunded",
    "invoice_failed",
    "subscription_cancelled",
    "churned",
] as const;

export type MarketingEventName = (typeof marketingEvents)[number];

export type MarketingEventInput = {
    email: string;
    event: MarketingEventName;
    source?: string;
    event_id?: string;
    external_id?: string;
    occurred_at?: string;
    name?: string;
    company_name?: string;
    job_title?: string;
    campaign_id?: string;
    meta_lead_id?: string;
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    razorpay_customer_id?: string;
    razorpay_subscription_id?: string;
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    metadata?: Record<string, unknown>;
};

const stages: Partial<Record<MarketingEventName, string>> = {
    lead_created: "new",
    trial_started: "trial",
    demo_booked: "qualified",
    email_clicked: "contacted",
    activated: "qualified",
    integration_connected: "trial",
    model_generated: "qualified",
    aha_reached: "qualified",
    paid: "customer",
    refunded: "churned",
    trial_expired: "churned",
    invoice_failed: "trial",
    subscription_cancelled: "churned",
    churned: "churned",
};

const fallbackCampaignEnv: Partial<Record<MarketingEventName, string>> = {
    lead_created: "MARKETING_CAMPAIGN_LEAD_ID",
    trial_started: "MARKETING_CAMPAIGN_TRIAL_ID",
    integration_connected: "MARKETING_CAMPAIGN_ONBOARDING_ID",
    model_generated: "MARKETING_CAMPAIGN_ACTIVATION_ID",
    aha_reached: "MARKETING_CAMPAIGN_ACTIVATION_ID",
    activated: "MARKETING_CAMPAIGN_ACTIVATION_ID",
    demo_booked: "MARKETING_CAMPAIGN_DEMO_ID",
    trial_day_11: "MARKETING_CAMPAIGN_TRIAL_WARNING_ID",
    trial_day_13: "MARKETING_CAMPAIGN_TRIAL_WARNING_ID",
    trial_expired: "MARKETING_CAMPAIGN_TRIAL_EXPIRED_ID",
    paid: "MARKETING_CAMPAIGN_PAID_ID",
    refunded: "MARKETING_CAMPAIGN_WINBACK_ID",
    invoice_failed: "MARKETING_CAMPAIGN_PAYMENT_FAILED_ID",
    subscription_cancelled: "MARKETING_CAMPAIGN_WINBACK_ID",
    churned: "MARKETING_CAMPAIGN_WINBACK_ID",
};

function normalizeSource(source?: string) {
    return (source || "product").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 80);
}

function idempotencyKey(input: MarketingEventInput, email: string, source: string) {
    return input.event_id || input.external_id || `${source}:${input.event}:${email}:${input.occurred_at || new Date().toISOString().slice(0, 16)}`;
}

async function resolveRule(event: MarketingEventName, explicitCampaignId?: string) {
    if (explicitCampaignId) return { campaignId: explicitCampaignId, enabled: true, delayMinutes: 2, stopEvents: [] as string[] };

    const { data, error } = await serverSupabase
        .from("marketing_automation_rules")
        .select("campaign_id,enabled,delay_minutes,stop_events")
        .eq("event_key", event)
        .maybeSingle();

    if (!error && data) {
        return { campaignId: data.campaign_id as string | null, enabled: Boolean(data.enabled), delayMinutes: Number(data.delay_minutes ?? 2), stopEvents: Array.isArray(data.stop_events) ? data.stop_events : [] };
    }

    const envName = fallbackCampaignEnv[event];
    return { campaignId: envName ? process.env[envName] || null : null, enabled: true, delayMinutes: 2, stopEvents: [] as string[] };
}

async function cancelQueuesForEvent(contactId: string, event: MarketingEventName) {
    const { data: rules } = await serverSupabase
        .from("marketing_automation_rules")
        .select("campaign_id")
        .contains("stop_events", [event])
        .not("campaign_id", "is", null);
    const campaignIds = (rules || []).map(rule => rule.campaign_id).filter(Boolean) as string[];
    if (campaignIds.length) {
        await serverSupabase.from("email_queue").update({ status: "cancelled", error_message: `Stopped by lifecycle event: ${event}` }).eq("contact_id", contactId).eq("status", "queued").in("campaign_id", campaignIds);
    }
}

export async function processMarketingEvent(input: MarketingEventInput) {
    const email = input.email.trim().toLowerCase();
    const source = normalizeSource(input.source);
    const key = idempotencyKey(input, email, source);

    const { data: existingLog } = await serverSupabase.from("marketing_event_log").select("id,status,contact_id,campaign_id").eq("idempotency_key", key).maybeSingle();
    if (existingLog) return { duplicate: true, contactId: existingLog.contact_id, campaignId: existingLog.campaign_id, event: input.event, message: "Event already processed." };

    const { data: log, error: logError } = await serverSupabase.from("marketing_event_log").insert({ idempotency_key: key, source, event_key: input.event, external_id: input.external_id || input.event_id || null, email, payload: input.metadata || {} }).select("id").single();
    if (logError || !log) {
        if (logError?.code === "23505") return { duplicate: true, contactId: null, campaignId: null, event: input.event, message: "Event was received concurrently and deduplicated." };
        throw new Error(logError?.message || "Could not record marketing event.");
    }

    try {
        const { data: existingRows, error: lookupError } = await serverSupabase.from("contacts").select("id,email,name,company_name,job_title,tags,status,source,trial_started_at,paid_at").eq("email", email).limit(1);
        if (lookupError) throw new Error(lookupError.message);
        const existing = existingRows?.[0];
        const currentTags: string[] = Array.isArray(existing?.tags) ? existing.tags : [];
        const stage = stages[input.event];
        const tags = Array.from(new Set([
            ...currentTags.filter(tag => !stage || !tag.toLowerCase().startsWith("stage:")),
            "marketing-lead",
            `event:${input.event}`,
            `source:${source}`,
            ...(stage ? [`stage:${stage}`] : []),
        ]));
        const timestamp = input.occurred_at || new Date().toISOString();
        const fields: Record<string, unknown> = {
            email,
            name: input.name?.trim() || existing?.name || null,
            company_name: input.company_name?.trim() || existing?.company_name || null,
            job_title: input.job_title?.trim() || existing?.job_title || null,
            tags,
            source,
            last_event: input.event,
            last_event_at: timestamp,
            ...(input.meta_lead_id ? { meta_lead_id: input.meta_lead_id } : {}),
            ...(input.stripe_customer_id ? { stripe_customer_id: input.stripe_customer_id } : {}),
            ...(input.stripe_subscription_id ? { stripe_subscription_id: input.stripe_subscription_id } : {}),
            ...(input.razorpay_customer_id ? { razorpay_customer_id: input.razorpay_customer_id } : {}),
            ...(input.razorpay_subscription_id ? { razorpay_subscription_id: input.razorpay_subscription_id } : {}),
            ...(input.razorpay_payment_id ? { razorpay_payment_id: input.razorpay_payment_id } : {}),
            ...(input.razorpay_order_id ? { razorpay_order_id: input.razorpay_order_id } : {}),
            ...(input.event === "trial_started" ? { trial_started_at: timestamp } : {}),
            ...(input.event === "paid" ? { paid_at: timestamp } : {}),
            ...(input.event === "churned" || input.event === "subscription_cancelled" ? { churned_at: timestamp } : {}),
        };

        let contactId = existing?.id as string | undefined;
        if (contactId) {
            const { error } = await serverSupabase.from("contacts").update(fields).eq("id", contactId);
            if (error) throw new Error(error.message);
        } else {
            const { data: created, error } = await serverSupabase.from("contacts").insert({ ...fields, status: "pending" }).select("id").single();
            if (error || !created) throw new Error(error?.message || "Could not create contact.");
            contactId = created.id;
        }

        if (!contactId) throw new Error("Contact ID was not available after upsert.");

        await cancelQueuesForEvent(contactId, input.event);
        const rule = await resolveRule(input.event, input.campaign_id);
        let enrolled = false;
        let message = "Contact updated; no active campaign is configured for this event.";

        if (rule.enabled && rule.campaignId) {
            const { data: campaign, error: campaignError } = await serverSupabase.from("campaigns").select("id,domain_id,status").eq("id", rule.campaignId).maybeSingle();
            if (campaignError) throw new Error(campaignError.message);
            if (!campaign) message = "Contact updated; configured campaign was not found.";
            else if (campaign.status !== "active") message = "Contact updated; configured campaign is not active.";
            else if (existing?.status === "unsubscribed" || existing?.status === "bounced") message = `Contact updated; ${existing.status} contacts are suppressed.`;
            else {
                const { data: duplicateQueue } = await serverSupabase.from("email_queue").select("id").eq("campaign_id", campaign.id).eq("contact_id", contactId).in("status", ["queued", "sending", "sent", "delivered", "opened", "clicked"]).limit(1);
                if (duplicateQueue && duplicateQueue.length > 0) message = "Contact was already enrolled; duplicate queue entry was prevented.";
                else {
                    const scheduledAt = new Date(Date.now() + Math.max(0, rule.delayMinutes) * 60 * 1000).toISOString();
                    const { error: queueError } = await serverSupabase.from("email_queue").insert({ campaign_id: campaign.id, contact_id: contactId, domain_id: campaign.domain_id, sequence_step: 1, scheduled_at: scheduledAt, status: "queued" });
                    if (queueError) throw new Error(queueError.message);
                    enrolled = true;
                    message = "Contact enrolled into the configured campaign.";
                }
            }
        }

        await serverSupabase.from("marketing_event_log").update({ contact_id: contactId, campaign_id: rule.campaignId, status: "processed", processed_at: new Date().toISOString() }).eq("id", log.id);
        return { duplicate: false, contactId, campaignId: rule.campaignId, enrolled, event: input.event, stage: stage || null, message };
    } catch (error) {
        await serverSupabase.from("marketing_event_log").update({ status: "failed", error_message: error instanceof Error ? error.message : "Automation failed" }).eq("id", log.id);
        throw error;
    }
}
