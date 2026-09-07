"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Eye, Globe2, Plus, Save, Trash2, X, Copy } from "lucide-react";
import { Theme, useTheme } from "@/components/theme-provider";
import { defaultSections, LandingDesignKey, landingDesigns, LandingPage, LandingSection, LandingSectionType, LandingTemplateKey, landingTemplates, newLandingPage, sectionLabels } from "@/lib/landing-pages";

const sectionTypes: LandingSectionType[] = ["hero", "features", "proof", "pricing", "faq", "cta", "lead_form", "logos", "gallery", "reviews"];

function inputStyle(t: Theme): React.CSSProperties {
    return { width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, fontSize: 12, outline: "none", fontFamily: t.font };
}

function itemFields(sectionType: LandingSectionType, items: Array<Record<string, unknown>>) {
    if (sectionType === "faq") return ["question", "answer"];
    if (sectionType === "logos") return ["name"];
    if (sectionType === "features") return ["title", "body"];
    if (sectionType === "gallery") return ["image_url", "alt", "caption"];
    if (sectionType === "reviews") return ["quote", "name", "role", "avatar_url"];
    return Object.keys(items[0] || { title: "", body: "" });
}

function AssetField({ value, onChange, field, secret, t }: { value: string; onChange: (value: string) => void; field: string; secret: string; t: Theme }) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    async function upload(file: File | undefined) {
        if (!file) return;
        if (!secret.trim()) { setError("Enter the admin secret above first."); return; }
        setUploading(true); setError("");
        try {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch("/api/marketing/uploads", { method: "POST", headers: { "x-marketing-secret": secret.trim() }, body: formData });
            const body = await response.json();
            if (!response.ok) setError(body.error || "Upload failed.");
            else onChange(body.url);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
        } finally {
            setUploading(false);
        }
    }
    return <div style={{ display: "grid", gap: 5, marginTop: 4 }}><div style={{ display: "flex", gap: 7, alignItems: "center" }}><input type="url" value={value} onChange={(event) => onChange(event.target.value)} placeholder={field === "avatar_url" ? "Optional avatar image URL" : "Paste an image URL or upload below"} style={{ ...inputStyle(t), marginTop: 0 }} /><label style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${t.border}`, borderRadius: 8, background: t.card, color: t.textSec, padding: "9px 10px", cursor: uploading ? "wait" : "pointer", fontSize: 10, fontWeight: 700 }}>{uploading ? "Uploading…" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} style={{ display: "none" }} /></label></div>{error && <span style={{ color: t.coral, fontSize: 10 }}>{error}</span>}{value && <img src={value} alt="Uploaded asset preview" style={{ width: field === "avatar_url" ? 54 : "100%", maxWidth: field === "avatar_url" ? 54 : 420, height: field === "avatar_url" ? 54 : 150, objectFit: "cover", borderRadius: 8, border: `1px solid ${t.border}` }} />}</div>;
}

function ListEditor({ sectionType, value, onChange, t, secret }: { sectionType: LandingSectionType; value: unknown; onChange: (value: Array<Record<string, string>>) => void; t: Theme; secret: string }) {
    const items = Array.isArray(value) ? value.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}) : [];
    const fields = itemFields(sectionType, items);
    const updateItem = (itemIndex: number, field: string, nextValue: string) => onChange(items.map((item, index) => index === itemIndex ? { ...Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, String(entry ?? "")])), [field]: nextValue } : Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, String(entry ?? "")]))));
    const addItem = () => onChange([...items.map((item) => Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, String(entry ?? "")]))), Object.fromEntries(fields.map((field) => [field, ""]))]);
    return <div style={{ display: "grid", gap: 9, marginTop: 6 }}>
        {items.map((item, itemIndex) => <div key={itemIndex} style={{ padding: 11, borderRadius: 9, border: `1px solid ${t.border}`, background: t.cardInner }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><strong style={{ color: t.text, fontSize: 11 }}>Item {itemIndex + 1}</strong><button type="button" onClick={() => onChange(items.filter((_, index) => index !== itemIndex).map((entry) => Object.fromEntries(Object.entries(entry).map(([key, itemValue]) => [key, String(itemValue ?? "")]))))} style={{ border: 0, background: "transparent", color: t.coral, cursor: "pointer" }}>Remove</button></div>
            <div style={{ display: "grid", gap: 8 }}>{fields.map((field) => <label key={field} style={{ color: t.textSec, fontSize: 10 }}>{sectionKeyLabel(field)}{(field === "image_url" || field === "avatar_url") ? <AssetField value={String(item[field] ?? "")} onChange={(nextValue) => updateItem(itemIndex, field, nextValue)} field={field} secret={secret} t={t} /> : <textarea value={String(item[field] ?? "")} onChange={(event) => updateItem(itemIndex, field, event.target.value)} rows={field === "name" || field === "title" || field === "question" ? 1 : 2} style={{ ...inputStyle(t), marginTop: 4, resize: "vertical" }} />}</label>)}</div>
        </div>)}
        <button type="button" onClick={addItem} style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 5, border: `1px dashed ${t.accentBorder}`, borderRadius: 8, background: t.accentSoft, color: t.accent, padding: "8px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}><Plus size={13} /> Add item</button>
    </div>;
}

function sectionKeyLabel(key: string) {
    return key.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function LandingPagesBuilder() {
    const { theme: t } = useTheme();
    const [secret, setSecret] = useState("");
    const [pages, setPages] = useState<Array<Pick<LandingPage, "id" | "name" | "slug" | "status" | "updated_at">>>([]);
    const [page, setPage] = useState<LandingPage | null>(null);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [publishedUrl, setPublishedUrl] = useState("");

    const headers = () => ({ "content-type": "application/json", "x-marketing-secret": secret.trim() });

    useEffect(() => {
        const savedSecret = sessionStorage.getItem("finmodel_admin_secret") || "";
        if (savedSecret) { setSecret(savedSecret); void loadPages(savedSecret); }
    // The saved secret is intentionally loaded once for this browser session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function loadPages(secretValue = secret) {
        if (!secretValue.trim()) return setMessage("Enter LANDING_PAGE_ADMIN_SECRET first.");
        sessionStorage.setItem("finmodel_admin_secret", secretValue.trim());
        setLoading(true); setMessage("");
        const response = await fetch("/api/marketing/automation?resource=landing-pages", { headers: { "x-marketing-secret": secretValue.trim() } });
        const body = await response.json();
        if (!response.ok) setMessage(body.error || "Could not load landing pages.");
        else setPages(body.pages || []);
        setLoading(false);
    }

    async function openPage(id: string) {
        const response = await fetch(`/api/marketing/automation?resource=landing-pages&id=${id}`, { headers: { "x-marketing-secret": secret.trim() } });
        const body = await response.json();
        if (response.ok) setPage(body.page);
        else setMessage(body.error || "Could not open landing page.");
    }

    function updatePage(patch: Partial<LandingPage>) { setPage(current => current ? { ...current, ...patch } : current); }

    function updateSection(index: number, patch: Partial<LandingSection>) {
        setPage(current => current ? { ...current, sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, ...patch } : section) } : current);
    }

    function updateContent(index: number, key: string, value: unknown) {
        setPage(current => current ? { ...current, sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, content: { ...section.content, [key]: value } } : section) } : current);
    }

    function createFromTemplate(templateKey: LandingTemplateKey) {
        setPage(newLandingPage(templateKey));
        setShowTemplates(false);
        setMessage("Template loaded. Edit the copy, save a draft, preview it, then publish when ready.");
    }

    function duplicatePage() {
        if (!page) return;
        setPage({
            ...page,
            id: undefined,
            name: `${page.name} copy`,
            slug: `${page.slug}-copy-${Date.now().toString(36).slice(-4)}`,
            status: "draft",
            created_at: undefined,
            updated_at: undefined,
            published_at: null,
            sections: page.sections.map((section) => ({ ...section, id: undefined, content: JSON.parse(JSON.stringify(section.content)) })),
        });
        setMessage("Duplicate ready. Save draft to create it as a new page.");
    }

    function addSection() {
        setPage(current => current ? { ...current, sections: [...current.sections, { section_type: "cta", sort_order: current.sections.length, content: { heading: "Your next step", body: "Add a clear reason to act.", button_label: "Get started", button_url: "#lead-form" } }] } : current);
    }

    function changeSectionType(index: number, sectionType: LandingSectionType) {
        const template = defaultSections().find((section) => section.section_type === sectionType);
        const extraTemplates: Partial<Record<LandingSectionType, Record<string, unknown>>> = {
            gallery: { eyebrow: "SEE IT IN ACTION", heading: "Show visitors what they will get.", body: "Add product screenshots, workflow images or campaign creative.", items: [{ image_url: "", alt: "Product screenshot", caption: "Add a short caption" }] },
            reviews: { eyebrow: "CUSTOMER REVIEWS", heading: "Let customers tell the story.", body: "Add real reviews with the customer name, role and optional photo.", items: [{ quote: "Add a real customer review here.", name: "Customer name", role: "Role, Company", avatar_url: "" }] },
        };
        updateSection(index, { section_type: sectionType, content: template?.content || extraTemplates[sectionType] || { heading: "New section", body: "Describe your offer here." } });
    }

    function moveSection(index: number, direction: -1 | 1) {
        setPage(current => {
            if (!current) return current;
            const target = index + direction;
            if (target < 0 || target >= current.sections.length) return current;
            const sections = [...current.sections];
            [sections[index], sections[target]] = [sections[target], sections[index]];
            return { ...current, sections: sections.map((section, sort_order) => ({ ...section, sort_order })) };
        });
    }

    function removeSection(index: number) {
        setPage(current => current ? { ...current, sections: current.sections.filter((_, sectionIndex) => sectionIndex !== index).map((section, sort_order) => ({ ...section, sort_order })) } : current);
    }

    async function save(status?: LandingPage["status"]) {
        if (!page) return;
        if (!secret.trim()) return setMessage("Enter the admin secret first.");
        setSaving(true); setMessage("");
        try {
            const nextPage = { ...page, status: status || page.status };
            const response = await fetch("/api/marketing/automation", { method: "POST", headers: headers(), body: JSON.stringify({ resource: "landing-pages", action: "save", id: page.id, page: nextPage }) });
            const body = await response.json();
            if (!response.ok) setMessage(body.error || "Could not save landing page.");
            else { setPage(body.page); const publicPath = `/p/${body.page.slug}`; setPublishedUrl(status === "published" ? publicPath : ""); setMessage(status === "published" ? "Published successfully. Open the public page below to test it." : "Saved."); await loadPages(); }
        } catch (error) {
            setMessage(error instanceof Error ? `Publish failed: ${error.message}` : "Publish failed. Check the server and try again.");
        } finally {
            setSaving(false);
        }
    }

    async function removePage() {
        if (!page?.id || !window.confirm("Delete this landing page?")) return;
        const response = await fetch("/api/marketing/automation", { method: "POST", headers: headers(), body: JSON.stringify({ resource: "landing-pages", action: "delete", id: page.id }) });
        const body = await response.json();
        if (!response.ok) return setMessage(body.error || "Could not delete landing page.");
        setPage(null); setMessage("Landing page deleted."); await loadPages();
    }

    return <div style={{ display: "grid", gap: 20, fontFamily: t.font }}>
        <style>{`@media(max-width:800px){.landing-builder-grid{grid-template-columns:1fr!important}.landing-settings-grid{grid-template-columns:1fr!important}}@media(max-width:520px){.landing-template-grid{grid-template-columns:1fr!important}}`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
            <div><h1 style={{ margin: 0, color: t.text, fontSize: 26, letterSpacing: "-0.03em" }}>Landing page builder</h1><p style={{ margin: "7px 0 0", color: t.textMuted, fontSize: 14 }}>Create campaign pages without changing your product website.</p></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="password" value={secret} onChange={event => setSecret(event.target.value)} placeholder="Admin secret" style={{ ...inputStyle(t), width: 190 }} /><button onClick={() => loadPages()} disabled={loading} style={{ padding: "9px 12px", border: 0, borderRadius: 8, background: t.accent, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{loading ? "Loading…" : "Load pages"}</button></div>
        </div>
        {message && <div style={{ padding: 12, borderRadius: 9, background: t.cardInner, color: t.textSec, fontSize: 12 }}>{message}</div>}
        {publishedUrl && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: 12, borderRadius: 9, border: `1px solid ${t.accentBorder}`, background: t.accentSoft }}><div><strong style={{ display: "block", color: t.text, fontSize: 12 }}>Your page is live</strong><span style={{ display: "block", marginTop: 4, color: t.textSec, fontSize: 11 }}>{publishedUrl}</span></div><Link href={publishedUrl} target="_blank" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 11px", borderRadius: 8, background: t.accent, color: "#fff", textDecoration: "none", fontSize: 11, fontWeight: 700 }}><Eye size={13} /> Open page</Link></div>}
        <div className="landing-builder-grid" style={{ display: "grid", gridTemplateColumns: "minmax(220px,.7fr) minmax(0,1.7fr)", gap: 18, alignItems: "start" }}>
            <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><strong style={{ color: t.text, fontSize: 13 }}>Your pages</strong><button onClick={() => setShowTemplates(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: 0, borderRadius: 7, padding: "7px 9px", background: t.accentSoft, color: t.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Plus style={{ width: 13, height: 13 }} /> Create page</button></div>
                {pages.length === 0 ? <p style={{ color: t.textMuted, fontSize: 12, lineHeight: 1.5 }}>No pages yet. Create your first campaign page.</p> : <div style={{ display: "grid", gap: 7 }}>{pages.map(item => <button key={item.id} onClick={() => item.id && openPage(item.id)} style={{ textAlign: "left", border: `1px solid ${page?.id === item.id ? t.accent : t.borderLight}`, background: page?.id === item.id ? t.accentSoft : t.cardInner, borderRadius: 8, padding: 10, cursor: "pointer" }}><strong style={{ display: "block", color: t.text, fontSize: 12 }}>{item.name}</strong><span style={{ display: "block", marginTop: 4, color: t.textMuted, fontSize: 10 }}>/{item.slug} · {item.status}</span></button>)}</div>}
            </div>
            {!page ? <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 28, color: t.textMuted, fontSize: 13 }}>Choose a page or click <strong style={{ color: t.text }}>Create page</strong> to choose a starting template.</div> : <div style={{ display: "grid", gap: 14 }}>
                <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 18 }}><div className="landing-settings-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}><label style={{ color: t.textSec, fontSize: 11 }}>Page name<input value={page.name} onChange={event => updatePage({ name: event.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} /></label><label style={{ color: t.textSec, fontSize: 11 }}>Public link name<input value={page.slug} onChange={event => updatePage({ slug: event.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} /></label><label style={{ color: t.textSec, fontSize: 11 }}>Visual design<select value={page.design_key || "sage"} onChange={event => updatePage({ design_key: event.target.value as LandingDesignKey })} style={{ ...inputStyle(t), marginTop: 5 }}>{landingDesigns.map(design => <option key={design.key} value={design.key}>{design.name}</option>)}</select><span style={{ display: "block", marginTop: 4, color: t.textMuted, fontSize: 10 }}>{landingDesigns.find(design => design.key === (page.design_key || "sage"))?.description}</span></label></div><details style={{ marginTop: 12 }}><summary style={{ color: t.textSec, fontSize: 11, cursor: "pointer", fontWeight: 700 }}>Search preview settings (optional)</summary><div className="landing-settings-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}><label style={{ color: t.textSec, fontSize: 11 }}>Search title<input value={page.seo_title} onChange={event => updatePage({ seo_title: event.target.value })} style={{ ...inputStyle(t), marginTop: 5 }} /></label><label style={{ color: t.textSec, fontSize: 11 }}>Search description<textarea value={page.seo_description} onChange={event => updatePage({ seo_description: event.target.value })} rows={2} style={{ ...inputStyle(t), marginTop: 5, resize: "vertical" }} /></label></div></details></div>
                {page.sections.map((section, index) => <div key={section.id || index} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div><span style={{ display: "block", color: t.textMuted, fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 5 }}>Section {index + 1}</span><select value={section.section_type} onChange={event => changeSectionType(index, event.target.value as LandingSectionType)} style={{ ...inputStyle(t), width: 180, fontWeight: 700 }}>{sectionTypes.map(type => <option key={type} value={type}>{sectionLabels[type]}</option>)}</select></div>
                        <div style={{ display: "flex", gap: 4 }}><button onClick={() => moveSection(index, -1)} disabled={index === 0} title="Move section up" style={{ border: 0, background: t.cardInner, color: t.textSec, borderRadius: 7, padding: 6, cursor: "pointer", opacity: index === 0 ? .35 : 1 }}><ChevronUp size={15} /></button><button onClick={() => moveSection(index, 1)} disabled={index === page.sections.length - 1} title="Move section down" style={{ border: 0, background: t.cardInner, color: t.textSec, borderRadius: 7, padding: 6, cursor: "pointer", opacity: index === page.sections.length - 1 ? .35 : 1 }}><ChevronDown size={15} /></button><button onClick={() => removeSection(index)} title="Remove section" style={{ border: 0, background: "transparent", color: t.coral, cursor: "pointer", padding: 6 }}><Trash2 size={15} /></button></div>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>{Object.entries(section.content).map(([key, value]) => <label key={key} style={{ color: t.textSec, fontSize: 11 }}>{sectionKeyLabel(key)}{Array.isArray(value) ? <ListEditor sectionType={section.section_type} value={value} onChange={(items) => updateContent(index, key, items)} t={t} secret={secret} /> : <textarea value={String(value ?? "")} onChange={event => updateContent(index, key, event.target.value)} rows={String(value).length > 90 ? 4 : 2} style={{ ...inputStyle(t), marginTop: 5, resize: "vertical" }} />}</label>)}</div>
                </div>)}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><button onClick={addSection} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Plus style={{ width: 13, height: 13 }} /> Add section</button><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{page.id && <button onClick={duplicatePage} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Copy style={{ width: 13, height: 13 }} /> Duplicate</button>}{page.id && page.status === "published" && <Link href={`/?page=${page.slug}`} target="_blank" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, fontSize: 11, fontWeight: 700, textDecoration: "none" }}><Eye style={{ width: 13, height: 13 }} /> Preview</Link>}{page.id && <button onClick={removePage} style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.coral}`, background: "transparent", color: t.coral, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>}<button onClick={() => save("draft")} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Save style={{ width: 13, height: 13 }} /> Save draft</button><button onClick={() => save("published")} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 8, border: 0, background: t.accent, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Globe2 style={{ width: 13, height: 13 }} /> Publish</button></div></div>
            </div>}
        </div>
        {showTemplates && <div role="dialog" aria-modal="true" aria-label="Choose a landing page template" onClick={() => setShowTemplates(false)} style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "rgba(0,0,0,.62)" }}><div onClick={(event) => event.stopPropagation()} style={{ width: "min(760px, 100%)", maxHeight: "min(720px, 90vh)", overflowY: "auto", background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 22, boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}><div><h2 style={{ margin: 0, color: t.text, fontSize: 20 }}>Choose a starting point</h2><p style={{ margin: "7px 0 0", color: t.textMuted, fontSize: 12 }}>Pick the campaign goal. You can edit every word and section before publishing.</p></div><button type="button" onClick={() => setShowTemplates(false)} aria-label="Close template chooser" style={{ border: 0, background: t.cardInner, color: t.textSec, borderRadius: 8, padding: 7, cursor: "pointer" }}><X size={16} /></button></div><div className="landing-template-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 18 }}>{landingTemplates.map((template) => <button key={template.key} type="button" onClick={() => createFromTemplate(template.key)} style={{ textAlign: "left", padding: 14, borderRadius: 11, border: `1px solid ${t.border}`, background: t.cardInner, color: t.text, cursor: "pointer" }}><strong style={{ display: "block", fontSize: 13 }}>{template.name}</strong><span style={{ display: "block", marginTop: 6, color: t.textSec, fontSize: 11, lineHeight: 1.45 }}>{template.description}</span><span style={{ display: "block", marginTop: 10, color: t.accent, fontSize: 10, fontWeight: 700 }}>{template.audience}</span></button>)}</div></div></div>}
        <p style={{ margin: 0, color: t.textMuted, fontSize: 11 }}>No coding is required. Add, remove and reorder sections with the buttons above. Published pages are available at <code>/p/your-slug</code>.</p>
    </div>;
}
