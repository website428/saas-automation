"use client";

import { useState } from "react";
import { LockKeyhole, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

type Campaign = { id: string; name: string; status: string };
type Rule = { id: string; event_key: string; campaign_id: string | null; enabled: boolean; delay_minutes: number; stop_events: string[] };

function input(t: any): React.CSSProperties { return { width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, fontSize: 12, outline: "none" }; }

export default function AutomationPage() {
    const { theme: t } = useTheme();
    const [secret, setSecret] = useState("");
    const [rules, setRules] = useState<Rule[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [integrations, setIntegrations] = useState({ marketing_events: false, meta: false, razorpay: false });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [migrationRequired, setMigrationRequired] = useState(false);

    async function load() {
        if (!secret.trim()) return setMessage("Enter MARKETING_WEBHOOK_SECRET first.");
        setLoading(true); setMessage("");
        const response = await fetch("/api/marketing/automation", { headers: { "x-marketing-secret": secret.trim() } });
        const body = await response.json();
        if (!response.ok) setMessage(body.error || "Could not load automation settings.");
        else { setRules(body.rules || []); setCampaigns(body.campaigns || []); setIntegrations(body.integrations || integrations); setMigrationRequired(Boolean(body.migration_required)); }
        setLoading(false);
    }

    function updateRule(eventKey: string, patch: Partial<Rule>) { setRules(previous => previous.map(rule => rule.event_key === eventKey ? { ...rule, ...patch } : rule)); }

    async function save(rule: Rule) {
        setMessage("");
        const response = await fetch("/api/marketing/automation", { method: "POST", headers: { "content-type": "application/json", "x-marketing-secret": secret.trim() }, body: JSON.stringify(rule) });
        const body = await response.json();
        setMessage(response.ok ? `${rule.event_key} saved.` : body.error || "Could not save rule.");
    }

    return <main style={{ maxWidth: 1100, padding: "32px 28px 60px", fontFamily: t.font, color: t.text }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 26 }}><div><h1 style={{ fontSize: 26, margin: 0, letterSpacing: "-0.03em" }}>Automation control</h1><p style={{ color: t.textMuted, fontSize: 14, margin: "7px 0 0" }}>Connect FinModel Pro events to campaigns without exposing campaign configuration publicly.</p></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><LockKeyhole style={{ width: 15, height: 15, color: t.textMuted }} /><input type="password" value={secret} onChange={event => setSecret(event.target.value)} placeholder="Automation secret" style={{ ...input(t), width: 210 }} /><button onClick={load} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", border: 0, borderRadius: 8, background: t.accent, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><RefreshCw style={{ width: 13, height: 13 }} /> {loading ? "Loading…" : "Load"}</button></div></div>
        {message && <div style={{ padding: 12, borderRadius: 8, background: t.cardInner, color: t.textSec, fontSize: 12, marginBottom: 16 }}>{message}</div>}
        {migrationRequired && <div style={{ padding: 14, borderRadius: 10, background: t.amberSoft, color: t.textSec, fontSize: 12, marginBottom: 16 }}>Run migrations `017_finmodel_pro_automation.sql` and `018_razorpay_billing.sql` in Supabase before saving persistent automation rules.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}><div style={{ padding: 16, borderRadius: 12, background: t.card, border: `1px solid ${t.border}` }}><ShieldCheck style={{ width: 16, height: 16, color: integrations.marketing_events ? t.green : t.coral }} /><strong style={{ display: "block", fontSize: 13, marginTop: 9 }}>Product events</strong><span style={{ color: t.textMuted, fontSize: 11 }}>{integrations.marketing_events ? "Secret configured" : "Not configured"}</span></div><div style={{ padding: 16, borderRadius: 12, background: t.card, border: `1px solid ${t.border}` }}><ShieldCheck style={{ width: 16, height: 16, color: integrations.meta ? t.green : t.textMuted }} /><strong style={{ display: "block", fontSize: 13, marginTop: 9 }}>Meta Lead Ads</strong><span style={{ color: t.textMuted, fontSize: 11 }}>{integrations.meta ? "Webhook credentials ready" : "Add Meta credentials"}</span></div><div style={{ padding: 16, borderRadius: 12, background: t.card, border: `1px solid ${t.border}` }}><ShieldCheck style={{ width: 16, height: 16, color: integrations.razorpay ? t.green : t.textMuted }} /><strong style={{ display: "block", fontSize: 13, marginTop: 9 }}>Razorpay billing</strong><span style={{ color: t.textMuted, fontSize: 11 }}>{integrations.razorpay ? "Webhook credentials ready" : "Add Razorpay credentials"}</span></div></div>
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}><div style={{ padding: 18, borderBottom: `1px solid ${t.border}` }}><h2 style={{ margin: 0, fontSize: 16 }}>Event-to-campaign rules</h2><p style={{ color: t.textMuted, fontSize: 12, margin: "5px 0 0" }}>Only active campaigns send. Empty campaign means CRM update only.</p></div>{rules.length === 0 ? <div style={{ padding: 28, color: t.textMuted, fontSize: 12 }}>Load settings after applying the automation migration.</div> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ background: t.cardInner, textAlign: "left" }}><th style={{ padding: 12 }}>Event</th><th style={{ padding: 12 }}>Campaign</th><th style={{ padding: 12 }}>Delay (min)</th><th style={{ padding: 12 }}>Enabled</th><th style={{ padding: 12 }} /></tr></thead><tbody>{rules.map(rule => <tr key={rule.event_key} style={{ borderTop: `1px solid ${t.borderLight}` }}><td style={{ padding: 12, fontWeight: 700 }}>{rule.event_key}</td><td style={{ padding: 12, minWidth: 230 }}><select value={rule.campaign_id || ""} onChange={event => updateRule(rule.event_key, { campaign_id: event.target.value || null })} style={input(t)}><option value="">CRM update only</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name} ({campaign.status})</option>)}</select></td><td style={{ padding: 12, width: 110 }}><input type="number" min={0} max={43200} value={rule.delay_minutes} onChange={event => updateRule(rule.event_key, { delay_minutes: Number(event.target.value) })} style={input(t)} /></td><td style={{ padding: 12 }}><input type="checkbox" checked={rule.enabled} onChange={event => updateRule(rule.event_key, { enabled: event.target.checked })} /></td><td style={{ padding: 12 }}><button onClick={() => save(rule)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 10px", border: 0, borderRadius: 7, background: t.accentSoft, color: t.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Save style={{ width: 12, height: 12 }} /> Save</button></td></tr>)}</tbody></table></div>}</div>
        <div style={{ marginTop: 16, color: t.textMuted, fontSize: 11 }}>Meta endpoint: <code>/api/webhooks/meta</code> · Razorpay endpoint: <code>/api/webhooks/razorpay</code> · Product endpoint: <code>/api/marketing/events</code></div>
    </main>;
}
