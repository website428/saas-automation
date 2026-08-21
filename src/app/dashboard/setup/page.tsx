"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ArrowRight, Check, CheckCircle2, Circle, ExternalLink, KeyRound,
    Loader2, Mail, Megaphone, RefreshCw, Rocket, Send, Settings2, TestTube2,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

type SetupStatus = {
    integrations: {
        appUrl: boolean; supabase: boolean; resendApi: boolean; resendWebhook: boolean;
        metaPixel: boolean; razorpay: boolean; cronSecret: boolean; publicLeadAutomation: boolean;
    };
    resources: {
        pages: Array<{ id: string; name: string; slug: string }>;
        campaigns: Array<{ id: string; name: string; status: string }>;
        domains: Array<{ id: string; domain_name: string; from_email: string; status: string }>;
        leadRule: { campaign_id: string | null; enabled: boolean; delay_minutes: number } | null;
        linkedCampaign: { id: string; name: string; status: string } | null;
        recentLeadEvent: { status: string; campaign_id: string | null; created_at: string; error_message?: string | null } | null;
        recentQueueItem: { status: string; created_at: string; campaign_id: string } | null;
    };
    checks: { database: boolean; sender: boolean; landingPage: boolean; campaign: boolean; automation: boolean; endToEnd: boolean };
};

type ManualChecks = { cron: boolean; meta: boolean };

function StatusPill({ ready, optional = false }: { ready: boolean; optional?: boolean }) {
    const { theme: t } = useTheme();
    const color = ready ? t.green : optional ? t.blue : t.amber;
    const background = ready ? t.greenSoft : optional ? t.blueSoft : t.amberSoft;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 999, background, color, fontSize: 11, fontWeight: 700 }}>
            {ready ? <CheckCircle2 size={13} /> : <Circle size={13} />}{ready ? "READY" : optional ? "OPTIONAL" : "ACTION NEEDED"}
        </span>
    );
}

function StepCard({ number, title, ready, children, actionHref, actionLabel, external = false }: {
    number: number; title: string; ready: boolean; children: React.ReactNode;
    actionHref: string; actionLabel: string; external?: boolean;
}) {
    const { theme: t } = useTheme();
    const actionStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 9, background: ready ? t.greenSoft : t.accent, color: ready ? t.green : "#fff", textDecoration: "none", fontSize: 13, fontWeight: 700 };
    return (
        <section style={{ border: `1px solid ${ready ? t.greenBorder : t.border}`, borderRadius: 14, background: t.card, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: ready ? t.greenSoft : t.accentSoft, color: ready ? t.green : t.accent, display: "grid", placeItems: "center", fontWeight: 800, flexShrink: 0 }}>{ready ? <Check size={18} /> : number}</div>
                    <h2 style={{ margin: 0, color: t.text, fontSize: 17 }}>{title}</h2>
                </div>
                <StatusPill ready={ready} />
            </div>
            <div style={{ margin: "16px 0 18px 46px", color: t.textSec, fontSize: 13, lineHeight: 1.65 }}>{children}</div>
            <div style={{ marginLeft: 46 }}>
                {external ? <a href={actionHref} target="_blank" rel="noreferrer" style={actionStyle}>{actionLabel}<ExternalLink size={14} /></a> : <Link href={actionHref} style={actionStyle}>{actionLabel}<ArrowRight size={14} /></Link>}
            </div>
        </section>
    );
}

export default function SetupPage() {
    const { theme: t } = useTheme();
    const [secret, setSecret] = useState("");
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [manual, setManual] = useState<ManualChecks>({ cron: false, meta: false });

    useEffect(() => {
        setSecret(sessionStorage.getItem("finmodel_admin_secret") || "");
        try {
            const saved = JSON.parse(localStorage.getItem("finmodel_launch_checks") || "{}");
            setManual({ cron: Boolean(saved.cron), meta: Boolean(saved.meta) });
        } catch { /* ignore invalid local preference */ }
    }, []);

    async function checkSetup() {
        if (!secret.trim()) { setError("Enter your Landing Page Admin Secret first."); return; }
        setLoading(true); setError("");
        try {
            sessionStorage.setItem("finmodel_admin_secret", secret.trim());
            const response = await fetch("/api/setup-status", { headers: { "x-marketing-secret": secret.trim() }, cache: "no-store" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not check setup.");
            setStatus(result);
        } catch (caught) {
            setStatus(null);
            setError(caught instanceof Error ? caught.message : "Could not check setup.");
        } finally { setLoading(false); }
    }

    function toggleManual(key: keyof ManualChecks) {
        const next = { ...manual, [key]: !manual[key] };
        setManual(next);
        localStorage.setItem("finmodel_launch_checks", JSON.stringify(next));
    }

    const steps = useMemo(() => [
        Boolean(status?.checks.database && status.integrations.appUrl),
        Boolean(status?.checks.sender && status.integrations.resendWebhook),
        Boolean(status?.checks.landingPage), Boolean(status?.checks.campaign),
        Boolean(status?.checks.automation && status.integrations.publicLeadAutomation),
        Boolean(status?.integrations.cronSecret && manual.cron), Boolean(status?.checks.endToEnd),
        Boolean(status?.integrations.metaPixel && manual.meta),
    ], [status, manual]);
    const completed = steps.filter(Boolean).length;
    const progress = Math.round((completed / steps.length) * 100);
    const page = status?.resources.pages[0];
    const nextLabels = ["Connect the platform", "Connect email delivery", "Publish a landing page", "Create an email campaign", "Connect lead automation", "Confirm the queue worker", "Submit a test lead", "Verify Meta events"];
    const nextIndex = steps.findIndex((item) => !item);

    return (
        <div style={{ fontFamily: t.font, maxWidth: 1040, margin: "0 auto" }}>
            <header style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, color: t.accent, fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}><Rocket size={16} /> Start here</div>
                <h1 style={{ margin: "9px 0 8px", color: t.text, fontSize: "clamp(28px, 4vw, 40px)", letterSpacing: "-.04em" }}>Setup & Launch</h1>
                <p style={{ margin: 0, color: t.textSec, fontSize: 15, lineHeight: 1.6 }}>Follow these steps in order. The platform checks your real Vercel and Supabase setup and shows exactly what to do next.</p>
            </header>

            <section style={{ padding: 20, borderRadius: 14, background: t.card, border: `1px solid ${t.border}`, marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, color: t.text, fontWeight: 700, marginBottom: 12 }}><KeyRound size={17} color={t.accent} /> Check my live setup</div>
                <div className="setup-secret-row" style={{ display: "flex", gap: 10 }}>
                    <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} onKeyDown={(event) => event.key === "Enter" && checkSetup()} placeholder="Paste LANDING_PAGE_ADMIN_SECRET" style={{ flex: 1, minWidth: 0, background: t.cardInner, border: `1px solid ${t.border}`, borderRadius: 9, color: t.text, padding: "11px 13px", outline: "none" }} />
                    <button onClick={checkSetup} disabled={loading} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 9, background: t.accent, color: "#fff", padding: "11px 16px", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>{loading ? <Loader2 className="spin" size={16} /> : status ? <RefreshCw size={16} /> : <Settings2 size={16} />}{status ? "Check again" : "Check setup"}</button>
                </div>
                <p style={{ margin: "9px 0 0", color: t.textMuted, fontSize: 11 }}>Used only for this browser session. It is never displayed or stored in the database.</p>
                {error && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: t.coralSoft, color: t.coral, fontSize: 13 }}>{error}</div>}
            </section>

            <section style={{ padding: 20, borderRadius: 14, background: t.card, border: `1px solid ${t.border}`, marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 11 }}><strong style={{ color: t.text }}>{completed} of {steps.length} steps ready</strong><span style={{ color: t.textSec, fontSize: 13 }}>{progress}%</span></div>
                <div style={{ height: 9, background: t.cardInner, borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${progress}%`, background: progress === 100 ? t.green : t.accent, borderRadius: 99, transition: "width .3s ease" }} /></div>
                <div style={{ marginTop: 13, color: nextIndex === -1 ? t.green : t.textSec, fontSize: 13, fontWeight: 600 }}>{nextIndex === -1 ? "You are ready to run Meta ads." : `Recommended next step: ${nextLabels[nextIndex]}`}</div>
            </section>

            <div style={{ display: "grid", gap: 12 }}>
                <StepCard number={1} title="Connect the platform" ready={steps[0]} actionHref="/dashboard/database" actionLabel="Open Database Status">
                    <ol><li>Add Supabase URL, service-role key, app URL and admin secret in Vercel.</li><li>Run database migrations 001–019 in Supabase.</li><li>Redeploy, then click <b>Check setup</b> above.</li></ol>
                </StepCard>
                <StepCard number={2} title="Connect email delivery" ready={steps[1]} actionHref="/dashboard/domains" actionLabel="Open Sending Domains">
                    <ol><li>Verify your sending subdomain in Resend.</li><li>Add RESEND_API_KEY and RESEND_WEBHOOK_SECRET in Vercel.</li><li>Confirm one sender domain shows Warming or Warm.</li></ol>
                    {status?.resources.domains[0] && <p style={{ color: t.green, marginBottom: 0 }}>Detected: {status.resources.domains[0].from_email}</p>}
                </StepCard>
                <StepCard number={3} title="Publish your landing page" ready={steps[2]} actionHref="/dashboard/marketing?tab=landing-pages" actionLabel="Open Landing Page Builder">
                    <ol><li>Create a page and edit its sections.</li><li>Add a lead form and a clear offer.</li><li>Set status to Published and save it.</li></ol>
                    {page && <p style={{ color: t.green, marginBottom: 0 }}>Published: <a style={{ color: t.green }} href={`/p/${page.slug}`} target="_blank" rel="noreferrer">{page.name}</a></p>}
                </StepCard>
                <StepCard number={4} title="Create the welcome email campaign" ready={steps[3]} actionHref="/dashboard/campaigns/new" actionLabel="Create Campaign">
                    <ol><li>Select your verified sender domain.</li><li>Write the first email and follow-up sequence.</li><li>Add a test contact if needed, then set the campaign to Active.</li></ol>
                    {status?.resources.campaigns[0] && <p style={{ color: t.green, marginBottom: 0 }}>Active: {status.resources.campaigns[0].name}</p>}
                </StepCard>
                <StepCard number={5} title="Connect new leads to the campaign" ready={steps[4]} actionHref="/dashboard/automation" actionLabel="Open Automation">
                    <ol><li>Find the <b>lead_created</b> rule.</li><li>Select your active welcome campaign.</li><li>Enable the rule, choose the delay, and save.</li></ol>
                    {status?.resources.linkedCampaign && <p style={{ color: t.green, marginBottom: 0 }}>Connected to {status.resources.linkedCampaign.name} with a {status.resources.leadRule?.delay_minutes || 0}-minute delay.</p>}
                </StepCard>
                <StepCard number={6} title="Confirm the 24×7 queue worker" ready={steps[5]} actionHref="/dashboard/queue" actionLabel="Open Email Queue">
                    <ol><li>Keep CRON_SECRET in Vercel.</li><li>In Supabase Cron, confirm the queue job shows Succeeded.</li><li>Tick this confirmation once you have checked it.</li></ol>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, color: t.text, cursor: "pointer" }}><input type="checkbox" checked={manual.cron} onChange={() => toggleManual("cron")} /> I confirmed Supabase Cron is succeeding</label>
                </StepCard>
                <StepCard number={7} title="Run one complete test lead" ready={steps[6]} actionHref={page ? `/p/${page.slug}` : "/dashboard/marketing?tab=landing-pages"} actionLabel={page ? "Open Published Page" : "Create Landing Page"}>
                    <ol><li>Open the published page in an incognito window.</li><li>Submit an email address you can check.</li><li>Confirm it appears in Leads, then Queue, then Sent.</li></ol>
                    {status?.resources.recentLeadEvent && <p style={{ marginBottom: 0, color: status.resources.recentLeadEvent.campaign_id ? t.green : t.amber }}>Latest lead: {status.resources.recentLeadEvent.status}{!status.resources.recentLeadEvent.campaign_id ? " — no campaign connected yet" : " — campaign connected"}</p>}
                </StepCard>
                <StepCard number={8} title="Connect Meta Ads and launch" ready={steps[7]} actionHref="https://business.facebook.com/events_manager2" actionLabel="Open Meta Events Manager" external>
                    <ol><li>Add NEXT_PUBLIC_META_PIXEL_ID in Vercel and redeploy.</li><li>Use Meta Test Events and open your published page.</li><li>Submit the form and confirm PageView and Lead events appear.</li><li>Create a Traffic or Sales ad and use the published page URL as the destination.</li></ol>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, color: t.text, cursor: "pointer" }}><input type="checkbox" checked={manual.meta} onChange={() => toggleManual("meta")} /> I confirmed PageView and Lead in Meta Test Events</label>
                </StepCard>
            </div>

            <section style={{ marginTop: 18, padding: 20, borderRadius: 14, background: t.accentSoft, border: `1px solid ${t.accentBorder}` }}>
                <h2 style={{ margin: "0 0 12px", color: t.text, fontSize: 17 }}>What happens automatically after launch</h2>
                <div className="setup-flow" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {[[Megaphone, "Meta ad"], [TestTube2, "Lead form"], [Settings2, "Automation"], [Mail, "Email queue"], [Send, "Resend sends"]].map(([Icon, label], index) => {
                        const FlowIcon = Icon as typeof Mail;
                        return <div key={String(label)} style={{ padding: 12, borderRadius: 10, background: t.card, color: t.text, textAlign: "center", fontSize: 12, fontWeight: 700 }}><FlowIcon size={17} color={t.accent} style={{ marginBottom: 6 }} /><div>{String(label)}</div>{index < 4 && <span className="flow-arrow" style={{ color: t.textMuted }}>→</span>}</div>;
                    })}
                </div>
                <p style={{ color: t.textSec, fontSize: 13, lineHeight: 1.6, margin: "13px 0 0" }}>You only monitor Leads, Queue, Replies and Analytics. The landing form creates the contact, the lead automation assigns the campaign, and the cron worker sends due emails through Resend.</p>
            </section>

            <style>{`
                .setup-secret-row button:disabled { opacity: .7; }
                .spin { animation: setup-spin 1s linear infinite; }
                @keyframes setup-spin { to { transform: rotate(360deg); } }
                section ol { margin: 0; padding-left: 18px; }
                section ol li + li { margin-top: 5px; }
                .flow-arrow { display: block; margin-top: 6px; }
                @media (max-width: 700px) {
                    .setup-secret-row { flex-direction: column; }
                    .setup-flow { grid-template-columns: 1fr !important; }
                    .flow-arrow { transform: rotate(90deg); }
                }
            `}</style>
        </div>
    );
}
