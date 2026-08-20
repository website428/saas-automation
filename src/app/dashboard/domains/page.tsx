"use client";

import { useEffect, useState } from "react";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import {
    Globe, ShieldAlert, ShieldCheck, Zap, AlertCircle,
    Pause, Play, Trash2, Clock, Activity
} from "lucide-react";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}

export default function DomainsPage() {
    const { theme: t } = useTheme();
    const [domains, setDomains] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [killConfirm, setKillConfirm] = useState<string | null>(null);
    const [editRegionModal, setEditRegionModal] = useState<{id: string, start: number, end: number} | null>(null);

    const REGIONS = [
        { id: "india", label: "India (9 AM - 6 PM)", start: 9, end: 18, flag: "🇮🇳" },
        { id: "uae", label: "UAE (9 AM - 6 PM)", start: 10, end: 19, flag: "🇦🇪" },
        { id: "europe", label: "Europe (9 AM - 6 PM)", start: 13, end: 22, flag: "🇪🇺" },
        { id: "uk", label: "UK (9 AM - 6 PM)", start: 14, end: 23, flag: "🇬🇧" },
        { id: "us_east", label: "US East (9 AM - 6 PM)", start: 19, end: 4, flag: "🇺🇸" },
        { id: "us_west", label: "US West (9 AM - 6 PM)", start: 22, end: 7, flag: "🇺🇸" },
        { id: "24_7", label: "24x7 Non-Stop", start: 0, end: 24, flag: "🌍" },
    ];

    async function load() {
        const { data } = await supabase
            .from('domains')
            .select('*')
            .order('health_score', { ascending: false });
        setDomains(data || []);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    async function pauseDomain(id: string) {
        setActionLoading(id + '_pause');
        await supabase.from('domains').update({ status: 'paused' }).eq('id', id);
        await load();
        setActionLoading(null);
    }

    async function resumeDomain(id: string, currentLimit: number) {
        setActionLoading(id + '_resume');
        const updates: any = { status: 'warming' };
        if (!currentLimit || currentLimit <= 0) {
            updates.daily_limit = 20;
        }
        await supabase.from('domains').update(updates).eq('id', id);
        await load();
        setActionLoading(null);
    }

    async function killDomain(id: string) {
        setActionLoading(id + '_kill');
        // Cancel all queued emails for this domain
        await supabase.from('email_queue')
            .update({ status: 'failed', error_message: 'Manually cancelled via kill switch' })
            .eq('domain_id', id)
            .eq('status', 'queued');
        // Pause the domain
        await supabase.from('domains').update({ status: 'paused' }).eq('id', id);
        setKillConfirm(null);
        await load();
        setActionLoading(null);
    }

    async function handleEditLimit(id: string, currentLimit: number) {
        const val = window.prompt("Enter new daily limit:", String(currentLimit));
        if (!val) return;
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 100) return alert("Enter a value from 0 to 100. The Resend free account cap is shared across all domains.");
        setActionLoading(id + '_edit');
        await supabase.from('domains').update({ daily_limit: parsed }).eq('id', id);
        await load();
        setActionLoading(null);
    }

    async function saveRegion(id: string, start: number, end: number) {
        setActionLoading(id + '_edit_time');
        setEditRegionModal(null);
        await supabase.from('domains').update({ send_hour_start: start, send_hour_end: end }).eq('id', id);
        await load();
        setActionLoading(null);
    }

    const statusMap: Record<string, { color: string; bg: string; icon: any }> = {
        warming: { color: t.amber, bg: t.amberSoft, icon: Zap },
        warm: { color: t.green, bg: t.greenSoft, icon: ShieldCheck },
        paused: { color: t.textMuted, bg: t.cardInner, icon: Pause },
        burned: { color: t.coral, bg: t.coralSoft, icon: ShieldAlert },
    };

    function getRegionForHours(start: number, end: number) {
        return REGIONS.find(r => r.start === start && r.end === end) || { id: "custom", label: "Custom", flag: "⚙️", start, end };
    }

    // Time window label helper
    function timeWindowLabel(start: number, end: number): string {
        const region = getRegionForHours(start, end);
        if (region.id === "custom") {
            const fmt = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
            return `${fmt(start)}–${fmt(end)} IST`;
        }
        return `${region.flag} ${region.label.split('(')[0].trim()}`;
    }

    // Current IST hour for "active now" indicator
    const nowISTHour = new Date(Date.now() + 5.5 * 3600000).getUTCHours();
    function isActiveNow(start: number, end: number): boolean {
        const s = start ?? 9, e = end ?? 20;
        if (s <= e) return nowISTHour >= s && nowISTHour < e;
        return nowISTHour >= s || nowISTHour < e; // Overnight shift
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '1000px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Sending Domains</h1>
                    <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Monitor health, warmup progress, and control each domain.</p>
                </div>
            </div>

            {/* Global kill switch */}
            {domains.some(d => d.status !== 'paused') && (
                <div style={{ ...card(t), background: 'rgba(239,68,68,0.04)', border: `1px solid rgba(239,68,68,0.15)`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: t.coral }}>⚠️ Emergency Stop</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: t.textMuted }}>Pauses ALL domains and cancels all queued emails immediately.</p>
                    </div>
                    <button
                        onClick={async () => {
                            if (!confirm('STOP ALL SENDING? This cancels all queued emails across every domain.')) return;
                            setActionLoading('global');
                            await supabase.from('domains').update({ status: 'paused' }).in('status', ['warming', 'warm']);
                            await supabase.from('email_queue').update({ status: 'failed', error_message: 'Emergency stop' }).eq('status', 'queued');
                            await load();
                            setActionLoading(null);
                        }}
                        disabled={actionLoading === 'global'}
                        style={{ padding: '8px 18px', borderRadius: '8px', border: `1px solid ${t.coral}`, background: 'rgba(239,68,68,0.08)', color: t.coral, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: t.font }}
                    >
                        {actionLoading === 'global' ? 'Stopping…' : 'Stop All Sending'}
                    </button>
                </div>
            )}

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>Loading domains…</div>
            ) : domains.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>No domains found.</div>
            ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                    {domains.map(d => {
                        const status = statusMap[d.status] || statusMap.paused;
                        const StatusIcon = status.icon;
                        const activeNow = isActiveNow(d.send_hour_start ?? 9, d.send_hour_end ?? 20);
                        const isPaused = d.status === 'paused' || d.status === 'burned';

                        return (
                            <div key={d.id} style={{ ...card(t), display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Top row: domain info + action buttons */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                                    {/* Domain info */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: t.cardInner, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Globe style={{ width: '16px', height: '16px', color: t.textSec }} />
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: t.text }}>{d.domain_name}</h3>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: t.textMuted }}>{d.from_email}</p>
                                            </div>
                                        </div>
                                        {/* Badges */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', color: status.color, background: status.bg, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}>
                                                <StatusIcon style={{ width: '11px', height: '11px' }} /> {d.status}
                                            </span>
                                            {d.product_name && (
                                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', color: t.textSec, background: t.cardInner }}>
                                                    {d.product_name}
                                                </span>
                                            )}
                                            {/* Time window badge */}
                                            <span 
                                                onClick={() => setEditRegionModal({ id: d.id, start: d.send_hour_start ?? 9, end: d.send_hour_end ?? 20 })}
                                                title="Click to select region"
                                                style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', color: activeNow ? t.green : t.textMuted, background: activeNow ? t.greenSoft : t.cardInner, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                            >
                                                {activeNow ? <Activity style={{ width: '10px', height: '10px' }} /> : <Clock style={{ width: '11px', height: '11px' }} />}
                                                {timeWindowLabel(d.send_hour_start ?? 9, d.send_hour_end ?? 20)}
                                                <span style={{ textDecoration: 'underline', color: t.accent, marginLeft: '4px' }}>edit</span>
                                            </span>
                                        </div>
                                    </div>

                                    {/* Control buttons — wrap on small screens */}
                                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                        {isPaused ? (
                                            <button
                                                onClick={() => resumeDomain(d.id, d.daily_limit)}
                                                disabled={actionLoading === d.id + '_resume'}
                                                title="Resume sending"
                                                style={{ padding: '8px 14px', borderRadius: '8px', border: `1px solid ${t.green}`, background: t.greenSoft, color: t.green, fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: t.font }}
                                            >
                                                <Play style={{ width: '12px', height: '12px' }} />
                                                {actionLoading === d.id + '_resume' ? 'Resuming…' : 'Resume'}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => pauseDomain(d.id)}
                                                disabled={actionLoading === d.id + '_pause'}
                                                title="Pause sending (can resume later)"
                                                style={{ padding: '8px 14px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.cardInner, color: t.textSec, fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: t.font }}
                                            >
                                                <Pause style={{ width: '12px', height: '12px' }} />
                                                {actionLoading === d.id + '_pause' ? 'Pausing…' : 'Pause'}
                                            </button>
                                        )}
                                        {killConfirm === d.id ? (
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '12px', color: t.coral }}>Cancel all queued?</span>
                                                <button onClick={() => killDomain(d.id)} disabled={!!actionLoading} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.coral}`, background: 'rgba(239,68,68,0.08)', color: t.coral, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: t.font }}>
                                                    {actionLoading === d.id + '_kill' ? 'Killing…' : 'Yes, Kill'}
                                                </button>
                                                <button onClick={() => setKillConfirm(null)} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.cardInner, color: t.textMuted, fontSize: '12px', cursor: 'pointer', fontFamily: t.font }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setKillConfirm(d.id)}
                                                title="Kill all queued emails for this domain (permanent)"
                                                style={{ padding: '8px 14px', borderRadius: '8px', border: `1px solid rgba(239,68,68,0.25)`, background: 'rgba(239,68,68,0.04)', color: t.coral, fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: t.font }}
                                            >
                                                <Trash2 style={{ width: '12px', height: '12px' }} /> Kill Queue
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Metrics row */}
                                <div style={{ display: 'flex', gap: '24px', paddingTop: '12px', borderTop: `1px solid ${t.border}`, flexWrap: 'wrap', rowGap: '16px' }}>
                                    <div>
                                        <p style={lbl(t)}>Health</p>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
                                            <span style={{ fontSize: '20px', fontWeight: 700, color: d.health_score >= 80 ? t.green : d.health_score >= 50 ? t.amber : t.coral }}>{d.health_score}</span>
                                            <span style={{ fontSize: '12px', color: t.textMuted }}>/100</span>
                                        </div>
                                    </div>
                                    <div>
                                        <p style={lbl(t)}>Warmup Day</p>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
                                            <span style={{ fontSize: '20px', fontWeight: 700, color: t.text }}>{d.warmup_day}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <p style={lbl(t)}>Sent Today</p>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
                                            <span style={{ fontSize: '20px', fontWeight: 700, color: t.text }}>{d.emails_sent_today}</span>
                                            <span style={{ fontSize: '12px', color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }} onClick={() => handleEditLimit(d.id, d.daily_limit)} title="Click to edit limit">
                                                / {d.daily_limit}
                                                <span style={{ textDecoration: 'underline', color: t.accent }}>edit</span>
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: '100px' }}>
                                        <p style={lbl(t)}>Daily Progress</p>
                                        <div style={{ marginTop: '10px' }}>
                                            <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: t.cardInner, overflow: 'hidden' }}>
                                                <div style={{ width: `${Math.min(100, ((d.emails_sent_today || 0) / (d.daily_limit || 1)) * 100)}%`, height: '100%', background: t.accent, borderRadius: '3px', transition: 'width 0.3s' }} />
                                            </div>
                                            <p style={{ margin: '4px 0 0', fontSize: '11px', color: t.textMuted }}>
                                                {d.daily_limit - (d.emails_sent_today || 0)} slots remaining
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Region Selector Modal */}
            {editRegionModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ ...card(t), width: '400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: t.text }}>Select Target Region</h2>
                        <p style={{ margin: 0, fontSize: '13px', color: t.textMuted }}>Choose the region this domain is targeting. The system will automatically restrict email sending to 9 AM - 6 PM in that region's local time.</p>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {REGIONS.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => saveRegion(editRegionModal.id, r.start, r.end)}
                                    style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.cardInner, color: t.text, display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', textAlign: 'left', fontWeight: 600, transition: 'all 0.2s' }}
                                    onMouseOver={(e) => e.currentTarget.style.background = t.border}
                                    onMouseOut={(e) => e.currentTarget.style.background = t.cardInner}
                                >
                                    <span style={{ fontSize: '18px' }}>{r.flag}</span>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setEditRegionModal(null)} style={{ padding: '10px', background: 'transparent', color: t.textMuted, border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
