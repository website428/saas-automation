"use client";

import React, { useEffect, useState, useRef } from "react";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import { formatQueueTime } from "@/lib/data";
import { Search, Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw, Mail, Eye, MousePointerClick, AlertTriangle, Zap, Send, X } from "lucide-react";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}
function inputStyle(t: Theme): React.CSSProperties {
    return { width: '100%', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, fontSize: '14px', outline: 'none', transition: 'border-color 200ms ease', fontFamily: t.font };
}

// ── Status labels shown in toasts ─────────────────────────────────
const STATUS_TOAST: Record<string, { label: string; color: string }> = {
    opened: { label: 'opened your email', color: '#818cf8' },
    clicked: { label: 'clicked a link', color: '#c084fc' },
    delivered: { label: 'email delivered', color: '#34d399' },
    replied: { label: 'replied to your email', color: '#60a5fa' },
    bounced: { label: 'email bounced', color: '#fb923c' },
    complained: { label: 'marked as spam', color: '#f43f5e' },
};

interface Toast {
    id: string;
    message: string;
    color: string;
}

export default function QueuePage() {
    const { theme: t } = useTheme();
    const [queue, setQueue] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [refreshing, setRefreshing] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [triggering, setTriggering] = useState(false);
    const [triggerResult, setTriggerResult] = useState<string | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const queueRef = useRef<any[]>([]);

    // Keep a ref in sync so the Realtime callback can read the latest queue
    useEffect(() => { queueRef.current = queue; }, [queue]);

    // ── Show a toast ─────────────────────────────────────────────
    function showToast(msg: string, color: string) {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message: msg, color }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }

    async function triggerNow(campaignId?: string) {
        setTriggering(true);
        setTriggerResult(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const body = campaignId ? JSON.stringify({ force_campaign_id: campaignId }) : '{}';
            const res = await fetch(
                `${supabaseUrl}/functions/v1/process-queue`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body,
                }
            );
            const json = await res.json();
            if (json.sent > 0) {
                setTriggerResult(`✅ Sent ${json.sent} email${json.sent !== 1 ? 's' : ''}!`);
            } else if (json.window_skipped > 0) {
                setTriggerResult(`⏰ Domain time window not active yet. Skipped ${json.window_skipped} domain(s).`);
            } else if (json.skipped) {
                setTriggerResult(`⏸ Skipped: ${json.skipped}`);
            } else if (json.dedup_skipped > 0) {
                setTriggerResult(`🔁 All contacts were emailed within 48h — rescheduled.`);
            } else {
                setTriggerResult(`ℹ️ Ran OK — no emails ready to send right now.`);
            }
            await load();
        } catch (e: any) {
            setTriggerResult(`❌ Error: ${e.message}`);
        } finally {
            setTriggering(false);
        }
    };

    async function load() {
        setRefreshing(true);
        const { data } = await supabase.from('email_queue')
            .select(`
                *,
                contacts ( name, email ),
                campaigns ( name ),
                domains ( domain_name )
            `)
            .order('scheduled_at', { ascending: true })
            .limit(100);
        setQueue(data || []);
        setLoading(false);
        setRefreshing(false);
    }
    useEffect(() => { load(); }, []);

    // Auto-refresh polling every 10 seconds (Realtime handles instant updates)
    useEffect(() => {
        const interval = setInterval(() => {
            if (!refreshing) load();
        }, 10000);
        return () => clearInterval(interval);
    }, [refreshing]);

    // ── Supabase Realtime: live email_queue status updates ────────
    // Fires instantly when process-webhook updates a row (e.g., opened)
    useEffect(() => {
        const ch = supabase
            .channel('email-queue-live')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'email_queue' },
                (payload) => {
                    const updated = payload.new as any;
                    const old = payload.old as any;

                    // Update the row in local state immediately
                    setQueue(prev =>
                        prev.map(item =>
                            item.id === updated.id
                                ? { ...item, ...updated }
                                : item
                        )
                    );

                    // Show a toast only when status actually changes to a notable one
                    if (old?.status !== updated.status) {
                        const toastInfo = STATUS_TOAST[updated.status];
                        if (toastInfo) {
                            // Find the contact name from the current queue ref
                            const qItem = queueRef.current.find(q => q.id === updated.id);
                            const name = qItem?.contacts?.name || qItem?.contacts?.email || 'Someone';
                            showToast(`${name} ${toastInfo.label}`, toastInfo.color);
                        }
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, []);

    const filtered = queue.filter(q => {
        if (statusFilter !== "all" && q.status !== statusFilter) return false;
        if (search) {
            const s = search.toLowerCase();
            return (q.contacts?.email?.toLowerCase().includes(s) ||
                q.campaigns?.name?.toLowerCase().includes(s));
        }
        return true;
    });

    const statusMap: Record<string, { color: string; bg: string; icon: any; label: string }> = {
        queued: { color: t.textMuted, bg: t.cardInner, icon: Clock, label: 'Queued' },
        sending: { color: t.amber, bg: t.amberSoft, icon: RefreshCw, label: 'Sending' },
        sent: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', icon: Mail, label: 'Sent' },
        delivered: { color: t.green, bg: t.greenSoft, icon: CheckCircle2, label: 'Delivered' },
        opened: { color: '#818cf8', bg: 'rgba(129,140,248,0.15)', icon: Eye, label: 'Opened' },
        clicked: { color: '#c084fc', bg: 'rgba(192,132,252,0.1)', icon: MousePointerClick, label: 'Clicked' },
        bounced: { color: t.coral, bg: t.coralSoft, icon: XCircle, label: 'Bounced' },
        complained: { color: '#f43f5e', bg: 'rgba(244,63,94,0.1)', icon: AlertTriangle, label: 'Complained' },
        failed: { color: t.coral, bg: t.coralSoft, icon: XCircle, label: 'Failed' },
        cancelled: { color: t.textMuted, bg: t.cardInner, icon: AlertCircle, label: 'Cancelled' },
    };

    async function loadEvents(queueId: string) {
        if (expandedId === queueId) { setExpandedId(null); return; }
        setExpandedId(queueId);
        const item = queue.find(q => q.id === queueId);
        if (!item?.resend_id) { setEvents([]); return; }
        const { data } = await supabase.from('webhook_events')
            .select('event_type, received_at, metadata')
            .eq('resend_id', item.resend_id)
            .order('received_at', { ascending: true });
        setEvents(data || []);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '1200px' }}>

            {/* ── Toast Notifications ──────────────────────────────────── */}
            <div style={{
                position: 'fixed', top: '20px', right: '20px',
                display: 'flex', flexDirection: 'column', gap: '8px',
                zIndex: 9999, pointerEvents: 'none',
            }}>
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            background: t.card,
                            border: `1px solid ${toast.color}25`,
                            borderLeft: `3px solid ${toast.color}`,
                            borderRadius: '10px',
                            padding: '11px 14px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: t.text,
                            fontFamily: t.font,
                            pointerEvents: 'all',
                            minWidth: '240px',
                            animation: 'slideInRight 250ms ease',
                        }}
                    >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: toast.color, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{toast.message}</span>
                        <button
                            onClick={() => setToasts(prev => prev.filter(tt => tt.id !== toast.id))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, padding: '2px', display: 'flex', alignItems: 'center' }}
                        >
                            <X style={{ width: '13px', height: '13px' }} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Sending Queue</h1>
                    <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Monitor pending and recently sent emails across all campaigns. Updates in real-time.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={load} disabled={refreshing}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px', background: t.cardInner, color: t.text, border: `1px solid ${t.border}`, fontWeight: 600, cursor: refreshing ? 'not-allowed' : 'pointer', fontFamily: t.font }}
                        >
                            <RefreshCw style={{ width: '16px', height: '16px', animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                            Refresh
                        </button>
                        <button
                            onClick={() => triggerNow()} disabled={triggering}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', background: triggering ? t.accentSoft : t.accent, color: '#fff', border: 'none', fontWeight: 600, cursor: triggering ? 'not-allowed' : 'pointer', fontFamily: t.font, opacity: triggering ? 0.7 : 1, transition: 'all 150ms' }}
                        >
                            <Zap style={{ width: '15px', height: '15px', animation: triggering ? 'spin 1s linear infinite' : 'none' }} />
                            {triggering ? 'Running…' : 'Trigger Now'}
                        </button>
                    </div>
                    {triggerResult && (
                        <p style={{ fontSize: '12px', margin: 0, color: triggerResult.startsWith('✅') ? t.green : triggerResult.startsWith('❌') ? t.coral : t.textMuted, fontWeight: 500 }}>
                            {triggerResult}
                        </p>
                    )}
                </div>
            </div>

            <div style={{ ...card(t), padding: 0, overflow: 'hidden' }}>
                {/* Filters — horizontal scroll on mobile */}
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: '12px', alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any, flexShrink: 0 }}>
                    <div style={{ position: 'relative', minWidth: '220px', flexShrink: 0 }}>
                        <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', color: t.textMuted }} />
                        <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search email or campaign…"
                            style={{ ...inputStyle(t), paddingLeft: '36px' }}
                        />
                    </div>
                    <select
                        value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        style={{ ...inputStyle(t), width: '150px', cursor: 'pointer', flexShrink: 0 }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="queued">Queued</option>
                        <option value="sending">Sending</option>
                        <option value="sent">Sent</option>
                        <option value="delivered">Delivered</option>
                        <option value="opened">Opened</option>
                        <option value="clicked">Clicked</option>
                        <option value="bounced">Bounced</option>
                        <option value="failed">Failed</option>
                    </select>
                    {/* Live indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexShrink: 0 }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80', animation: 'pulse 2s ease infinite' }} />
                        <span style={{ fontSize: '11px', color: t.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>Live</span>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>Loading queue…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>Queue is empty based on filters.</div>
                ) : (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                        <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${t.borderLight}` }}>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Recipient</th>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Campaign</th>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Domain</th>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Scheduled / Sent</th>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Status</th>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(q => {
                                    const status = statusMap[q.status] || statusMap.queued;
                                    const StatusIcon = status.icon;
                                    const dateStr = q.status === 'sent' && q.sent_at ? q.sent_at : q.scheduled_at;
                                    const dateObj = new Date(dateStr);
                                    const isToday = dateObj.toDateString() === new Date().toDateString();
                                    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                                    const exactDiff = (q.status === 'queued' || q.status === 'sending')
                                        ? ` (${formatQueueTime(q.scheduled_at)})` : '';
                                    const isOpened = q.status === 'opened' || q.status === 'clicked';

                                    return (
                                        <React.Fragment key={q.id}>
                                            <tr
                                                style={{
                                                    borderBottom: `1px solid ${t.borderLight}`,
                                                    cursor: q.resend_id ? 'pointer' : 'default',
                                                    background: expandedId === q.id
                                                        ? t.cardInner
                                                        : isOpened
                                                            ? `${status.color}08`
                                                            : 'transparent',
                                                    transition: 'background 300ms ease',
                                                }}
                                                onClick={() => q.resend_id && loadEvents(q.id)}
                                            >
                                                <td style={{ padding: '14px 20px' }}>
                                                    <p style={{ margin: 0, fontWeight: 500, color: t.text }}>{q.contacts?.name || '—'}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: t.textMuted }}>{q.contacts?.email}</p>
                                                </td>
                                                <td style={{ padding: '14px 20px', color: t.textSec }}>
                                                    {q.campaigns?.name}
                                                </td>
                                                <td style={{ padding: '14px 20px', color: t.textMuted }}>
                                                    {q.domains?.domain_name}
                                                </td>
                                                <td style={{ padding: '14px 20px', color: t.textMuted }}>
                                                    {isToday ? `Today at ${timeStr}` : `${dateObj.toLocaleDateString()} ${timeStr}`}
                                                    <span style={{ fontSize: '11px', display: 'block', marginTop: '2px', color: t.textSec }}>{exactDiff}</span>
                                                </td>
                                                <td style={{ padding: '14px 20px' }}>
                                                    <span style={{
                                                        fontSize: '11px', fontWeight: 600,
                                                        padding: '4px 10px', borderRadius: '12px',
                                                        color: status.color, background: status.bg,
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        boxShadow: isOpened ? `0 0 8px ${status.color}40` : 'none',
                                                        transition: 'all 300ms ease',
                                                    }}>
                                                        <StatusIcon style={{ width: '12px', height: '12px' }} />
                                                        {status.label}
                                                    </span>
                                                    {q.error_message && (
                                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: t.coral }}>{q.error_message}</p>
                                                    )}
                                                </td>
                                                <td style={{ padding: '14px 20px' }}>
                                                    {q.status === 'queued' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); triggerNow(q.campaign_id); }}
                                                            disabled={triggering}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '8px', background: t.accentSoft, color: t.accent, border: `1px solid ${t.accent}`, fontSize: '11px', fontWeight: 700, cursor: triggering ? 'not-allowed' : 'pointer', fontFamily: t.font }}
                                                        >
                                                            <Send style={{ width: '11px', height: '11px' }} />
                                                            Send Now
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {expandedId === q.id && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '0 20px 16px 40px', background: t.cardInner }}>
                                                        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.textMuted, margin: '12px 0 8px' }}>Event Timeline</p>
                                                        {events.length === 0 ? (
                                                            <p style={{ fontSize: '12px', color: t.textMuted }}>No webhook events recorded yet.</p>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                {events.map((ev, i) => (
                                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                                                                        <span style={{ fontSize: '10px', color: t.textMuted, fontFamily: 'monospace', minWidth: '70px' }}>
                                                                            {new Date(ev.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                                        </span>
                                                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: (statusMap[ev.event_type?.replace('email.', '')] || statusMap.sent).color, flexShrink: 0 }} />
                                                                        <span style={{ color: t.text, fontWeight: 500 }}>{ev.event_type?.replace('email.', '').replace(/^./, (c: string) => c.toUpperCase())}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
                @keyframes pulse {
                    0%, 100% { opacity: 1; box-shadow: 0 0 6px #4ade80; }
                    50% { opacity: 0.5; box-shadow: 0 0 2px #4ade80; }
                }
                @keyframes slideInRight {
                    from { transform: translateX(40px); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
            `}</style>
        </div>
    );
}
