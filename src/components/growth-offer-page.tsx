"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CheckCircle2, Clock3, IndianRupee, Loader2, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import MetaPixel from "@/components/meta-pixel";
import { calculateLeadQualification } from "@/lib/lead-scoring";

type OfferVariant = "automation" | "mvp" | "healthcare";

const offers = {
  automation: {
    slug: "ai-automation",
    eyebrow: "FREE AI OPPORTUNITY AUDIT",
    headline: "Find the manual work AI should remove from your business.",
    subhead: "Finasoft maps your current workflow, estimates the time and cost being lost, and recommends the fastest practical automation to implement first.",
    audience: "Operations teams, service businesses and growing companies",
    requirement: "ai-automation",
    industry: "",
    resultTitle: "Your AI opportunity estimate",
  },
  mvp: {
    slug: "ai-mvp",
    eyebrow: "FREE AI MVP ARCHITECTURE REVIEW",
    headline: "Turn your AI product idea into a buildable MVP plan.",
    subhead: "Get a focused architecture, delivery scope and implementation path before committing to a large engineering team.",
    audience: "Founders and product teams building an AI SaaS product",
    requirement: "ai-mvp",
    industry: "startup",
    resultTitle: "Your MVP opportunity estimate",
  },
  healthcare: {
    slug: "healthcare-ai",
    eyebrow: "FREE HEALTHCARE AI AUDIT",
    headline: "Automate healthcare operations without disrupting patient care.",
    subhead: "We identify practical opportunities across reporting, documents, patient communication, scheduling and internal operations.",
    audience: "Diagnostic labs, clinics, hospital groups and healthcare SaaS teams",
    requirement: "healthcare-automation",
    industry: "healthcare",
    resultTitle: "Your healthcare automation estimate",
  },
} as const;

type AuditFormState = {
  name: string; email: string; phone: string; company_name: string; company_website: string; job_title: string;
  industry: string; employee_count: string; requirement: string; problem_statement: string; budget_band: string;
  timeline: string; decision_maker: boolean; repetitive_workflows: string; manual_hours_weekly: string;
  hourly_cost: string; preferred_date: string; preferred_time: string; website: string;
};

const initialForm: AuditFormState = {
  name: "", email: "", phone: "", company_name: "", company_website: "", job_title: "",
  industry: "", employee_count: "", requirement: "ai-automation", problem_statement: "",
  budget_band: "", timeline: "", decision_maker: false, repetitive_workflows: "3",
  manual_hours_weekly: "20", hourly_cost: "800", preferred_date: "", preferred_time: "", website: "",
};

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function track(event: string, parameters?: Record<string, unknown>) {
  const win = window as Window & { fbq?: (...args: unknown[]) => void };
  win.fbq?.("track", event, parameters);
}

function trackCustom(event: string, parameters?: Record<string, unknown>) {
  const win = window as Window & { fbq?: (...args: unknown[]) => void };
  win.fbq?.("trackCustom", event, parameters);
}

export default function GrowthOfferPage({ variant }: { variant: OfferVariant }) {
  const offer = offers[variant];
  const [form, setForm] = useState<AuditFormState>({ ...initialForm, requirement: offer.requirement, industry: offer.industry });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ potential: string; estimated_monthly_cost: number; estimated_monthly_savings: number; next_step: string } | null>(null);
  const [bookingUrl, setBookingUrl] = useState("");

  const estimate = useMemo(() => calculateLeadQualification({
    email: form.email,
    company_website: form.company_website,
    industry: form.industry,
    employee_count: Number(form.employee_count),
    requirement: form.requirement,
    problem_statement: form.problem_statement,
    budget_band: form.budget_band,
    timeline: form.timeline,
    decision_maker: form.decision_maker,
    repetitive_workflows: Number(form.repetitive_workflows),
    manual_hours_weekly: Number(form.manual_hours_weekly),
    hourly_cost: Number(form.hourly_cost),
  }), [form]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError("");
    const params = new URLSearchParams(window.location.search);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, page_slug: offer.slug, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, utm_source: params.get("utm_source") || "", utm_medium: params.get("utm_medium") || "", utm_campaign: params.get("utm_campaign") || "", utm_content: params.get("utm_content") || "" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your audit could not be saved yet.");
      setResult(body.result);
      setBookingUrl(body.booking_url || "");
      track("Lead", { content_name: offer.slug, lead_type: body.result?.next_step });
      if (["priority-audit", "audit-review"].includes(body.result?.next_step)) trackCustom("QualifiedLead", { content_name: offer.slug });
      document.getElementById("audit-result")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Please try again.");
    } finally { setSubmitting(false); }
  }

  const field: React.CSSProperties = { width: "100%", minHeight: 48, border: "1px solid #cbd6d4", borderRadius: 10, background: "#fff", color: "#102536", padding: "11px 12px", fontSize: 15, outline: "none" };
  const label: React.CSSProperties = { display: "grid", gap: 6, color: "#385266", fontSize: 14, fontWeight: 700 };

  return <main className="growth-offer">
    <MetaPixel />
    <header className="offer-nav"><a href="#top" className="offer-brand"><span>F</span>Finasoft Ventures</a><a href="#audit-form" className="nav-cta">Get free audit <ArrowRight size={16} /></a></header>

    <section id="top" className="offer-hero">
      <div className="hero-copy">
        <p className="eyebrow">{offer.eyebrow}</p>
        <h1>{offer.headline}</h1>
        <p className="subhead">{offer.subhead}</p>
        <div className="hero-actions"><a href="#audit-form" className="primary-cta" onClick={() => track("InitiateCheckout", { content_name: offer.slug })}>Start my free audit <ArrowRight size={18} /></a><span><Clock3 size={17} /> Takes about 4 minutes</span></div>
        <div className="audience"><CheckCircle2 size={18} /> Built for {offer.audience}</div>
      </div>
      <aside className="live-estimate">
        <div className="estimate-top"><span>LIVE OPPORTUNITY ESTIMATE</span><Sparkles size={18} /></div>
        <div className="estimate-value"><small>Manual work currently costs</small><strong>{money(estimate.monthlyManualCost)}</strong><span>estimated each month</span></div>
        <div className="estimate-value accent"><small>Potential monthly savings</small><strong>{money(estimate.estimatedMonthlySavings)}</strong><span>based on {form.repetitive_workflows || 0} repeatable workflows</span></div>
        <div className="estimate-bar"><i style={{ width: `${Math.min(100, 22 + Number(form.repetitive_workflows || 0) * 12)}%` }} /></div>
        <p>Adjust the hours, cost and workflow fields below to see your own estimate.</p>
      </aside>
    </section>

    <section className="value-strip">
      <div><Workflow /><strong>Workflow map</strong><span>Where time is being lost</span></div>
      <div><BarChart3 /><strong>ROI estimate</strong><span>What automation may save</span></div>
      <div><ShieldCheck /><strong>Implementation plan</strong><span>What to build first</span></div>
    </section>

    <section id="audit-form" className="audit-section">
      <div className="form-intro"><p className="eyebrow">YOUR FREE AUDIT</p><h2>Tell us where the work gets stuck.</h2><p>We use these answers to prioritize the opportunity. You receive a focused recommendation—not a generic company brochure.</p><ol><li>Describe the manual workflow</li><li>See an immediate savings estimate</li><li>Receive a practical implementation recommendation</li></ol></div>
      <form onSubmit={submit} className="audit-form">
        <div className="form-block"><h3>1. You and your company</h3><div className="field-grid"><label style={label}>Name<input required value={form.name} onChange={e => update("name", e.target.value)} style={field} /></label><label style={label}>Business email<input required type="email" value={form.email} onChange={e => update("email", e.target.value)} style={field} /></label><label style={label}>Company<input required value={form.company_name} onChange={e => update("company_name", e.target.value)} style={field} /></label><label style={label}>Company website<input required placeholder="https://" value={form.company_website} onChange={e => update("company_website", e.target.value)} style={field} /></label><label style={label}>Job title<input value={form.job_title} onChange={e => update("job_title", e.target.value)} style={field} /></label><label style={label}>Phone (optional)<input value={form.phone} onChange={e => update("phone", e.target.value)} style={field} /></label></div></div>

        <div className="form-block"><h3>2. Your workflow</h3><div className="field-grid"><label style={label}>Industry<select required value={form.industry} onChange={e => update("industry", e.target.value)} style={field}><option value="">Choose industry</option><option value="healthcare">Healthcare</option><option value="diagnostics">Diagnostics / imaging</option><option value="pharma">Pharma / medical devices</option><option value="saas">SaaS / technology</option><option value="startup">Startup</option><option value="agency">Agency / consultancy</option><option value="finance">Finance</option><option value="other">Other</option></select></label><label style={label}>Employees<select value={form.employee_count} onChange={e => update("employee_count", e.target.value)} style={field}><option value="">Choose size</option><option value="5">1–10</option><option value="25">11–50</option><option value="100">51–200</option><option value="500">201–1,000</option><option value="1500">1,000+</option></select></label><label style={label}>What do you need?<select required value={form.requirement} onChange={e => update("requirement", e.target.value)} style={field}><option value="ai-automation">AI workflow automation</option><option value="ai-agent">AI agent</option><option value="ai-mvp">AI SaaS / MVP</option><option value="existing-product">Add AI to existing product</option><option value="healthcare-automation">Healthcare automation</option><option value="not-sure">Not sure yet</option></select></label><label style={label}>Repeatable workflows<input type="number" min="1" max="100" value={form.repetitive_workflows} onChange={e => update("repetitive_workflows", e.target.value)} style={field} /></label><label style={label}>Manual hours per week<input type="number" min="0" value={form.manual_hours_weekly} onChange={e => update("manual_hours_weekly", e.target.value)} style={field} /></label><label style={label}>Approximate employee cost/hour (₹)<input type="number" min="0" value={form.hourly_cost} onChange={e => update("hourly_cost", e.target.value)} style={field} /></label></div><label style={{ ...label, marginTop: 15 }}>What are you trying to solve?<textarea required minLength={40} rows={5} value={form.problem_statement} onChange={e => update("problem_statement", e.target.value)} placeholder="Describe the current steps, who does them and where time or money is being lost…" style={{ ...field, resize: "vertical" }} /><span className="hint">Add at least 40 characters so we can give a useful recommendation.</span></label></div>

        <div className="form-block"><h3>3. Project readiness</h3><div className="field-grid"><label style={label}>Expected budget<select required value={form.budget_band} onChange={e => update("budget_band", e.target.value)} style={field}><option value="">Choose budget</option><option value="under-50k">Below ₹50K</option><option value="50k-1l">₹50K–₹1L</option><option value="1l-3l">₹1L–₹3L</option><option value="3l-10l">₹3L–₹10L</option><option value="10l-plus">₹10L+</option></select></label><label style={label}>Timeline<select required value={form.timeline} onChange={e => update("timeline", e.target.value)} style={field}><option value="">Choose timeline</option><option value="immediately">Immediately</option><option value="under-30-days">Within 30 days</option><option value="1-3-months">1–3 months</option><option value="3-plus-months">3+ months</option><option value="researching">Researching</option></select></label><label style={label}>Preferred audit date (optional)<input type="date" value={form.preferred_date} onChange={e => update("preferred_date", e.target.value)} style={field} /></label><label style={label}>Preferred time (optional)<select value={form.preferred_time} onChange={e => update("preferred_time", e.target.value)} style={field}><option value="">Choose time</option><option>10:00–12:00</option><option>12:00–15:00</option><option>15:00–18:00</option><option>18:00–20:00</option></select></label></div><label className="decision"><input type="checkbox" checked={form.decision_maker} onChange={e => update("decision_maker", e.target.checked)} /> I am involved in approving this project</label></div>

        <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => update("website", e.target.value)} style={{ position: "absolute", left: -10000, opacity: 0 }} />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting} className="submit-audit">{submitting ? <Loader2 className="spin" size={19} /> : <IndianRupee size={19} />}{submitting ? "Preparing your audit…" : "Get my free AI opportunity audit"}</button>
        <p className="privacy">Your information is used only to prepare and follow up on this audit.</p>
      </form>
    </section>

    {result && <section id="audit-result" className="result-card"><CheckCircle2 size={34} /><div><p>REQUEST RECEIVED</p><h2>{offer.resultTitle}</h2><div className="result-numbers"><span><small>Automation potential</small><strong>{result.potential}</strong></span><span><small>Current monthly effort</small><strong>{money(result.estimated_monthly_cost)}</strong></span><span><small>Potential monthly savings</small><strong>{money(result.estimated_monthly_savings)}</strong></span></div><p className="result-copy">We will review your answers and send the recommended first workflow to automate. {result.next_step === "priority-audit" ? "Your request has been prioritized for a discovery call." : "You will receive the next step by email."}</p>{bookingUrl && <a className="primary-cta" href={bookingUrl} target="_blank" rel="noreferrer">Choose a confirmed call time <ArrowRight size={17} /></a>}</div></section>}

    <section className="process"><p className="eyebrow">WHAT HAPPENS NEXT</p><h2>One workflow. Measurable result. Then expand.</h2><div><article><span>01</span><h3>Opportunity map</h3><p>We identify the highest-value manual process and the data, integrations and controls it needs.</p></article><article><span>02</span><h3>Paid prototype</h3><p>Build a focused ₹25K–₹1L proof of value before committing to a larger transformation.</p></article><article><span>03</span><h3>Scale what works</h3><p>Expand the proven automation into production software, support or a longer-term SaaS engagement.</p></article></div></section>

    <footer><strong>Finasoft Ventures</strong><span>Technology, finance and growth systems.</span></footer>

    <style>{`
      .growth-offer{--ink:#102536;--muted:#587082;--lime:#b8ef5c;--line:#d7e0dd;min-height:100vh;background:#f6f8f4;color:var(--ink);font-family:Inter,Arial,sans-serif;font-size:16px}.offer-nav{height:76px;max-width:1180px;margin:auto;padding:0 28px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}.offer-brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-weight:800;text-decoration:none}.offer-brand span{width:34px;height:34px;border-radius:10px;background:var(--ink);color:var(--lime);display:grid;place-items:center}.nav-cta,.primary-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;background:var(--ink);color:#fff;text-decoration:none;font-weight:800;padding:13px 17px}.offer-hero{max-width:1180px;margin:auto;padding:92px 28px 74px;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(340px,.72fr);gap:64px;align-items:center}.eyebrow{color:#698e36;font-size:13px;font-weight:900;letter-spacing:.13em;margin:0 0 16px}.hero-copy h1{font-size:clamp(46px,5.4vw,76px);line-height:.98;letter-spacing:-.06em;margin:0;max-width:760px}.subhead{font-size:19px;line-height:1.65;color:var(--muted);max-width:690px;margin:28px 0}.hero-actions{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.hero-actions span{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:14px}.audience{display:flex;gap:8px;align-items:center;margin-top:22px;color:var(--muted);font-size:14px}.audience svg{color:#7ba33f}.live-estimate{background:var(--ink);color:#fff;border-radius:24px;padding:26px;box-shadow:0 28px 70px rgba(16,37,54,.2)}.estimate-top{display:flex;justify-content:space-between;color:var(--lime);font-size:12px;font-weight:800;letter-spacing:.1em}.estimate-value{padding:28px 0 18px;border-bottom:1px solid #294356}.estimate-value small,.estimate-value span{display:block;color:#9fb2bf;font-size:13px}.estimate-value strong{display:block;font-size:38px;letter-spacing:-.05em;margin:6px 0}.estimate-value.accent strong{color:var(--lime)}.estimate-bar{height:8px;background:#294356;border-radius:20px;margin-top:24px;overflow:hidden}.estimate-bar i{display:block;height:100%;background:var(--lime);border-radius:20px;transition:width .25s}.live-estimate>p{font-size:13px;line-height:1.55;color:#9fb2bf;margin:14px 0 0}.value-strip{max-width:1124px;margin:0 auto 90px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.value-strip>div{display:grid;grid-template-columns:34px 1fr;column-gap:10px;align-items:center}.value-strip svg{grid-row:1/3;color:#769b3f}.value-strip strong{font-size:15px}.value-strip span{color:var(--muted);font-size:13px}.audit-section{max-width:1180px;margin:auto;padding:0 28px 90px;display:grid;grid-template-columns:.7fr 1.3fr;gap:54px;align-items:start}.form-intro{position:sticky;top:28px}.form-intro h2,.process h2{font-size:clamp(34px,4vw,52px);line-height:1.04;letter-spacing:-.05em;margin:0 0 18px}.form-intro>p:not(.eyebrow){color:var(--muted);line-height:1.7}.form-intro ol{margin:26px 0;padding-left:22px;color:var(--muted);display:grid;gap:10px}.audit-form{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px;display:grid;gap:20px}.form-block{padding-bottom:24px;border-bottom:1px solid var(--line)}.form-block h3{font-size:18px;margin:0 0 16px}.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hint{font-weight:500;color:#80919b;font-size:12px}.decision{display:flex;gap:9px;align-items:center;margin-top:17px;font-weight:700;color:#385266}.decision input{width:18px;height:18px}.submit-audit{min-height:54px;border:0;border-radius:11px;background:var(--lime);color:var(--ink);font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer}.submit-audit:disabled{opacity:.65}.form-error{padding:12px;background:#fff1ee;color:#aa4d38;border-radius:9px}.privacy{text-align:center;color:#80919b;font-size:12px;margin:0}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.result-card{max-width:1124px;margin:0 auto 90px;padding:32px;border-radius:20px;background:#e6f8c8;border:1px solid #bddc89;display:flex;gap:20px}.result-card>svg{color:#638b2a;flex-shrink:0}.result-card>div>p:first-child{font-size:12px;font-weight:900;letter-spacing:.1em;color:#638b2a;margin:0}.result-card h2{font-size:34px;letter-spacing:-.04em;margin:7px 0 20px}.result-numbers{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.result-numbers span{background:#fff;border-radius:12px;padding:16px}.result-numbers small{display:block;color:var(--muted);font-size:12px}.result-numbers strong{display:block;font-size:22px;margin-top:5px;text-transform:capitalize}.result-copy{color:var(--muted);line-height:1.6}.process{max-width:1124px;margin:0 auto 90px;padding:70px 0;border-top:1px solid var(--line)}.process>div{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-top:34px}.process article{background:#fff;border:1px solid var(--line);border-radius:15px;padding:22px}.process article span{color:#7ba33f;font-size:12px;font-weight:900}.process article h3{font-size:18px;margin:18px 0 8px}.process article p{color:var(--muted);font-size:14px;line-height:1.6;margin:0}.growth-offer footer{max-width:1124px;margin:auto;padding:32px 0 45px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:var(--muted);font-size:13px}.growth-offer footer strong{color:var(--ink)}
      @media(max-width:850px){.offer-hero,.audit-section{grid-template-columns:1fr}.offer-hero{padding-top:58px}.form-intro{position:static}.value-strip{margin-left:20px;margin-right:20px}.process,.result-card,.growth-offer footer{margin-left:20px;margin-right:20px}.hero-copy h1{font-size:clamp(43px,12vw,64px)}}
      @media(max-width:600px){.offer-nav{padding:0 18px}.nav-cta{font-size:0;padding:11px}.nav-cta svg{width:18px}.offer-hero,.audit-section{padding-left:18px;padding-right:18px}.offer-hero{gap:36px}.live-estimate{padding:21px}.value-strip{grid-template-columns:1fr}.field-grid,.result-numbers,.process>div{grid-template-columns:1fr}.audit-form{padding:19px}.result-card{padding:22px;display:block}.result-card>svg{margin-bottom:12px}.growth-offer footer{display:grid;gap:4px}}
    `}</style>
  </main>;
}
