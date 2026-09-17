"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import {
    MessageSquare, Send, Sparkles, ArrowLeft, Loader2, Mail,
    Circle, Clock, Building2, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────
interface DomainTab {
    id: string;
    product_name: string;
    domain_name: string;
    thread_count: number;
    unread_count: number;
}

interface Thread {
    id: string;
    subject: string;
    last_message: string | null;
    last_at: string;
    is_read: boolean;
    message_count: number;
    contact_name: string;
    contact_email: string;
    domain_id: string;
    domain_name: string;
    product_name: string;
}

interface Message {
    id: string;
    thread_id: string;
    direction: "inbound" | "outbound";
    body: string;
    created_at: string;
}

type Theme = ReturnType<typeof useTheme>["theme"];

// ── Brand accent colors per product ───────────────────────────────
const BRAND_COLORS: Record<string, string> = {
    "InvestorRaise": "#4A7C59",
    "FinancialModel": "#4A6A4A",
    "AIML School": "#5A4A8A",
    "default": "#8B7355",
};

function getBrandColor(productName: string, fallback: string): string {
    for (const [key, val] of Object.entries(BRAND_COLORS)) {
        if (productName?.toLowerCase().includes(key.toLowerCase())) return val;
    }
    return fallback;
}

// Paused domains are still configured reply domains and should remain visible.
// Only burned domains are hidden from the default Inbox view; "All domains"
// can be used when historical threads need to be audited.
function isCurrentDomain(status: unknown): boolean {
    return String(status || "").toLowerCase() !== "burned";
}

export default function InboxPage() {
    const { theme: t } = useTheme();

    // ── State ────────────────────────────────────────────────────
    const [domainTabs, setDomainTabs] = useState<DomainTab[]>([]);
    const [activeDomainId, setActiveDomainId] = useState<string | null>(null); // null = "All"
    const [threads, setThreads] = useState<Thread[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
    const [tabsLoading, setTabsLoading] = useState(true);
    const [threadsLoading, setThreadsLoading] = useState(false);
    const [msgLoading, setMsgLoading] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [sending, setSending] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [mobileShowChat, setMobileShowChat] = useState(false);
    const [replyError, setReplyError] = useState("");
    const [repairing, setRepairing] = useState(false);
    const [repairMessage, setRepairMessage] = useState("");
    const [showHistory, setShowHistory] = useState(false);
    const [currentResendDomains, setCurrentResendDomains] = useState<string[] | null>(null);
    const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // ── Load domain tabs ─────────────────────────────────────────
    useEffect(() => {
        loadDomainTabs();
    }, [showHistory]);

    useEffect(() => {
        void loadCurrentResendDomains();
    }, []);

    useEffect(() => {
        // Once Resend's live domain list arrives, replace the temporary
        // database-only Inbox view with the current provider-backed view.
        if (currentResendDomains !== null) {
            loadDomainTabs();
            loadThreads();
        }
    }, [currentResendDomains]);

    // ── Load threads when active domain changes ─────────────────
    useEffect(() => {
        loadThreads();
    }, [activeDomainId, showHistory]);

    // ── Auto scroll ─────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Realtime: new message ────────────────────────────────────
    useEffect(() => {
        const ch = supabase
            .channel("inbox-messages-live")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "inbox_messages" }, (payload) => {
                const msg = payload.new as Message;
                setLastEventAt(new Date());
                setSelectedThread((cur) => {
                    if (cur && msg.thread_id === cur.id && msg.direction === "inbound") {
                        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
                    }
                    return cur;
                });
            })
            .subscribe((status) => setRealtimeStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' || status === 'CHANNEL_ERROR' ? 'offline' : 'connecting'));
        return () => { supabase.removeChannel(ch); };
    }, []);

    // ── Realtime: thread list changes ────────────────────────────
    useEffect(() => {
        const ch = supabase
            .channel("inbox-threads-live")
            .on("postgres_changes", { event: "*", schema: "public", table: "inbox_threads" }, () => {
                setLastEventAt(new Date());
                loadDomainTabs();
                loadThreads();
            })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [activeDomainId, showHistory]);

    // Polling is a safety net for deployments where Supabase Realtime has not
    // yet been enabled on inbox tables. Realtime remains the fast path.
    useEffect(() => {
        const interval = setInterval(() => {
            loadDomainTabs();
            loadThreads();
        }, 30000);
        return () => clearInterval(interval);
    }, [activeDomainId]);

    // ── Data loading ─────────────────────────────────────────────
    async function loadCurrentResendDomains() {
        try {
            const response = await fetch('/api/domains/current-resend', { cache: 'no-store' });
            const json = await response.json().catch(() => ({}));
            if (!response.ok || !Array.isArray(json.domains)) return;
            setCurrentResendDomains(json.domains.map((domain: string) => domain.toLowerCase()));
        } catch {
            // Keep the database view available if Resend is temporarily down.
        }
    }

    function isLiveResendDomain(domainName: string | undefined) {
        return currentResendDomains === null || currentResendDomains.includes(String(domainName || '').toLowerCase());
    }

    async function loadDomainTabs() {
        setTabsLoading(true);

        // Get all domains that have at least one inbox thread
        const { data } = await supabase
            .from("inbox_threads")
            .select("domain_id, is_read, domains(id, product_name, domain_name, status)");

        if (!data) { setTabsLoading(false); return; }

        // Group by domain
        const map = new Map<string, DomainTab>();
        for (const row of data) {
            const d = (Array.isArray(row.domains) ? row.domains[0] : row.domains) as any;
            if (!d) continue;
            if (!showHistory && !isCurrentDomain(d.status)) continue;
            if (!showHistory && !isLiveResendDomain(d.domain_name)) continue;
            const existing = map.get(d.id);
            if (existing) {
                existing.thread_count++;
                if (!row.is_read) existing.unread_count++;
            } else {
                map.set(d.id, {
                    id: d.id,
                    product_name: d.product_name || d.domain_name,
                    domain_name: d.domain_name,
                    thread_count: 1,
                    unread_count: row.is_read ? 0 : 1,
                });
            }
        }

        setDomainTabs(Array.from(map.values()));
        setTabsLoading(false);
    }

    async function loadThreads() {
        setThreadsLoading(true);

        let query = supabase
            .from("inbox_threads")
            .select("*, contacts(name, email), domains(id, product_name, domain_name, status)")
            .order("last_at", { ascending: false });

        if (activeDomainId) {
            query = query.eq("domain_id", activeDomainId);
        }

        const { data } = await query;

        setThreads(
            (data || []).filter((row: any) => {
                const domain = Array.isArray(row.domains) ? row.domains[0] : row.domains;
                return showHistory || (isCurrentDomain(domain?.status) && isLiveResendDomain(domain?.domain_name));
            }).map((row: any) => {
                const domain = Array.isArray(row.domains) ? row.domains[0] : row.domains;
                return ({
                id: row.id,
                subject: row.subject,
                last_message: row.last_message,
                last_at: row.last_at,
                is_read: row.is_read,
                message_count: row.message_count,
                contact_name: row.contacts?.name || "",
                contact_email: row.contacts?.email || "",
                domain_id: row.domain_id,
                domain_name: domain?.domain_name || "",
                product_name: domain?.product_name || domain?.domain_name || "",
            });
            })
        );
        setThreadsLoading(false);
    }

    async function repairMissingReplies() {
        if (repairing) return;
        setRepairing(true);
        setRepairMessage("");
        try {
            const res = await fetch("/api/fix-replies");
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || `Repair failed (HTTP ${res.status})`);
            const fixed = Number(payload.fixed || 0);
            const messageIdsBackfilled = Number(payload.message_ids_backfilled || 0);
            setRepairMessage(fixed > 0 || messageIdsBackfilled > 0
                ? `Repaired ${fixed} repl${fixed === 1 ? "y" : "ies"}${messageIdsBackfilled > 0 ? ` and linked ${messageIdsBackfilled} sent message${messageIdsBackfilled === 1 ? "" : "s"}` : ""}.`
                : "No missing reply bodies were found. Check the Receiving API key and webhook history.");
            await Promise.all([loadDomainTabs(), loadThreads()]);
            if (selectedThread) await selectThread(selectedThread);
        } catch (error) {
            setReplyError(error instanceof Error ? error.message : "Could not repair missing replies.");
        } finally {
            setRepairing(false);
        }
    }

    async function selectThread(thread: Thread) {
        setSelectedThread(thread);
        setMobileShowChat(true);
        setMsgLoading(true);
        setReplyText("");

        if (!thread.is_read) {
            await supabase.from("inbox_threads").update({ is_read: true }).eq("id", thread.id);
            setThreads((prev) => prev.map((t) => t.id === thread.id ? { ...t, is_read: true } : t));
        }

        const { data } = await supabase
            .from("inbox_messages")
            .select("id, thread_id, direction, body, created_at")
            .eq("thread_id", thread.id)
            .order("created_at", { ascending: true });

        setMessages(data || []);
        setMsgLoading(false);
    }

    async function handleSendReply() {
        if (!replyText.trim() || !selectedThread || sending) return;
        setSending(true);
        setReplyError("");

        try {
            const res = await fetch('/api/inbox/send-reply', {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ threadId: selectedThread.id, replyText }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || `Reply failed (HTTP ${res.status})`);

            setMessages((prev) => [...prev, {
                id: crypto.randomUUID(),
                thread_id: selectedThread.id,
                direction: "outbound" as const,
                body: replyText,
                created_at: new Date().toISOString(),
            }]);
            setReplyText("");
            loadThreads();
        } catch (error) {
            setReplyError(error instanceof Error ? error.message : "Reply could not be sent.");
        } finally {
            setSending(false);
        }
    }

    async function handleAiReply() {
        if (!selectedThread || generating) return;
        setGenerating(true);

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        const res = await fetch(`${supabaseUrl}/functions/v1/ai-reply`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${anonKey}`,
                "apikey": anonKey,
            },
            body: JSON.stringify({ threadId: selectedThread.id }),
        });

        if (res.ok) {
            const d = await res.json();
            setReplyText(d.reply || "");
            setReplyError("");
        } else {
            const d = await res.json().catch(() => ({}));
            setReplyError(d.error || `AI draft failed (HTTP ${res.status})`);
        }
        setGenerating(false);
    }

    // ── Helpers ──────────────────────────────────────────────────
    function formatTime(dateStr: string) {
        const d = new Date(dateStr);
        const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
        if (diffMin < 1) return "now";
        if (diffMin < 60) return `${diffMin}m`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h`;
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    const totalUnread = threads.filter((t) => !t.is_read).length;
    const activeColor = activeDomainId
        ? getBrandColor(domainTabs.find(d => d.id === activeDomainId)?.product_name || "", t.accent)
        : t.accent;

    // ── RENDER ───────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', fontFamily: t.font }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexShrink: 0 }}>
                <MessageSquare style={{ width: "22px", height: "22px", color: t.accent }} />
                <h1 style={{ fontSize: "22px", fontWeight: 700, color: t.text, fontFamily: t.font, margin: 0, letterSpacing: "-0.03em" }}>
                    Inbox
                </h1>
                {totalUnread > 0 && (
                    <span style={{ background: t.accent, color: "#fff", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px" }}>
                        {totalUnread} new
                    </span>
                )}
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", color: realtimeStatus === 'live' ? t.green : realtimeStatus === 'offline' ? t.coral : t.amber, fontSize: "11px", fontWeight: 600 }} title={lastEventAt ? `Last event ${lastEventAt.toLocaleTimeString()}` : "Waiting for an inbox event"}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "currentColor" }} />
                    {realtimeStatus === 'live' ? 'Live' : realtimeStatus === 'offline' ? 'Polling' : 'Connecting'}
                    {lastEventAt ? ` · ${lastEventAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
                <button onClick={() => { loadDomainTabs(); loadThreads(); }} title="Refresh conversations" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "7px", borderRadius: "8px", border: `1px solid ${t.border}`, background: "transparent", color: t.textMuted, cursor: "pointer" }}>
                    <RefreshCw style={{ width: "14px", height: "14px" }} />
                </button>
                <button
                    onClick={() => setShowHistory((value) => !value)}
                    title={showHistory ? "Hide paused and legacy domains" : "Include paused and legacy domains"}
                    style={{ padding: "7px 10px", borderRadius: "8px", border: `1px solid ${showHistory ? t.accent : t.border}`, background: showHistory ? t.accentSoft : "transparent", color: showHistory ? t.accent : t.textMuted, cursor: "pointer", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}
                >
                    {showHistory ? "All domains" : "Current domains"}
                </button>
                <button
                    onClick={repairMissingReplies}
                    disabled={repairing}
                    title="Fetch full text for inbound messages that were saved as placeholders"
                    style={{ padding: "7px 10px", borderRadius: "8px", border: `1px solid ${t.border}`, background: "transparent", color: t.textMuted, cursor: repairing ? "wait" : "pointer", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}
                >
                    {repairing ? "Repairing…" : "Repair replies"}
                </button>
            </div>

            {replyError && (
                <div style={{ marginBottom: "12px", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${t.coral}66`, background: t.coralSoft, color: t.coral, fontSize: "12px", lineHeight: 1.5 }}>
                    {replyError}
                </div>
            )}
            {repairMessage && (
                <div style={{ marginBottom: "12px", padding: "9px 13px", borderRadius: "9px", border: `1px solid ${t.green}55`, background: `${t.green}12`, color: t.green, fontSize: "12px" }}>
                    {repairMessage}
                </div>
            )}

            {/* Brand Tabs — horizontal scroll on mobile */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "16px", overflowX: "auto", flexShrink: 0, paddingBottom: "4px", WebkitOverflowScrolling: "touch" as any }}>
                {/* All tab */}
                <button
                    onClick={() => { setActiveDomainId(null); setSelectedThread(null); setMobileShowChat(false); }}
                    style={{
                        padding: "6px 14px",
                        borderRadius: "99px",
                        border: `1px solid ${activeDomainId === null ? t.accent : t.border}`,
                        background: activeDomainId === null ? t.accentSoft : "transparent",
                        color: activeDomainId === null ? t.accent : t.textMuted,
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: t.font,
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        transition: "all 150ms",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                    }}
                >
                    All
                    <span style={{ background: t.border, color: t.text, fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "99px" }}>
                        {threads.length || "0"}
                    </span>
                </button>

                {domainTabs.map((domain) => {
                    const isActive = activeDomainId === domain.id;
                    const brandColor = getBrandColor(domain.product_name, t.accent);
                    return (
                        <button
                            key={domain.id}
                            onClick={() => { setActiveDomainId(domain.id); setSelectedThread(null); setMobileShowChat(false); }}
                            style={{
                                padding: "6px 14px",
                                borderRadius: "99px",
                                border: `1px solid ${isActive ? brandColor : t.border}`,
                                background: isActive ? `${brandColor}15` : "transparent",
                                color: isActive ? brandColor : t.textMuted,
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: t.font,
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                transition: "all 150ms",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                            }}
                        >
                            <Building2 style={{ width: "11px", height: "11px" }} />
                            {domain.product_name}
                            {domain.unread_count > 0 && (
                                <span style={{ background: brandColor, color: "#fff", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "99px" }}>
                                    {domain.unread_count}
                                </span>
                            )}
                        </button>
                    );
                })}

                {tabsLoading && (
                    <div style={{ display: "flex", alignItems: "center", color: t.textMuted, fontSize: "12px", gap: "6px", flexShrink: 0 }}>
                        <Loader2 style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} />
                        Loading...
                    </div>
                )}
            </div>

            {/* Main Panel — fills remaining height */}
            <div className={`inbox-panel${mobileShowChat ? " mobile-chat-open" : ""}`} style={{
                background: t.card,
                border: `1px solid ${t.border}`,
                borderRadius: "14px",
                display: "flex",
                flex: 1,
                overflow: "hidden",
                minHeight: 0,
            }}>
                {/* ── Thread List ──────────────────────────────────── */}
                <div className="inbox-thread-list" style={{
                    width: "320px",
                    borderRight: `1px solid ${t.border}`,
                    overflowY: "auto",
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                }}>
                    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.border}`, fontSize: "12px", fontWeight: 600, color: t.textMuted, fontFamily: t.font }}>
                        {activeDomainId
                            ? `${domainTabs.find(d => d.id === activeDomainId)?.product_name || "Brand"} -- ${threads.length} conversation${threads.length !== 1 ? "s" : ""}`
                            : `All brands -- ${threads.length} conversation${threads.length !== 1 ? "s" : ""}`
                        }
                    </div>

                    {threadsLoading ? (
                        <div style={{ padding: "40px", textAlign: "center", color: t.textMuted }}>
                            <Loader2 style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
                        </div>
                    ) : threads.length === 0 ? (
                        <div style={{ padding: "40px 20px", textAlign: "center", color: t.textMuted }}>
                            <Mail style={{ width: "28px", height: "28px", margin: "0 auto 12px", opacity: 0.3 }} />
                            <p style={{ fontSize: "13px", margin: 0 }}>No replies yet</p>
                            <p style={{ fontSize: "11px", marginTop: "4px", opacity: 0.6 }}>
                                Replies to your campaigns will appear here
                            </p>
                        </div>
                    ) : (
                        threads.map((thread) => {
                            const isActive = selectedThread?.id === thread.id;
                            const brandColor = getBrandColor(thread.product_name, t.accent);
                            return (
                                <div
                                    key={thread.id}
                                    onClick={() => selectThread(thread)}
                                    style={{
                                        display: "flex",
                                        gap: "11px",
                                        padding: "13px 18px",
                                        cursor: "pointer",
                                        borderBottom: `1px solid ${t.borderLight}`,
                                        background: isActive ? `${brandColor}10` : "transparent",
                                        borderLeft: isActive ? `3px solid ${brandColor}` : "3px solid transparent",
                                        transition: "all 120ms",
                                    }}
                                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = t.hover; }}
                                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                                >
                                    {/* Avatar with brand color */}
                                    <div style={{
                                        width: "38px", height: "38px", borderRadius: "50%",
                                        background: brandColor,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        flexShrink: 0, fontSize: "14px", fontWeight: 700, color: "#fff",
                                    }}>
                                        {(thread.contact_name || thread.contact_email)[0]?.toUpperCase() || "?"}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontSize: "13px", fontWeight: thread.is_read ? 500 : 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {thread.contact_name || thread.contact_email}
                                            </span>
                                            <span style={{ fontSize: "10px", color: t.textMuted, flexShrink: 0, marginLeft: "6px" }}>
                                                {formatTime(thread.last_at)}
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px" }}>
                                            <p style={{ fontSize: "12px", color: t.textMuted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>
                                                {thread.last_message || thread.subject || "No preview"}
                                            </p>
                                            {!thread.is_read && (
                                                <Circle style={{ width: "7px", height: "7px", fill: brandColor, color: brandColor, flexShrink: 0 }} />
                                            )}
                                        </div>
                                        {/* Show brand tag only in "All" view */}
                                        {!activeDomainId && (
                                            <span style={{ fontSize: "10px", color: brandColor, fontWeight: 600, marginTop: "2px", display: "inline-block" }}>
                                                {thread.product_name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* ── Chat Panel ───────────────────────────────────── */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
                    {!selectedThread ? (
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: t.textMuted }}>
                            <MessageSquare style={{ width: "36px", height: "36px", opacity: 0.15, marginBottom: "14px" }} />
                            <p style={{ fontSize: "14px", fontWeight: 500, margin: 0 }}>Select a conversation</p>
                            <p style={{ fontSize: "12px", opacity: 0.5, marginTop: "6px", margin: "6px 0 0" }}>
                                {activeDomainId
                                    ? `Showing ${domainTabs.find(d => d.id === activeDomainId)?.product_name || "brand"} conversations`
                                    : "Showing all brand conversations"
                                }
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div style={{ padding: "13px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: "11px" }}>
                                <button
                                    onClick={() => { setMobileShowChat(false); setSelectedThread(null); }}
                                    className="inbox-back-btn"
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: t.textMuted, display: "none" }}
                                >
                                    <ArrowLeft style={{ width: "16px", height: "16px" }} />
                                </button>
                                <div style={{
                                    width: "34px", height: "34px", borderRadius: "50%",
                                    background: getBrandColor(selectedThread.product_name, t.accent),
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "13px", fontWeight: 700, color: "#fff",
                                }}>
                                    {(selectedThread.contact_name || selectedThread.contact_email)[0]?.toUpperCase() || "?"}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <p style={{ fontSize: "14px", fontWeight: 600, color: t.text, margin: 0 }}>
                                            {selectedThread.contact_name || selectedThread.contact_email}
                                        </p>
                                        <span style={{
                                            fontSize: "10px",
                                            fontWeight: 700,
                                            padding: "2px 8px",
                                            borderRadius: "99px",
                                            background: `${getBrandColor(selectedThread.product_name, t.accent)}20`,
                                            color: getBrandColor(selectedThread.product_name, t.accent),
                                        }}>
                                            {selectedThread.product_name}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "11px", color: t.textMuted, margin: "1px 0 0" }}>
                                        {selectedThread.contact_email}  |  via {selectedThread.domain_name}
                                    </p>
                                </div>
                            </div>

                            {/* Messages */}
                            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px", minHeight: 0 }}>
                                {msgLoading ? (
                                    <div style={{ textAlign: "center", padding: "40px", color: t.textMuted }}>
                                        <Loader2 style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "40px", color: t.textMuted, fontSize: "13px" }}>
                                        No messages yet in this thread.
                                    </div>
                                ) : (
                                    messages.map((msg) => {
                                        const brand = getBrandColor(selectedThread!.product_name, t.accent);
                                        const isOut = msg.direction === "outbound";
                                        return (
                                            <div key={msg.id} style={{ maxWidth: "72%", alignSelf: isOut ? "flex-end" : "flex-start", animation: "msgFadeIn 200ms ease-out" }}>
                                                <div style={{
                                                    padding: "10px 14px",
                                                    borderRadius: isOut ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                                                    background: isOut ? brand : t.cardInner,
                                                    color: isOut ? "#fff" : t.text,
                                                    fontSize: "13px",
                                                    lineHeight: "1.65",
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-word",
                                                    boxShadow: isOut ? `0 2px 8px ${brand}40` : "none",
                                                }}>
                                                    {msg.body}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px", justifyContent: isOut ? "flex-end" : "flex-start" }}>
                                                    <Clock style={{ width: "9px", height: "9px", color: t.textMuted, opacity: 0.4 }} />
                                                    <span style={{ fontSize: "10px", color: t.textMuted, opacity: 0.5 }}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Reply Bar */}
                            <div style={{ padding: "10px 14px", borderTop: `1px solid ${t.border}`, display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
                                <button
                                    onClick={handleAiReply}
                                    disabled={generating}
                                    title="Generate AI reply"
                                    style={{
                                        background: generating ? t.cardInner : "linear-gradient(135deg, #7c3aed, #4338ca)",
                                        color: "#fff", border: "none", borderRadius: "10px",
                                        padding: "9px 12px", cursor: generating ? "wait" : "pointer",
                                        display: "flex", alignItems: "center", gap: "5px",
                                        fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
                                        flexShrink: 0,
                                    }}
                                >
                                    {generating
                                        ? <Loader2 style={{ width: "13px", height: "13px", animation: "spin 1s linear infinite" }} />
                                        : <Sparkles style={{ width: "13px", height: "13px" }} />
                                    }
                                    AI
                                </button>

                                <textarea
                                    value={replyText}
                                    onChange={(e) => {
                                        setReplyText(e.target.value);
                                        // Auto-grow
                                        const el = e.target;
                                        el.style.height = 'auto';
                                        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                                    }}
                                    placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                                    rows={1}
                                    style={{
                                        flex: 1, background: t.cardInner, border: `1px solid ${t.borderLight}`,
                                        borderRadius: "11px", padding: "10px 14px", fontSize: "13px",
                                        color: t.text, fontFamily: t.font, resize: "none",
                                        outline: "none", minHeight: "44px", maxHeight: "160px",
                                        lineHeight: "1.5", overflowY: "auto",
                                        transition: "border-color 150ms",
                                    }}
                                    onFocus={e => (e.target.style.borderColor = t.accent)}
                                    onBlur={e => (e.target.style.borderColor = t.borderLight)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); }
                                    }}
                                />

                                <button
                                    onClick={handleSendReply}
                                    disabled={!replyText.trim() || sending}
                                    style={{
                                        background: replyText.trim() ? getBrandColor(selectedThread.product_name, t.accent) : t.cardInner,
                                        color: replyText.trim() ? "#fff" : t.textMuted, border: "none", borderRadius: "10px",
                                        padding: "9px 14px", cursor: replyText.trim() ? "pointer" : "default",
                                        display: "flex", alignItems: "center", gap: "5px",
                                        fontSize: "12px", fontWeight: 600, transition: "all 150ms",
                                        flexShrink: 0,
                                    }}
                                >
                                    {sending
                                        ? <Loader2 style={{ width: "13px", height: "13px", animation: "spin 1s linear infinite" }} />
                                        : <Send style={{ width: "13px", height: "13px" }} />
                                    }
                                    Send
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes msgFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
                .inbox-thread-list { display: flex !important; }
                @media (max-width: 768px) {
                    .inbox-back-btn { display: inline-flex !important; }
                    .inbox-thread-list { width: 100% !important; }
                    .inbox-panel { flex-direction: column !important; }
                    .inbox-panel .inbox-thread-list { display: none !important; }
                    .inbox-panel.mobile-chat-open .inbox-thread-list { display: none !important; }
                    .inbox-panel:not(.mobile-chat-open) .inbox-thread-list { display: flex !important; width: 100% !important; border-right: none !important; }
                }
            `}</style>
        </div>
    );
}
