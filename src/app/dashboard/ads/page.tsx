"use client";

import { useEffect, useState } from "react";
import { BarChart3, DollarSign, KeyRound, Loader2, RefreshCw, Target, Users } from "lucide-react";
import { Theme, useTheme } from "@/components/theme-provider";

type AdRow = { campaign_id: string; campaign_name: string; spend: number; impressions: number; clicks: number; ctr: number; cpc: number; leads: number; attributed_leads: number; qualified_leads: number; customers: number; attributed_revenue: number; cost_per_lead: number; roas: number };
type Report = { campaigns: AdRow[]; totals: { spend: number; leads: number; attributed_revenue: number } };

function card(t: Theme): React.CSSProperties { return { background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }; }
function field(t: Theme): React.CSSProperties { return { width: "100%", border: `1px solid ${t.border}`, background: t.cardInner, color: t.text, borderRadius: 9, padding: "10px 11px", fontSize: 14, outline: "none" }; }
function money(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0); }
function integer(value: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0); }

export default function AdsPage() {
  const { theme: t } = useTheme();
  const [secret, setSecret] = useState("");
  const [preset, setPreset] = useState("last_30d");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem("finmodel_admin_secret") || "";
    setSecret(saved);
    if (saved) void load(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(value = secret) {
    if (!value.trim()) { setMessage("Enter the same admin secret used in Setup & Launch."); return; }
    setLoading(true); setMessage(""); sessionStorage.setItem("finmodel_admin_secret", value.trim());
    try {
      const response = await fetch(`/api/meta/insights?date_preset=${encodeURIComponent(preset)}`, { headers: { "x-marketing-secret": value.trim() }, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load Meta Ads insights.");
      setReport(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load Meta Ads insights."); }
    finally { setLoading(false); }
  }

  return <div style={{ display: "grid", gap: 20, fontFamily: t.font, color: t.text }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
      <div><p style={{ margin: 0, color: t.accent, fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Paid acquisition</p><h1 style={{ margin: "7px 0 5px", fontSize: 30, letterSpacing: "-.04em" }}>Ads & Attribution</h1><p style={{ margin: 0, color: t.textSec, fontSize: 13 }}>Compare Meta spend with leads, qualified opportunities, customers and attributed revenue.</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><select value={preset} onChange={event => setPreset(event.target.value)} style={{ ...field(t), width: 140 }}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last_7d">Last 7 days</option><option value="last_14d">Last 14 days</option><option value="last_30d">Last 30 days</option></select><div style={{ display: "flex", gap: 7 }}><div style={{ position: "relative", width: 220 }}><KeyRound size={14} style={{ position: "absolute", left: 10, top: 12, color: t.textMuted }} /><input type="password" value={secret} onChange={event => setSecret(event.target.value)} placeholder="Admin secret" style={{ ...field(t), paddingLeft: 31 }} /></div><button onClick={() => load()} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, borderRadius: 9, padding: "10px 13px", background: t.accent, color: "#fff", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>{loading ? <Loader2 size={16} /> : <RefreshCw size={16} />} Load</button></div></div>
    </header>
    {message && <div style={{ ...card(t), color: t.amber, background: t.amberSoft, fontSize: 13 }}>{message}</div>}
    {!report && !message && <section style={{ ...card(t), textAlign: "center", padding: 48 }}><BarChart3 size={30} color={t.accent} style={{ margin: "0 auto 12px" }} /><h2 style={{ margin: "0 0 7px", fontSize: 20 }}>Load your Meta report</h2><p style={{ margin: 0, color: t.textSec, fontSize: 13 }}>Add META_AD_ACCOUNT_ID and META_ADS_ACCESS_TOKEN in Vercel first.</p></section>}
    {report && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}><div style={card(t)}><DollarSign size={17} color={t.accent} /><p style={{ margin: "12px 0 3px", color: t.textMuted, fontSize: 11 }}>Meta spend</p><strong style={{ fontSize: 24 }}>{money(report.totals.spend)}</strong></div><div style={card(t)}><Users size={17} color={t.accent} /><p style={{ margin: "12px 0 3px", color: t.textMuted, fontSize: 11 }}>Meta leads</p><strong style={{ fontSize: 24 }}>{integer(report.totals.leads)}</strong></div><div style={card(t)}><Target size={17} color={t.accent} /><p style={{ margin: "12px 0 3px", color: t.textMuted, fontSize: 11 }}>Attributed revenue</p><strong style={{ fontSize: 24 }}>{money(report.totals.attributed_revenue)}</strong></div></div>
      <section style={{ ...card(t), overflowX: "auto" }}><h2 style={{ margin: "0 0 16px", fontSize: 17 }}>Campaign performance</h2><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}><thead><tr>{["Campaign", "Spend", "Leads", "Qualified", "Customers", "CPL", "Revenue", "ROAS"].map(label => <th key={label} style={{ textAlign: "left", color: t.textMuted, fontSize: 11, padding: "9px 10px", borderBottom: `1px solid ${t.border}` }}>{label}</th>)}</tr></thead><tbody>{report.campaigns.length === 0 ? <tr><td colSpan={8} style={{ padding: 24, color: t.textMuted }}>No Meta campaign data returned for this period.</td></tr> : report.campaigns.map(row => <tr key={row.campaign_id}><td style={{ padding: "12px 10px", borderBottom: `1px solid ${t.borderLight}`, fontWeight: 700 }}>{row.campaign_name}</td><td style={{ padding: "12px 10px", borderBottom: `1px solid ${t.borderLight}` }}>{money(row.spend)}</td><td style={{ padding: "12px 10px", borderBottom: `1px solid ${t.borderLight}` }}>{integer(row.leads)}</td><td style={{ padding: "12px 10px", borderBottom: `1px solid ${t.borderLight}` }}>{integer(row.qualified_leads)}</td><td style={{ padding: "12px 10px", borderBottom: `1px solid ${t.borderLight}` }}>{integer(row.customers)}</td><td style={{ padding: "12px 10px", borderBottom: `1px solid ${t.borderLight}` }}>{money(row.cost_per_lead)}</td><td style={{ padding: "12px 10px", borderBottom: `1px solid ${t.borderLight}` }}>{money(row.attributed_revenue)}</td><td style={{ padding: "12px 10px", borderBottom: `1px solid ${t.borderLight}`, color: row.roas >= 1 ? t.green : t.textSec }}>{row.roas.toFixed(2)}x</td></tr>)}</tbody></table></section>
    </>}
    <p style={{ margin: 0, color: t.textMuted, fontSize: 11 }}>Website leads are attributed by UTM campaign name; Instant Form leads are attributed by Meta campaign ID. Payment revenue appears after Razorpay events update the contact.</p>
  </div>;
}
