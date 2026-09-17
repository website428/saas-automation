import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const configured = [process.env.MARKETING_WEBHOOK_SECRET, process.env.LANDING_PAGE_ADMIN_SECRET].filter(Boolean);
  const supplied = request.headers.get("x-marketing-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return configured.length > 0 && configured.some(secret => secret === supplied);
}

function actionCount(actions: unknown, names: string[]) {
  if (!Array.isArray(actions)) return 0;
  return actions.filter(action => names.includes(String((action as Record<string, unknown>)?.action_type || ""))).reduce((sum, action) => sum + Number((action as Record<string, unknown>)?.value || 0), 0);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Invalid automation admin secret." }, { status: 401 });
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const token = process.env.META_ADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!accountId || !token) return NextResponse.json({ error: "Set META_AD_ACCOUNT_ID and META_ADS_ACCESS_TOKEN in Vercel." }, { status: 503 });

  const preset = ["today", "yesterday", "last_7d", "last_14d", "last_30d"].includes(request.nextUrl.searchParams.get("date_preset") || "") ? request.nextUrl.searchParams.get("date_preset")! : "last_30d";
  const version = process.env.META_GRAPH_API_VERSION || "v23.0";
  const url = new URL(`https://graph.facebook.com/${version}/act_${encodeURIComponent(accountId)}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions");
  url.searchParams.set("date_preset", preset);
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", token);

  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) return NextResponse.json({ error: body?.error?.message || "Meta Ads insights request failed." }, { status: 502 });
    const rows = Array.isArray(body?.data) ? body.data : [];
    const { data: contacts, error } = await serverSupabase.from("contacts").select("meta_campaign_id,last_utm_campaign,lead_score,lead_temperature,pipeline_stage,last_payment_amount").limit(5000);
    if (error) throw error;
    const leadRows = contacts || [];
    const campaigns = rows.map((row: Record<string, unknown>) => {
      const id = String(row.campaign_id || "");
      const name = String(row.campaign_name || "Unnamed campaign");
      const attributed = leadRows.filter(lead => lead.meta_campaign_id === id || lead.last_utm_campaign === name);
      const spend = Number(row.spend || 0);
      const leads = actionCount(row.actions, ["lead", "leadgen_grouped", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]) || attributed.length;
      const revenue = attributed.reduce((sum, lead) => sum + Number(lead.last_payment_amount || 0), 0);
      return { campaign_id: id, campaign_name: name, spend, impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0), ctr: Number(row.ctr || 0), cpc: Number(row.cpc || 0), leads, attributed_leads: attributed.length, qualified_leads: attributed.filter(lead => ["qualified", "audit_booked", "proposal", "pilot", "won"].includes(String(lead.pipeline_stage))).length, customers: attributed.filter(lead => ["pilot", "won"].includes(String(lead.pipeline_stage))).length, attributed_revenue: revenue, cost_per_lead: leads ? spend / leads : 0, roas: spend ? revenue / spend : 0 };
    });
    return NextResponse.json({ date_preset: preset, campaigns, totals: { spend: campaigns.reduce((sum: number, row: { spend: number }) => sum + row.spend, 0), leads: campaigns.reduce((sum: number, row: { leads: number }) => sum + row.leads, 0), attributed_revenue: campaigns.reduce((sum: number, row: { attributed_revenue: number }) => sum + row.attributed_revenue, 0) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Meta Ads insights." }, { status: 500 });
  }
}
