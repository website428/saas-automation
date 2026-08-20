import { NextRequest, NextResponse } from "next/server";
import { marketingEvents, processMarketingEvent, MarketingEventName } from "@/lib/marketing-automation";

function authorized(request: NextRequest) {
    const secret = process.env.MARKETING_WEBHOOK_SECRET;
    if (!secret) return false;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    return request.headers.get("x-marketing-secret") === secret || bearer === secret;
}

export async function GET() {
    return NextResponse.json({ ok: true, service: "marketing-events", requires_secret: true, supported_events: marketingEvents });
}

export async function POST(request: NextRequest) {
    if (!process.env.MARKETING_WEBHOOK_SECRET) return NextResponse.json({ error: "Marketing webhook is disabled until MARKETING_WEBHOOK_SECRET is configured." }, { status: 503 });
    if (!authorized(request)) return NextResponse.json({ error: "Invalid marketing webhook secret." }, { status: 401 });

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    const email = typeof body.email === "string" ? body.email : "";
    const event = typeof body.event === "string" ? body.event.toLowerCase() : "";
    if (!email || !event || !marketingEvents.includes(event as MarketingEventName)) return NextResponse.json({ error: `email and a supported event are required. Events: ${marketingEvents.join(", ")}.` }, { status: 400 });

    try {
        const result = await processMarketingEvent({
            email,
            event: event as MarketingEventName,
            source: typeof body.source === "string" ? body.source : "product",
            event_id: typeof body.event_id === "string" ? body.event_id : undefined,
            occurred_at: typeof body.occurred_at === "string" ? body.occurred_at : undefined,
            name: typeof body.name === "string" ? body.name : undefined,
            company_name: typeof body.company_name === "string" ? body.company_name : undefined,
            job_title: typeof body.job_title === "string" ? body.job_title : undefined,
            campaign_id: typeof body.campaign_id === "string" ? body.campaign_id : undefined,
            metadata: typeof body.metadata === "object" && body.metadata ? body.metadata as Record<string, unknown> : {},
        });
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Marketing automation failed." }, { status: 500 });
    }
}
