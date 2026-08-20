"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Bot, Check, CheckCircle2, ChevronRight, Clipboard, Copy, Download, Filter, Mail, Megaphone, Plus, RefreshCw, Sparkles, Target, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchDashboardStats, fetchCampaigns, DashboardStats, CampaignRow } from "@/lib/data";
import { Theme, useTheme } from "@/components/theme-provider";
import LandingPagesBuilder from "@/components/landing-pages-builder";

type ContactRow = {
    id: string;
    email: string;
    name: string | null;
    company_name: string | null;
    job_title: string | null;
    website: string | null;
    personalization: string | null;
    tags: string[] | null;
    status: string;
    created_at: string;
};

type QueueRow = { id: string; status: string; scheduled_at: string };
type LeadStage = "New" | "Contacted" | "Qualified" | "Trial" | "Customer" | "Nurture" | "Churned";
type ScoredLead = ContactRow & { score: number; segment: "Hot" | "Warm" | "Nurture"; stage: LeadStage; reason: string };
type SegmentFilter = "All" | ScoredLead["segment"];
type MarketingTask = { id: string; title: string; detail: string; done: boolean };
type ContentIdea = { id: string; title: string; channel: string; status: "Idea" | "Draft" | "Ready" | "Published"; date: string };

const defaultTasks: MarketingTask[] = [
    { id: "task-1", title: "Review hot leads", detail: "Choose the next action for your highest-intent contacts.", done: false },
    { id: "task-2", title: "Personalize one campaign", detail: "Use AI Personalize Selected before launching.", done: false },
    { id: "task-3", title: "Check campaign performance", detail: "Review opens, clicks, replies, and bounces.", done: false },
];

const defaultContent: ContentIdea[] = [
    { id: "content-1", title: "The 5 numbers founders should review weekly", channel: "LinkedIn", status: "Idea", date: "" },
    { id: "content-2", title: "A short case study from one customer conversation", channel: "Newsletter", status: "Draft", date: "" },
];

const pipelineStages: LeadStage[] = ["New", "Contacted", "Qualified", "Trial", "Customer", "Nurture", "Churned"];
type OutreachTemplate = { id: string; name: string; subject: string; body: string };
const defaultTemplates: OutreachTemplate[] = [
    { id: "template-1", name: "Warm introduction", subject: "A useful idea for {{company}}", body: "Hi {{first_name}},\n\nI noticed {{company}} may be working on {{role}} priorities. I have one practical idea that may help.\n\nWould it be useful if I sent it over?" },
    { id: "template-2", name: "Trial activation", subject: "A faster path to your first result", body: "Hi {{first_name}},\n\nThe next useful step after starting a trial is usually reaching one measurable result. I can share a short checklist for {{company}}.\n\nWould you like me to send it?" },
    { id: "template-3", name: "Respectful close", subject: "Should I close the loop?", body: "Hi {{first_name}},\n\nI do not want to crowd your inbox. If this is not a priority, I can close the loop; if it is, I am happy to send one concise next step.\n\nBest," },
];
const eventTypes = ["lead_created", "trial_started", "activated", "paid", "refunded", "demo_booked", "email_clicked", "churned"] as const;

function getLeadStage(contact: ContactRow): LeadStage {
    const stageTag = (contact.tags || []).find(tag => tag.toLowerCase().startsWith("stage:"));
    const stage = stageTag?.slice(6).toLowerCase();
    const match: Record<string, LeadStage> = { new: "New", contacted: "Contacted", qualified: "Qualified", trial: "Trial", customer: "Customer", nurture: "Nurture", churned: "Churned" };
    return (stage && match[stage]) || "New";
}

const css = `
  .marketing-grid { display:grid; grid-template-columns: minmax(0, 1.45fr) minmax(300px, .8fr); gap:20px; }
  .marketing-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
  .marketing-two { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .stack-grid { grid-template-columns:repeat(4,1fr); }
  @media (max-width: 1050px) { .marketing-stats { grid-template-columns:repeat(2,1fr); } .marketing-grid,.marketing-two { grid-template-columns:1fr; } .stack-grid { grid-template-columns:repeat(2,1fr) !important; } }
  @media (max-width: 560px) { .marketing-stats { grid-template-columns:1fr 1fr; gap:10px; } .marketing-stat { padding:15px !important; } .marketing-stat-num { font-size:22px !important; } .marketing-header { align-items:flex-start !important; flex-direction:column; gap:14px; } .lead-meta { display:none; } .stack-grid { grid-template-columns:1fr !important; } }
`;

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" };
}

function label(t: Theme): React.CSSProperties {
    return { fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: t.textMuted, fontFamily: t.font };
}

function inputStyle(t: Theme): React.CSSProperties {
    return { width: "100%", padding: "10px 12px", borderRadius: "9px", border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, fontSize: "13px", outline: "none", fontFamily: t.font };
}

function getScore(contact: ContactRow): ScoredLead {
    let score = 10;
    const reasons: string[] = [];
    if (contact.job_title && /founder|ceo|cfo|cto|vp|director|head/i.test(contact.job_title)) { score += 25; reasons.push("decision maker"); }
    if (contact.company_name) { score += 10; reasons.push("company identified"); }
    if (contact.website) { score += 10; reasons.push("website available"); }
    if (contact.personalization) { score += 10; reasons.push("personalized"); }
    const tags = (contact.tags || []).map(tag => tag.toLowerCase());
    if (tags.some(tag => /qualified|hot|priority|interested/.test(tag))) { score += 25; reasons.push("intent tag"); }
    if (tags.some(tag => /trial|demo|reply|engaged/.test(tag))) { score += 15; reasons.push("engagement tag"); }
    if (contact.status === "sent") { score += 5; reasons.push("contacted"); }
    score = Math.min(100, score);
    const segment = score >= 70 ? "Hot" : score >= 45 ? "Warm" : "Nurture";
    return { ...contact, score, segment, stage: getLeadStage(contact), reason: reasons.slice(0, 2).join(" · ") || "needs qualification" };
}

function SegmentBadge({ segment, t }: { segment: ScoredLead["segment"]; t: Theme }) {
    const meta = segment === "Hot" ? { color: t.coral, bg: t.coralSoft } : segment === "Warm" ? { color: t.amber, bg: t.amberSoft } : { color: t.textMuted, bg: t.cardInner };
    return <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "99px", color: meta.color, background: meta.bg, fontSize: "11px", fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />{segment}</span>;
}

function Metric({ title, value, note, icon: Icon, t }: { title: string; value: string | number; note: string; icon: typeof Users; t: Theme }) {
    return <div className="marketing-stat" style={{ ...card(t), padding: "19px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={label(t)}>{title}</span><div style={{ width: 29, height: 29, borderRadius: 8, background: t.cardInner, display: "grid", placeItems: "center" }}><Icon style={{ width: 14, height: 14, color: t.textMuted }} /></div></div><div className="marketing-stat-num" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.04em", color: t.text, marginTop: 13 }}>{value}</div><div style={{ color: t.textMuted, fontSize: 11, marginTop: 7 }}>{note}</div></div>;
}

function PipelineBoard({ leads, t, onSelect }: { leads: ScoredLead[]; t: Theme; onSelect: (lead: ScoredLead) => void }) {
    return <div style={{ ...card(t), padding: 22, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Sales pipeline</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>Move leads through the journey without leaving the marketing workspace.</p></div><span style={{ color: t.textMuted, fontSize: 11 }}>{leads.length} total leads · click a card to open details</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(145px, 1fr))", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {pipelineStages.map(stage => { const stageLeads = leads.filter(lead => lead.stage === stage); return <div key={stage} style={{ background: t.cardInner, borderRadius: 10, padding: 10, minHeight: 128 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><span style={{ color: t.text, fontSize: 11, fontWeight: 700 }}>{stage}</span><span style={{ color: t.textMuted, fontSize: 11, fontFamily: t.mono }}>{stageLeads.length}</span></div><div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{stageLeads.slice(0, 4).map(lead => <button key={lead.id} onClick={() => onSelect(lead)} style={{ textAlign: "left", border: "1px solid " + t.borderLight, background: t.card, borderRadius: 8, padding: 9, cursor: "pointer" }}><div style={{ color: t.text, fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.name || lead.email}</div><div style={{ color: t.textMuted, fontSize: 10, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.company_name || lead.email}</div><div style={{ marginTop: 6 }}><SegmentBadge segment={lead.segment} t={t} /></div></button>)}{stageLeads.length > 4 && <span style={{ color: t.textMuted, fontSize: 10, padding: "3px 2px" }}>+ {stageLeads.length - 4} more</span>}{stageLeads.length === 0 && <span style={{ color: t.textMuted, fontSize: 10, padding: "12px 2px" }}>No leads here</span>}</div></div>; })}
        </div>
    </div>;
}

function BulkLeadToolbar({ count, stage, onStageChange, onMove, saving, message, t }: { count: number; stage: LeadStage; onStageChange: (stage: LeadStage) => void; onMove: () => void; saving: boolean; message: string; t: Theme }) {
    return <div style={{ ...card(t), padding: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}><div style={{ flex: 1, minWidth: 220 }}><strong style={{ color: t.text, fontSize: 13 }}>Bulk pipeline action</strong><p style={{ color: t.textMuted, fontSize: 11, margin: "4px 0 0" }}>Moves the current filtered lead view ({count}) to a new lifecycle stage.</p></div><select value={stage} onChange={event => onStageChange(event.target.value as LeadStage)} style={{ ...inputStyle(t), width: 145, padding: "8px 10px" }}>{pipelineStages.map(option => <option key={option}>{option}</option>)}</select><button onClick={onMove} disabled={saving || count === 0} style={{ padding: "9px 12px", borderRadius: 8, border: 0, background: t.accent, color: "#fff", fontSize: 11, fontWeight: 700, cursor: count ? "pointer" : "not-allowed" }}>{saving ? "Updating…" : "Move filtered leads"}</button>{message && <span style={{ color: t.green, fontSize: 11, fontWeight: 600 }}>{message}</span>}</div>;
}

function TemplateStudio({ templates, t, copied, onCopy, onAdd }: { templates: OutreachTemplate[]; t: Theme; copied: string; onCopy: (template: OutreachTemplate) => void; onAdd: () => void }) {
    return <div style={{ ...card(t), padding: 22 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Outreach template studio</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>Reusable messages with {"{{first_name}}"}, {"{{company}}"}, and {"{{role}}"} placeholders.</p></div><button onClick={onAdd} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: 0, background: t.accentSoft, color: t.accent, borderRadius: 8, padding: "8px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Plus style={{ width: 13, height: 13 }} /> Add template</button></div><div style={{ display: "grid", gap: 9 }}>{templates.map(template => <div key={template.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 9, background: t.cardInner }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ color: t.text, fontSize: 12, fontWeight: 700 }}>{template.name}</div><div style={{ color: t.textMuted, fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{template.subject}</div></div><button onClick={() => onCopy(template)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, borderRadius: 7, padding: "7px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{copied === template.id ? <Check style={{ width: 12, height: 12, color: t.green }} /> : <Copy style={{ width: 12, height: 12 }} />}{copied === template.id ? "Copied" : "Copy"}</button></div>)}</div></div>;
}

function EventSnippetGenerator({ campaigns, eventType, setEventType, campaignId, setCampaignId, snippet, copied, onCopy, t }: { campaigns: CampaignRow[]; eventType: (typeof eventTypes)[number]; setEventType: (value: (typeof eventTypes)[number]) => void; campaignId: string; setCampaignId: (value: string) => void; snippet: string; copied: boolean; onCopy: () => void; t: Theme }) {
    const activeCampaigns = campaigns.filter(campaign => campaign.status === "active");
    return <div style={{ ...card(t), padding: 22 }}><div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 15 }}><div style={{ width: 32, height: 32, borderRadius: 9, background: t.accentSoft, color: t.accent, display: "grid", placeItems: "center" }}><Bot style={{ width: 16, height: 16 }} /></div><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Event automation builder</h2><p style={{ margin: "4px 0 0", fontSize: 12, color: t.textMuted }}>Generate the product integration snippet for your next lifecycle event.</p></div></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 10, marginBottom: 12 }}><label style={{ color: t.textSec, fontSize: 11 }}>Event<select value={eventType} onChange={event => setEventType(event.target.value as (typeof eventTypes)[number])} style={{ ...inputStyle(t), marginTop: 5, padding: "8px 10px" }}>{eventTypes.map(option => <option key={option}>{option}</option>)}</select></label><label style={{ color: t.textSec, fontSize: 11 }}>Enroll into campaign (optional)<select value={campaignId} onChange={event => setCampaignId(event.target.value)} style={{ ...inputStyle(t), marginTop: 5, padding: "8px 10px" }}><option value="">CRM update only</option>{activeCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label></div><pre style={{ margin: 0, padding: 12, borderRadius: 9, background: t.cardInner, color: t.textSec, fontSize: 10, lineHeight: 1.55, overflowX: "auto", whiteSpace: "pre-wrap" }}>{snippet}</pre><button onClick={onCopy} style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: t.accent, color: "#fff", borderRadius: 8, padding: "9px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}{copied ? "Snippet copied" : "Copy integration snippet"}</button></div>;
}

function TemplateModal({ open, form, setForm, onClose, onSubmit, t }: { open: boolean; form: { name: string; subject: string; body: string }; setForm: (form: { name: string; subject: string; body: string }) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; t: Theme }) {
    if (!open) return null;
    return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 110, display: "grid", placeItems: "center", padding: 20 }}><div onClick={event => event.stopPropagation()} style={{ ...card(t), width: "min(560px,100%)", padding: 24 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}><div><h2 style={{ margin: 0, color: t.text, fontSize: 18 }}>Add outreach template</h2><p style={{ color: t.textMuted, fontSize: 12, margin: "5px 0 0" }}>Use {"{{first_name}}"}, {"{{company}}"}, and {"{{role}}"} for personalization.</p></div><button onClick={onClose} style={{ border: 0, background: t.cardInner, color: t.textMuted, borderRadius: 7, width: 28, height: 28, cursor: "pointer" }}><X style={{ width: 14, height: 14 }} /></button></div><form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}><label style={{ color: t.textSec, fontSize: 12 }}>Template name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} placeholder="Customer proof follow-up" /></label><label style={{ color: t.textSec, fontSize: 12 }}>Subject<input required value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} placeholder="A useful idea for {{company}}" /></label><label style={{ color: t.textSec, fontSize: 12 }}>Body<textarea required value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} rows={7} style={{ ...inputStyle(t), marginTop: 5, resize: "vertical" }} placeholder="Hi {{first_name}}, ..." /></label><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" onClick={onClose} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, cursor: "pointer", fontSize: 12 }}>Cancel</button><button style={{ padding: "10px 15px", borderRadius: 8, border: 0, background: t.accent, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Save template</button></div></form></div></div>;
}

function formatDate(value: string) { return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); }

export default function MarketingPage() {
    const { theme: t } = useTheme();
    const searchParams = useSearchParams();
    const [contacts, setContacts] = useState<ContactRow[]>([]);
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
    const [queue, setQueue] = useState<QueueRow[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [search, setSearch] = useState("");
    const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("All");
    const [selectedLead, setSelectedLead] = useState<ScoredLead | null>(null);
    const [tasks, setTasks] = useState<MarketingTask[]>(defaultTasks);
    const [contentIdeas, setContentIdeas] = useState<ContentIdea[]>(defaultContent);
    const [showContent, setShowContent] = useState(false);
    const [contentForm, setContentForm] = useState({ title: "", channel: "LinkedIn", date: "" });
    const [briefCopied, setBriefCopied] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", company_name: "", job_title: "", intent: "new" });
    const [bulkStage, setBulkStage] = useState<LeadStage>("Contacted");
    const [bulkMessage, setBulkMessage] = useState("");
    const [templates, setTemplates] = useState<OutreachTemplate[]>(defaultTemplates);
    const [showTemplate, setShowTemplate] = useState(false);
    const [templateForm, setTemplateForm] = useState({ name: "", subject: "", body: "" });
    const [templateCopied, setTemplateCopied] = useState("");
    const [eventType, setEventType] = useState<(typeof eventTypes)[number]>("trial_started");
    const [eventCampaignId, setEventCampaignId] = useState("");
    const [eventSnippetCopied, setEventSnippetCopied] = useState(false);

    async function load() {
        setLoading(true);
        const [contactResult, queueResult, campaignData, statsData] = await Promise.all([
            supabase.from("contacts").select("id,email,name,company_name,job_title,website,personalization,tags,status,created_at").order("created_at", { ascending: false }).limit(500),
            supabase.from("email_queue").select("id,status,scheduled_at").in("status", ["queued", "sending"]).order("scheduled_at", { ascending: true }).limit(100),
            fetchCampaigns(),
            fetchDashboardStats(),
        ]);
        setContacts((contactResult.data || []) as ContactRow[]);
        setQueue((queueResult.data || []) as QueueRow[]);
        setCampaigns(campaignData);
        setStats(statsData);
        setLoading(false);
    }

    useEffect(() => {
        load();
        try {
            const stored = window.localStorage.getItem("coldreach-marketing-tasks");
            if (stored) setTasks(JSON.parse(stored));
            const storedContent = window.localStorage.getItem("coldreach-marketing-content");
            if (storedContent) setContentIdeas(JSON.parse(storedContent));
            const storedTemplates = window.localStorage.getItem("coldreach-marketing-templates");
            if (storedTemplates) setTemplates(JSON.parse(storedTemplates));
        } catch { /* keep the default checklist */ }
    }, []);

    useEffect(() => {
        try { window.localStorage.setItem("coldreach-marketing-tasks", JSON.stringify(tasks)); } catch { /* local storage is optional */ }
    }, [tasks]);

    useEffect(() => {
        try { window.localStorage.setItem("coldreach-marketing-content", JSON.stringify(contentIdeas)); } catch { /* local storage is optional */ }
    }, [contentIdeas]);

    useEffect(() => {
        try { window.localStorage.setItem("coldreach-marketing-templates", JSON.stringify(templates)); } catch { /* local storage is optional */ }
    }, [templates]);

    const leads = useMemo(() => contacts.map(getScore), [contacts]);
    const filteredLeads = useMemo(() => leads.filter(lead => {
        const matchesSearch = `${lead.name || ""} ${lead.email} ${lead.company_name || ""} ${lead.job_title || ""}`.toLowerCase().includes(search.toLowerCase());
        return matchesSearch && (segmentFilter === "All" || lead.segment === segmentFilter);
    }).slice(0, 10), [leads, search, segmentFilter]);
    const hot = leads.filter(lead => lead.segment === "Hot");
    const warm = leads.filter(lead => lead.segment === "Warm");

    async function addLead(event: FormEvent) {
        event.preventDefault();
        if (!form.email.trim()) return;
        setSaving(true);
        const tags = ["marketing-lead", form.intent === "new" ? "new" : form.intent];
        const { error } = await supabase.from("contacts").insert({ email: form.email.trim().toLowerCase(), name: form.name.trim() || null, company_name: form.company_name.trim() || null, job_title: form.job_title.trim() || null, tags });
        if (!error) { setForm({ name: "", email: "", company_name: "", job_title: "", intent: "new" }); setShowAdd(false); await load(); }
        setSaving(false);
    }

    async function markQualified(lead: ScoredLead) {
        const tags = Array.from(new Set([...(lead.tags || []).filter(tag => !tag.toLowerCase().startsWith("stage:")), "marketing-lead", "qualified", "stage:qualified"]));
        const { error } = await supabase.from("contacts").update({ tags }).eq("id", lead.id);
        if (!error) { setSelectedLead(null); await load(); }
    }

    async function updateLeadStage(lead: ScoredLead, stage: LeadStage) {
        const tags = Array.from(new Set([...(lead.tags || []).filter(tag => !tag.toLowerCase().startsWith("stage:")), `stage:${stage.toLowerCase()}`]));
        const { error } = await supabase.from("contacts").update({ tags }).eq("id", lead.id);
        if (!error) { setSelectedLead(null); await load(); }
    }

    async function copyOutreachBrief(lead: ScoredLead) {
        const firstName = (lead.name || "there").split(" ")[0];
        const brief = `Subject: A useful next step for ${lead.company_name || "your team"}\n\nHi ${firstName},\n\nI noticed ${lead.company_name || "your team"} may be thinking about ${lead.job_title ? `priorities for ${lead.job_title}` : "this problem"}. We help teams take the next step with a practical, low-friction approach.\n\nWould it be useful if I shared a short idea tailored to your situation?\n\nBest,`;
        try { await navigator.clipboard.writeText(brief); setBriefCopied(true); setTimeout(() => setBriefCopied(false), 1800); } catch { /* clipboard is optional */ }
    }

    function toggleTask(taskId: string) {
        setTasks(previous => previous.map(task => task.id === taskId ? { ...task, done: !task.done } : task));
    }

    function addContentIdea(event: FormEvent) {
        event.preventDefault();
        if (!contentForm.title.trim()) return;
        setContentIdeas(previous => [{ id: `content-${Date.now()}`, title: contentForm.title.trim(), channel: contentForm.channel, status: "Idea", date: contentForm.date }, ...previous]);
        setContentForm({ title: "", channel: "LinkedIn", date: "" });
        setShowContent(false);
    }

    function cycleContentStatus(id: string) {
        const statuses: ContentIdea["status"][] = ["Idea", "Draft", "Ready", "Published"];
        setContentIdeas(previous => previous.map(item => {
            if (item.id !== id) return item;
            return { ...item, status: statuses[(statuses.indexOf(item.status) + 1) % statuses.length] };
        }));
    }

    async function bulkMoveLeads() {
        if (!filteredLeads.length) return;
        setSaving(true);
        const selected = filteredLeads;
        const results = await Promise.all(selected.map(lead => {
            const tags = Array.from(new Set([...(lead.tags || []).filter(tag => !tag.toLowerCase().startsWith("stage:")), `stage:${bulkStage.toLowerCase()}`]));
            return supabase.from("contacts").update({ tags }).eq("id", lead.id);
        }));
        const failed = results.filter(result => result.error).length;
        setBulkMessage(failed ? `${failed} lead${failed === 1 ? "" : "s"} could not be updated.` : `${selected.length} lead${selected.length === 1 ? "" : "s"} moved to ${bulkStage}.`);
        await load();
        setSaving(false);
        setTimeout(() => setBulkMessage(""), 2600);
    }

    async function copyTemplate(template: OutreachTemplate, lead?: ScoredLead) {
        const firstName = (lead?.name || "there").split(" ")[0];
        const subject = template.subject.replaceAll("{{company}}", lead?.company_name || "your team");
        const body = template.body.replaceAll("{{first_name}}", firstName).replaceAll("{{company}}", lead?.company_name || "your team").replaceAll("{{role}}", lead?.job_title || "your role");
        try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); setTemplateCopied(template.id); setTimeout(() => setTemplateCopied(""), 1800); } catch { /* clipboard is optional */ }
    }

    function addTemplate(event: FormEvent) {
        event.preventDefault();
        if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()) return;
        setTemplates(previous => [...previous, { id: `template-${Date.now()}`, name: templateForm.name.trim(), subject: templateForm.subject.trim(), body: templateForm.body.trim() }]);
        setTemplateForm({ name: "", subject: "", body: "" });
        setShowTemplate(false);
    }

    const eventSnippet = `fetch("/api/marketing/events", {\n  method: "POST",\n  headers: {\n    "content-type": "application/json",\n    "x-marketing-secret": process.env.MARKETING_WEBHOOK_SECRET\n  },\n  body: JSON.stringify({\n    email: user.email,\n    event: "${eventType}"${eventCampaignId ? `,\n    campaign_id: "${eventCampaignId}"` : ""}\n  })\n});`;

    async function copyEventSnippet() {
        try { await navigator.clipboard.writeText(eventSnippet); setEventSnippetCopied(true); setTimeout(() => setEventSnippetCopied(false), 1800); } catch { /* clipboard is optional */ }
    }

    function exportLeads() {
        const headers = ["name", "email", "company", "job_title", "segment", "score", "stage", "created_at"];
        const rows = leads.map(lead => [lead.name || "", lead.email, lead.company_name || "", lead.job_title || "", lead.segment, String(lead.score), getLeadStage(lead), lead.created_at || ""]);
        const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `marketing-leads-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }

    const actionItems = [
        hot.length > 0 ? { icon: Target, color: t.coral, title: `${hot.length} hot lead${hot.length === 1 ? "" : "s"} need attention`, body: "Review the highest-intent contacts before your next send." } : { icon: CheckCircle2, color: t.green, title: "No hot leads waiting", body: "Your follow-up queue is clear. Add a new target or launch a campaign." },
        queue.length > 0 ? { icon: Mail, color: t.accent, title: `${queue.length} follow-up${queue.length === 1 ? "" : "s"} queued`, body: "Your existing Resend queue will handle delivery and tracking." } : { icon: Mail, color: t.textMuted, title: "No follow-ups queued", body: "Create a campaign from one of the playbooks below." },
        { icon: Sparkles, color: t.amber, title: "Personalize the next campaign", body: "Use the existing AI Personalize Selected flow before launch." },
    ];

    if (searchParams.get("tab") === "landing-pages") return <LandingPagesBuilder />;

    return <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: t.font }}>
        <style>{css}</style>
        <div className="marketing-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}><div><h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", color: t.text, margin: 0 }}>Marketing Control Center</h1><p style={{ marginTop: 6, fontSize: 14, color: t.textMuted }}>Turn your existing mail engine into a simple growth system.</p></div><div style={{ display: "flex", gap: 8 }}><button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", borderRadius: 9, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><RefreshCw style={{ width: 14, height: 14 }} /> Refresh</button><button onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 15px", borderRadius: 9, border: 0, background: t.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Plus style={{ width: 14, height: 14 }} /> Add lead</button></div></div>
        <div className="marketing-stats"><Metric title="Marketable contacts" value={loading ? "—" : contacts.filter(c => c.status !== "unsubscribed").length.toLocaleString("en-IN")} note="Already in your mail system" icon={Users} t={t} /><Metric title="Hot leads" value={loading ? "—" : hot.length} note="Based on role, intent, and data" icon={Target} t={t} /><Metric title="Active campaigns" value={loading ? "—" : campaigns.filter(c => c.status === "active").length} note="Use existing campaign sender" icon={Megaphone} t={t} /><Metric title="Queued follow-ups" value={loading ? "—" : queue.length} note={stats ? `${stats.open_rate}% historical open rate` : "Existing queue"} icon={Mail} t={t} /></div>

        <div className="marketing-grid"><div style={{ ...card(t), overflow: "hidden" }}><div style={{ padding: "20px 22px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Priority lead list</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>Scored from the contacts already in your database.</p></div><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Filter style={{ width: 14, height: 14, color: t.textMuted }} /><select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value as SegmentFilter)} style={{ ...inputStyle(t), width: 105, padding: "8px 10px" }}><option>All</option><option>Hot</option><option>Warm</option><option>Nurture</option></select><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" style={{ ...inputStyle(t), width: 150, padding: "8px 10px" }} /><button onClick={exportLeads} title="Export all scored leads as CSV" style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}><Download style={{ width: 13, height: 13 }} /> Export</button><Link href="/dashboard/contacts" style={{ color: t.accent, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>All contacts <ArrowUpRight style={{ width: 12, height: 12, verticalAlign: "middle" }} /></Link></div></div>{filteredLeads.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: t.textMuted, fontSize: 13 }}>No matching contacts.</div> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}><thead><tr style={{ borderBottom: `1px solid ${t.borderLight}`, background: t.cardInner }}>{["Lead", "Segment", "Score", "Reason", "Added"].map(head => <th key={head} style={{ ...label(t), padding: "12px 18px", whiteSpace: "nowrap" }}>{head}</th>)}</tr></thead><tbody>{filteredLeads.map((lead, index) => <tr key={lead.id} onClick={() => setSelectedLead(lead)} title="Open lead details" style={{ borderBottom: index < filteredLeads.length - 1 ? `1px solid ${t.borderLight}` : "none" }}><td style={{ padding: "14px 18px" }}><div style={{ display: "flex", alignItems: "center", gap: 9 }}><div style={{ width: 29, height: 29, borderRadius: 8, background: t.accentSoft, color: t.accent, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{(lead.name || lead.email).slice(0, 1).toUpperCase()}</div><div><div style={{ color: t.text, fontWeight: 600 }}>{lead.name || lead.email}</div><div className="lead-meta" style={{ color: t.textMuted, fontSize: 11 }}>{lead.company_name || lead.email}</div></div></div></td><td style={{ padding: "14px 18px" }}><SegmentBadge segment={lead.segment} t={t} /></td><td style={{ padding: "14px 18px", color: lead.segment === "Hot" ? t.coral : t.text, fontWeight: 700, fontFamily: t.mono }}>{lead.score}</td><td className="lead-meta" style={{ padding: "14px 18px", color: t.textMuted, fontSize: 12 }}>{lead.reason}</td><td style={{ padding: "14px 18px", color: t.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>{formatDate(lead.created_at)}</td></tr>)}</tbody></table></div>}</div><div style={{ ...card(t), padding: 22 }}><div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}><div style={{ width: 32, height: 32, borderRadius: 9, background: t.accentSoft, color: t.accent, display: "grid", placeItems: "center" }}><Bot style={{ width: 16, height: 16 }} /></div><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Next best actions</h2><p style={{ margin: "4px 0 0", fontSize: 12, color: t.textMuted }}>Practical actions from your current data.</p></div></div><div style={{ display: "flex", flexDirection: "column", gap: 13 }}>{actionItems.map(item => <div key={item.title} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}><item.icon style={{ width: 16, height: 16, color: item.color, marginTop: 2, flexShrink: 0 }} /><div><p style={{ margin: 0, color: t.text, fontSize: 12, fontWeight: 600 }}>{item.title}</p><p style={{ margin: "3px 0 0", color: t.textMuted, fontSize: 11, lineHeight: 1.45 }}>{item.body}</p></div></div>)}</div></div></div>

        <div className="marketing-two"><div style={{ ...card(t), padding: 22 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 17 }}><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Audience segments</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>Use these segments to choose who gets each message.</p></div><Link href="/dashboard/categories" style={{ color: t.accent, fontSize: 12, textDecoration: "none" }}>Manage lists <ChevronRight style={{ width: 12, height: 12, verticalAlign: "middle" }} /></Link></div>{[{name:"Hot", count:hot.length, text:"Direct follow-up and a clear CTA", color:t.coral, bg:t.coralSoft},{name:"Warm", count:warm.length, text:"Send proof, education, and a soft CTA", color:t.amber, bg:t.amberSoft},{name:"Nurture", count:leads.length-hot.length-warm.length, text:"Build trust with useful content", color:t.textMuted, bg:t.cardInner}].map(segment => <div key={segment.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${t.borderLight}` }}><div style={{ width: 34, height: 34, borderRadius: 9, background: segment.bg, color: segment.color, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{segment.count}</div><div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: t.text, fontSize: 13, fontWeight: 600 }}>{segment.name}</span><span style={{ color: t.textMuted, fontSize: 11 }}>{segment.count === 1 ? "contact" : "contacts"}</span></div><p style={{ margin: "3px 0 0", color: t.textMuted, fontSize: 11 }}>{segment.text}</p></div></div>)}</div><div style={{ ...card(t), padding: 22 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 17 }}><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Campaign playbooks</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>Use the existing campaign builder to activate one.</p></div><Link href="/dashboard/campaigns/new" style={{ color: t.accent, fontSize: 12, textDecoration: "none" }}>New campaign <ArrowUpRight style={{ width: 12, height: 12, verticalAlign: "middle" }} /></Link></div>{[{title:"New lead → useful first reply", body:"One helpful resource, one proof point, one soft CTA.", tag:"Top of funnel"},{title:"Trial → activation", body:"Help users reach the first meaningful product moment.", tag:"Conversion"},{title:"No reply → respectful win-back", body:"A short final message, then stop and preserve trust.", tag:"Retention"}].map(playbook => <Link key={playbook.title} href="/dashboard/campaigns/new" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${t.borderLight}`, textDecoration: "none" }}><div style={{ width: 30, height: 30, borderRadius: 8, background: t.cardInner, color: t.accent, display: "grid", placeItems: "center" }}><Mail style={{ width: 14, height: 14 }} /></div><div style={{ flex: 1 }}><div style={{ color: t.text, fontSize: 12, fontWeight: 600 }}>{playbook.title}</div><p style={{ color: t.textMuted, fontSize: 11, margin: "3px 0 0", lineHeight: 1.4 }}>{playbook.body}</p></div><span style={{ color: t.textMuted, fontSize: 10, whiteSpace: "nowrap" }}>{playbook.tag}</span></Link>)}</div></div>

        <div style={{ ...card(t), padding: 22 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Your existing automation stack</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>This layer uses what you already built.</p></div><Link href="/dashboard/analytics" style={{ color: t.accent, fontSize: 12, textDecoration: "none" }}>Open analytics <ArrowUpRight style={{ width: 12, height: 12, verticalAlign: "middle" }} /></Link></div><div className="stack-grid" style={{ display: "grid", gap: 10 }}>{[{icon:Users,title:"Contacts",href:"/dashboard/contacts"},{icon:Megaphone,title:"Campaigns",href:"/dashboard/campaigns"},{icon:Mail,title:"Queue + Resend",href:"/dashboard/queue"},{icon:Sparkles,title:"AI personalization",href:"/dashboard/campaigns/new"}].map(item => <Link key={item.title} href={item.href} style={{ display: "flex", alignItems: "center", gap: 9, padding: 12, borderRadius: 9, background: t.cardInner, textDecoration: "none", color: t.text }}><item.icon style={{ width: 15, height: 15, color: t.accent }} /><span style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</span><ChevronRight style={{ marginLeft: "auto", width: 13, height: 13, color: t.textMuted }} /></Link>)}</div></div>

        {showAdd && <div onClick={() => setShowAdd(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}><div onClick={event => event.stopPropagation()} style={{ ...card(t), width: "min(520px,100%)", padding: 24 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}><div><h2 style={{ margin: 0, color: t.text, fontSize: 18 }}>Add marketing lead</h2><p style={{ color: t.textMuted, fontSize: 12, margin: "5px 0 0" }}>The lead will be stored in your existing contacts table.</p></div><button onClick={() => setShowAdd(false)} style={{ border: 0, background: t.cardInner, color: t.textMuted, borderRadius: 7, width: 28, height: 28, cursor: "pointer" }}>×</button></div><form onSubmit={addLead} style={{ display: "grid", gap: 12 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label style={{ color: t.textSec, fontSize: 12 }}>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} placeholder="Ananya Sharma" /></label><label style={{ color: t.textSec, fontSize: 12 }}>Email *<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} placeholder="ananya@company.com" /></label></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label style={{ color: t.textSec, fontSize: 12 }}>Company<input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} placeholder="Company name" /></label><label style={{ color: t.textSec, fontSize: 12 }}>Job title<input value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} placeholder="Founder, CFO, CTO…" /></label></div><label style={{ color: t.textSec, fontSize: 12 }}>Intent<select value={form.intent} onChange={e => setForm({ ...form, intent: e.target.value })} style={{ ...inputStyle(t), marginTop: 5 }}><option value="new">New lead</option><option value="interested">Interested</option><option value="trial">Trial started</option><option value="qualified">Qualified</option></select></label><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}><button type="button" onClick={() => setShowAdd(false)} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, cursor: "pointer", fontSize: 12 }}>Cancel</button><button disabled={saving} style={{ padding: "10px 15px", borderRadius: 8, border: 0, background: t.accent, color: "#fff", cursor: saving ? "wait" : "pointer", fontSize: 12, fontWeight: 700 }}>{saving ? "Saving…" : "Save lead"}</button></div></form></div></div>}
        <div className="marketing-two">
            <div style={{ ...card(t), padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 17 }}>
                    <div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Funnel performance</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>A quick view of where attention is needed.</p></div>
                    <Link href="/dashboard/analytics" style={{ color: t.accent, fontSize: 12, textDecoration: "none" }}>Full analytics <ArrowUpRight style={{ width: 12, height: 12, verticalAlign: "middle" }} /></Link>
                </div>
                {[{ label: "Marketable contacts", value: contacts.filter(contact => contact.status !== "unsubscribed").length, note: "Available for campaigns", color: t.accent }, { label: "Hot leads", value: hot.length, note: "Need a direct next step", color: t.coral }, { label: "Warm leads", value: warm.length, note: "Need proof and education", color: t.amber }, { label: "Queued follow-ups", value: queue.length, note: "Handled by Resend queue", color: t.green }].map(row => <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid " + t.borderLight }}><div><div style={{ color: t.text, fontSize: 12, fontWeight: 600 }}>{row.label}</div><div style={{ color: t.textMuted, fontSize: 11, marginTop: 3 }}>{row.note}</div></div><strong style={{ color: row.color, fontSize: 20, fontFamily: t.mono }}>{row.value}</strong></div>)}
            </div>
            <div style={{ ...card(t), padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 17 }}><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Weekly marketing checklist</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>Saved locally in this browser.</p></div><span style={{ color: t.green, fontSize: 11, fontWeight: 700 }}>{tasks.filter(task => task.done).length}/{tasks.length} done</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{tasks.map(task => <button key={task.id} onClick={() => toggleTask(task.id)} style={{ display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", border: 0, background: "transparent", padding: "5px 0", cursor: "pointer" }}>{task.done ? <CheckCircle2 style={{ width: 16, height: 16, color: t.green, flexShrink: 0, marginTop: 1 }} /> : <span style={{ width: 16, height: 16, border: "1px solid " + t.border, borderRadius: 5, flexShrink: 0, marginTop: 1 }} />}<span><span style={{ display: "block", color: t.text, fontSize: 12, fontWeight: 600, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</span><span style={{ display: "block", color: t.textMuted, fontSize: 11, marginTop: 2 }}>{task.detail}</span></span></button>)}</div>
            </div>
        </div>

        {selectedLead && <div onClick={() => setSelectedLead(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 90, display: "grid", placeItems: "center", padding: 20 }}><div onClick={event => event.stopPropagation()} style={{ ...card(t), width: "min(560px,100%)", padding: 24 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}><div><div style={{ display: "flex", alignItems: "center", gap: 9 }}><div style={{ width: 34, height: 34, borderRadius: 9, background: t.accentSoft, color: t.accent, display: "grid", placeItems: "center", fontWeight: 700 }}>{(selectedLead.name || selectedLead.email).slice(0, 1).toUpperCase()}</div><div><h2 style={{ margin: 0, color: t.text, fontSize: 18 }}>{selectedLead.name || selectedLead.email}</h2><p style={{ color: t.textMuted, fontSize: 12, margin: "3px 0 0" }}>{selectedLead.company_name || "No company"} · {selectedLead.job_title || "No title"}</p></div></div></div><button onClick={() => setSelectedLead(null)} style={{ border: 0, background: t.cardInner, color: t.textMuted, borderRadius: 7, width: 28, height: 28, cursor: "pointer" }}><X style={{ width: 14, height: 14 }} /></button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}><div style={{ padding: 12, borderRadius: 9, background: t.cardInner }}><span style={label(t)}>Score</span><strong style={{ display: "block", fontSize: 20, color: selectedLead.segment === "Hot" ? t.coral : t.text, marginTop: 5 }}>{selectedLead.score}</strong></div><div style={{ padding: 12, borderRadius: 9, background: t.cardInner }}><span style={label(t)}>Segment</span><div style={{ marginTop: 7 }}><SegmentBadge segment={selectedLead.segment} t={t} /></div></div><div style={{ padding: 12, borderRadius: 9, background: t.cardInner }}><span style={label(t)}>Status</span><strong style={{ display: "block", fontSize: 13, color: t.text, marginTop: 7, textTransform: "capitalize" }}>{selectedLead.status}</strong></div></div><label style={{ display: "block", color: t.textSec, fontSize: 12, marginBottom: 14 }}>Lifecycle stage<select value={selectedLead.stage} onChange={e => updateLeadStage(selectedLead, e.target.value as LeadStage)} style={{ ...inputStyle(t), marginTop: 5, padding: "8px 10px" }}><option>New</option><option>Contacted</option><option>Qualified</option><option>Trial</option><option>Customer</option><option>Nurture</option><option>Churned</option></select></label><p style={{ color: t.textSec, fontSize: 13, lineHeight: 1.6, margin: "0 0 18px" }}>Why this score: <strong>{selectedLead.reason}</strong>. Use the actions below to move this contact into your next campaign.</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => copyOutreachBrief(selectedLead)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 13px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{briefCopied ? <Check style={{ width: 14, height: 14, color: t.green }} /> : <Copy style={{ width: 14, height: 14 }} />}{briefCopied ? "Copied" : "Copy outreach brief"}</button><button onClick={() => markQualified(selectedLead)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 13px", borderRadius: 8, border: 0, background: t.accent, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}><CheckCircle2 style={{ width: 14, height: 14 }} /> Mark qualified</button><Link href="/dashboard/campaigns/new" onClick={() => setSelectedLead(null)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 13px", borderRadius: 8, border: 0, background: t.cardInner, color: t.accent, textDecoration: "none", fontSize: 12, fontWeight: 700 }}><Clipboard style={{ width: 14, height: 14 }} /> Use campaign builder</Link></div></div></div>}
        <div className="marketing-two">
            <div style={{ ...card(t), padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>Content queue</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: t.textMuted }}>Plan LinkedIn, email, SEO, and launch content.</p></div><button onClick={() => setShowContent(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: t.accentSoft, color: t.accent, borderRadius: 8, padding: "8px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Plus style={{ width: 13, height: 13 }} /> Add idea</button></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{contentIdeas.slice(0, 5).map(item => <button key={item.id} onClick={() => cycleContentStatus(item.id)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", border: 0, background: "transparent", padding: "7px 0", cursor: "pointer" }}><div style={{ width: 28, height: 28, borderRadius: 8, background: t.cardInner, color: t.accent, display: "grid", placeItems: "center", flexShrink: 0 }}><Sparkles style={{ width: 13, height: 13 }} /></div><div style={{ flex: 1, minWidth: 0 }}><div style={{ color: t.text, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div><div style={{ color: t.textMuted, fontSize: 11, marginTop: 2 }}>{item.channel}{item.date ? ` · ${item.date}` : ""}</div></div><span style={{ color: item.status === "Published" ? t.green : t.textMuted, fontSize: 10, fontWeight: 700 }}>{item.status}</span></button>)}</div>
            </div>
            <div style={{ ...card(t), padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 15 }}><div style={{ width: 32, height: 32, borderRadius: 9, background: t.accentSoft, color: t.accent, display: "grid", placeItems: "center" }}><Bot style={{ width: 16, height: 16 }} /></div><div><h2 style={{ margin: 0, fontSize: 16, color: t.text }}>SaaS event automation</h2><p style={{ margin: "4px 0 0", fontSize: 12, color: t.textMuted }}>Connect your product events to this mail engine.</p></div></div>
                <div style={{ padding: 12, borderRadius: 9, background: t.cardInner, marginBottom: 12 }}><span style={label(t)}>Webhook endpoint</span><code style={{ display: "block", color: t.text, fontSize: 11, marginTop: 7, overflowWrap: "anywhere" }}>POST /api/marketing/events</code></div>
                <p style={{ color: t.textMuted, fontSize: 11, lineHeight: 1.5, margin: "0 0 14px" }}>Send events such as <strong style={{ color: t.textSec }}>trial_started</strong>, <strong style={{ color: t.textSec }}>activated</strong>, <strong style={{ color: t.textSec }}>paid</strong>, or <strong style={{ color: t.textSec }}>churned</strong>. The endpoint updates contact tags and can enroll the contact into an existing campaign when you provide its campaign ID.</p>
                <Link href="/dashboard/campaigns" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: t.accent, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>Choose a campaign <ArrowUpRight style={{ width: 12, height: 12 }} /></Link>
            </div>
        </div>

        {showContent && <div onClick={() => setShowContent(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}><div onClick={event => event.stopPropagation()} style={{ ...card(t), width: "min(520px,100%)", padding: 24 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}><div><h2 style={{ margin: 0, color: t.text, fontSize: 18 }}>Add content idea</h2><p style={{ color: t.textMuted, fontSize: 12, margin: "5px 0 0" }}>Click an item later to move it from Idea to Published.</p></div><button onClick={() => setShowContent(false)} style={{ border: 0, background: t.cardInner, color: t.textMuted, borderRadius: 7, width: 28, height: 28, cursor: "pointer" }}><X style={{ width: 14, height: 14 }} /></button></div><form onSubmit={addContentIdea} style={{ display: "grid", gap: 12 }}><label style={{ color: t.textSec, fontSize: 12 }}>Title<input required value={contentForm.title} onChange={e => setContentForm({ ...contentForm, title: e.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} placeholder="A useful insight for founders" /></label><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label style={{ color: t.textSec, fontSize: 12 }}>Channel<select value={contentForm.channel} onChange={e => setContentForm({ ...contentForm, channel: e.target.value })} style={{ ...inputStyle(t), marginTop: 5 }}><option>LinkedIn</option><option>Newsletter</option><option>Blog</option><option>Video</option><option>Lead magnet</option></select></label><label style={{ color: t.textSec, fontSize: 12 }}>Publish date<input type="date" value={contentForm.date} onChange={e => setContentForm({ ...contentForm, date: e.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} /></label></div><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 5 }}><button type="button" onClick={() => setShowContent(false)} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, cursor: "pointer", fontSize: 12 }}>Cancel</button><button style={{ padding: "10px 15px", borderRadius: 8, border: 0, background: t.accent, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Add idea</button></div></form></div></div>}
        <BulkLeadToolbar count={filteredLeads.length} stage={bulkStage} onStageChange={setBulkStage} onMove={bulkMoveLeads} saving={saving} message={bulkMessage} t={t} />
        <PipelineBoard leads={leads} t={t} onSelect={setSelectedLead} />
        <div className="marketing-two"><TemplateStudio templates={templates} t={t} copied={templateCopied} onCopy={template => copyTemplate(template)} onAdd={() => setShowTemplate(true)} /><EventSnippetGenerator campaigns={campaigns} eventType={eventType} setEventType={setEventType} campaignId={eventCampaignId} setCampaignId={setEventCampaignId} snippet={eventSnippet} copied={eventSnippetCopied} onCopy={copyEventSnippet} t={t} /></div>
        <TemplateModal open={showTemplate} form={templateForm} setForm={setTemplateForm} onClose={() => setShowTemplate(false)} onSubmit={addTemplate} t={t} />
    </div>;
}
