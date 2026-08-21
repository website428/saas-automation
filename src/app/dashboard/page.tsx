"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Send, Clock, Mail, AlertTriangle, Calendar, ArrowUpRight, Activity, Globe, RefreshCw, Rocket } from "lucide-react";
import { useTheme, Theme } from "@/components/theme-provider";
import {
    fetchDashboardStats, fetchDomainHealth, fetchCampaigns, fetchLiveQueue,
    formatQueueTime, calcCampaignOpenRate, calcCampaignBounceRate,
    DashboardStats, DomainHealth, CampaignRow, QueueItem,
} from "@/lib/data";

/* ─── Base components ─────────────────────────────────────── */

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
    return <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0, animation: pulse ? 'pulse-dot 2s ease-in-out infinite' : 'none' }} />;
}

function Badge({ value, color, bg }: { value: string | number; color: string; bg: string }) {
    return <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, padding: '3px 9px', borderRadius: '8px', color, background: bg }}>{value}</span>;
}

function Progress({ value, max, color, track }: { value: number; max: number; color: string; track: string }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div style={{ height: '4px', background: track, borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
    );
}

function Skeleton({ w = '100%', h = '16px', r = '6px' }: { w?: string; h?: string; r?: string }) {
    return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg, rgba(128,128,128,0.06) 25%, rgba(128,128,128,0.12) 50%, rgba(128,128,128,0.06) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />;
}

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '22px', transition: 'all 250ms ease', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}

function getStatusMeta(status: string, t: Theme) {
    return ({
        active: { dot: t.green, text: t.green, label: 'Active' },
        draft: { dot: t.textMuted, text: t.textMuted, label: 'Draft' },
        completed: { dot: t.accent, text: t.accent, label: 'Completed' },
        paused: { dot: t.amber, text: t.amber, label: 'Paused' },
        aborted: { dot: t.coral, text: t.coral, label: 'Aborted' },
        queued: { dot: t.textMuted, text: t.textMuted, label: 'Queued' },
        sending: { dot: t.amber, text: t.amber, label: 'Sending' },
        sent: { dot: '#60a5fa', text: '#60a5fa', label: 'Sent' },
        delivered: { dot: t.green, text: t.green, label: 'Delivered' },
        opened: { dot: '#818cf8', text: '#818cf8', label: 'Opened' },
        clicked: { dot: '#c084fc', text: '#c084fc', label: 'Clicked' },
        bounced: { dot: t.coral, text: t.coral, label: 'Bounced' },
        complained: { dot: '#f43f5e', text: '#f43f5e', label: 'Complained' },
        failed: { dot: t.coral, text: t.coral, label: 'Failed' },
        cancelled: { dot: t.textMuted, text: t.textMuted, label: 'Cancelled' },
    } as any)[status] || { dot: t.textMuted, text: t.textMuted, label: status };
}

/* ─── Responsive style helpers ─────────────────────────────── */
const responsiveStyles = `
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  
  .stat-grid  { display: grid; grid-template-columns: repeat(6,1fr); gap: 14px; }
  .dash-grid  { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; }
  
  @media (max-width: 1280px) {
    .stat-grid { grid-template-columns: repeat(3,1fr); }
  }
  @media (max-width: 900px) {
    .stat-grid { grid-template-columns: repeat(2,1fr); }
    .dash-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 480px) {
    .stat-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .dash-grid { gap: 16px; }
    .domain-grid { grid-template-columns: 1fr 1fr !important; }
    .dash-header { flex-direction: column; align-items: flex-start !important; gap: 12px; }
    .stat-num { font-size: 20px !important; }
    .hide-mobile { display: none !important; }
    .show-mobile-only { display: block !important; }
    table.campaign-table thead th:nth-child(4),
    table.campaign-table tbody td:nth-child(4),
    table.campaign-table thead th:nth-child(5),
    table.campaign-table tbody td:nth-child(5) { display: none; }
  }
`;

/* ─── Page ───────────────────────────────────────────────── */

export default function DashboardPage() {
    const { theme: t } = useTheme();

    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [domains, setDomains] = useState<DomainHealth[]>([]);
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    async function loadAll() {
        setLoading(true);
        const [s, d, c, q] = await Promise.all([
            fetchDashboardStats(),
            fetchDomainHealth(),
            fetchCampaigns(),
            fetchLiveQueue(),
        ]);
        setStats(s);
        setDomains(d);
        setCampaigns(c);
        setQueue(q);
        setLastRefresh(new Date());
        setLoading(false);
    }

    useEffect(() => {
        loadAll();
        // Auto-refresh every 30s
        const interval = setInterval(loadAll, 30000);
        return () => clearInterval(interval);
    }, []);

    const statCards = [
        { label: "Total Contacts", value: stats?.total_contacts, icon: Users },
        { label: "Emails Sent", value: stats?.total_sent, icon: Send, sub: stats ? `${stats.total_sent > 0 ? '+' : ''}0 today` : null, dotKey: 'blue' as const },
        { label: "Pending", value: stats?.total_pending, icon: Clock },
        { label: "Opened", value: stats?.total_opened, icon: Mail, sub: stats ? `${stats.open_rate}% rate` : null, dotKey: 'green' as const },
        { label: "Bounced", value: stats?.total_bounced, icon: AlertTriangle, sub: stats ? `${stats.bounce_rate}%` : null, dotKey: stats && stats.bounce_rate < 2 ? 'green' as const : 'amber' as const },
        { label: "Active Campaigns", value: stats?.active_campaigns, icon: Calendar },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', fontFamily: t.font }}>
            <style>{responsiveStyles}</style>

            {/* ── Header ─────────────────────────────────── */}
            <div className="dash-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0, lineHeight: 1.2 }}>Dashboard</h1>
                    <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>
                        Last updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={loadAll} disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.card, color: t.textSec, fontSize: '12px', fontWeight: 500, cursor: loading ? 'default' : 'pointer', fontFamily: t.font, opacity: loading ? 0.6 : 1 }}>
                        <RefreshCw style={{ width: '13px', height: '13px', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        <span className="hide-mobile">Refresh</span>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '10px', background: t.greenSoft, border: `1px solid ${t.greenBorder}` }}>
                        <Dot color={t.green} pulse />
                        <span style={{ fontSize: '12px', fontWeight: 500, color: t.green }}>System Active</span>
                    </div>
                </div>
            </div>

            <Link href="/dashboard/setup" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, padding: '18px 20px', borderRadius: 14, background: t.accentSoft, border: `1px solid ${t.accentBorder}`, textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: t.accent, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Rocket size={18} color="#fff" /></div>
                    <div><div style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>New here? Complete Setup & Launch</div><div style={{ color: t.textSec, fontSize: 12, marginTop: 3 }}>Follow the guided checklist and verify your real Vercel, Supabase, Resend and Meta setup.</div></div>
                </div>
                <ArrowUpRight size={18} color={t.accent} style={{ flexShrink: 0 }} />
            </Link>

            {/* ── Stat Cards ─────────────────────────────── */}
            <div className="stat-grid">
                {statCards.map((s) => {
                    const Icon = s.icon;
                    const dotColor = s.dotKey ? t[s.dotKey] : undefined;
                    return (
                        <div key={s.label} style={card(t)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <span style={lbl(t)}>{s.label}</span>
                                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: t.cardInner, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon style={{ width: '14px', height: '14px', color: t.textMuted }} />
                                </div>
                            </div>
                            {loading ? (
                                <Skeleton h="30px" r="6px" />
                            ) : (
                                <div className="stat-num" style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, lineHeight: 1 }}>
                                    {typeof s.value === 'number' ? s.value.toLocaleString('en-IN') : '—'}
                                </div>
                            )}
                            {s.sub && !loading && (
                                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {dotColor && <Dot color={dotColor} />}
                                    <span style={{ fontSize: '12px', color: t.textMuted, fontWeight: 500 }}>{s.sub}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Domain Health ──────────────────────────── */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: 0 }}>Domain Health</h2>
                    <Badge value={`${domains.length} domain${domains.length !== 1 ? 's' : ''}`} color={t.textMuted} bg={t.cardInner} />
                </div>

                {loading ? (
                    <div style={card(t)}><Skeleton h="120px" /></div>
                ) : domains.length === 0 ? (
                    <div style={{ ...card(t), textAlign: 'center', padding: '48px', color: t.textMuted }}>
                        <Globe style={{ width: '32px', height: '32px', margin: '0 auto 12px', opacity: 0.4 }} />
                        <p style={{ fontSize: '14px' }}>No domains configured yet</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {domains.map((d) => {
                            const healthColor = d.health_score >= 90 ? t.green : d.health_score >= 70 ? t.amber : t.coral;
                            const healthBg = d.health_score >= 90 ? t.greenSoft : d.health_score >= 70 ? t.amberSoft : t.coralSoft;
                            const bounceColor = d.bounce_rate < 2 ? t.green : d.bounce_rate < 5 ? t.amber : t.coral;
                            const progress = Math.min(d.warmup_day / 30, 1);

                            return (
                                <div key={d.id} style={{ ...card(t), padding: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: t.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Globe style={{ width: '18px', height: '18px', color: t.accent }} />
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: 0 }}>{d.domain_name}</p>
                                                <p style={{ fontSize: '12px', color: t.textMuted, margin: '2px 0 0' }}>
                                                    {d.from_email} · Day {d.warmup_day}/30
                                                </p>
                                            </div>
                                        </div>
                                        <Badge value={d.health_score} color={healthColor} bg={healthBg} />
                                    </div>
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '12px', color: t.textSec, fontWeight: 500 }}>Warmup Progress</span>
                                            <span style={{ fontSize: '12px', fontFamily: t.mono, color: t.textMuted }}>{Math.round(progress * 100)}%</span>
                                        </div>
                                        <Progress value={d.warmup_day} max={30} color={t.accent} track={t.borderLight} />
                                    </div>
                                    <div className="domain-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
                                        {[
                                            { label: 'Daily Limit', val: d.daily_limit, color: t.text },
                                            { label: 'Sent Today', val: `${d.emails_sent_today}/${d.daily_limit}`, color: t.text },
                                            { label: 'Bounce Rate', val: `${d.bounce_rate}%`, color: bounceColor },
                                            { label: 'Status', val: d.status.charAt(0).toUpperCase() + d.status.slice(1), color: d.status === 'warm' ? t.green : d.status === 'warming' ? t.amber : t.coral },
                                        ].map((m) => (
                                            <div key={m.label} style={{ padding: '12px', borderRadius: '10px', background: t.cardInner }}>
                                                <p style={{ ...lbl(t), marginBottom: '6px' }}>{m.label}</p>
                                                <p style={{ fontSize: '17px', fontWeight: 700, color: m.color, letterSpacing: '-0.02em', margin: 0, fontFamily: String(m.val).includes('%') ? t.mono : t.font }}>
                                                    {m.val}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Campaigns + Queue ──────────────────────── */}
            <div className="dash-grid">

                {/* Campaigns */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: 0 }}>Campaigns</h2>
                        <Link href="/dashboard/campaigns" style={{ fontSize: '13px', fontWeight: 500, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: t.font, textDecoration: 'none' }}>
                            View all <ArrowUpRight style={{ width: '13px', height: '13px' }} />
                        </Link>
                    </div>
                    <div style={{ ...card(t), padding: 0, overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {[1, 2, 3].map(i => <Skeleton key={i} h="40px" />)}
                            </div>
                        ) : campaigns.length === 0 ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: t.textMuted }}>
                                <Send style={{ width: '28px', height: '28px', margin: '0 auto 12px', opacity: 0.4 }} />
                                <p style={{ fontSize: '14px' }}>No campaigns yet</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="campaign-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                                            {['Status', 'Campaign', 'Progress', 'Opened', 'Bounce'].map(h => (
                                                <th key={h} style={{ ...lbl(t), textAlign: 'left', padding: '12px 20px', background: t.tableHeaderBg, whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {campaigns.map((c, i) => {
                                            const s = getStatusMeta(c.status, t);
                                            const openRate = calcCampaignOpenRate(c.sent_count, c.opened_count);
                                            const bounceRate = calcCampaignBounceRate(c.sent_count, c.bounced_count);
                                            return (
                                                <tr key={c.id}
                                                    style={{ borderBottom: i < campaigns.length - 1 ? `1px solid ${t.borderLight}` : 'none', cursor: 'pointer', transition: 'background 150ms' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = t.cardHover)}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <td style={{ padding: '13px 20px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                                            <Dot color={s.dot} pulse={c.status === 'active'} />
                                                            <span style={{ fontSize: '12px', color: s.text, fontWeight: 500 }}>{s.label}</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '13px 20px' }}>
                                                        <p style={{ fontSize: '13px', fontWeight: 600, color: t.text, margin: 0 }}>{c.name}</p>
                                                        <p style={{ fontSize: '11px', color: t.textMuted, marginTop: '2px' }}>{c.domain_name}</p>
                                                    </td>
                                                    <td style={{ padding: '13px 20px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{ width: '56px' }}>
                                                                <Progress value={c.sent_count} max={c.total_contacts || 1} color={c.status === 'completed' ? t.green : t.accent} track={t.borderLight} />
                                                            </div>
                                                            <span style={{ fontSize: '12px', fontFamily: t.mono, color: t.textMuted, whiteSpace: 'nowrap' }}>
                                                                {c.sent_count}/{c.total_contacts >= 1000 ? `${(c.total_contacts / 1000).toFixed(0)}K` : c.total_contacts}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '13px 20px' }}>
                                                        <span style={{ fontSize: '13px', fontFamily: t.mono, color: openRate > 0 ? t.textSec : t.textMuted }}>
                                                            {openRate > 0 ? `${openRate}%` : '—'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '13px 20px' }}>
                                                        <span style={{ fontSize: '13px', fontFamily: t.mono, color: bounceRate === 0 ? t.textMuted : bounceRate < 2 ? t.green : t.amber }}>
                                                            {bounceRate > 0 ? `${bounceRate}%` : '—'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Live Queue */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity style={{ width: '15px', height: '15px', color: t.accent }} />
                            Live Queue
                        </h2>
                        {stats && (
                            <span style={{ fontSize: '12px', fontFamily: t.mono, color: t.textMuted }}>
                                {stats.total_pending.toLocaleString('en-IN')} remaining
                            </span>
                        )}
                    </div>
                    <div style={{ ...card(t), padding: 0 }}>
                        {loading ? (
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {[1, 2, 3].map(i => <Skeleton key={i} h="44px" />)}
                            </div>
                        ) : queue.length === 0 ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: t.textMuted }}>
                                <Activity style={{ width: '28px', height: '28px', margin: '0 auto 12px', opacity: 0.4 }} />
                                <p style={{ fontSize: '14px' }}>Queue is empty</p>
                            </div>
                        ) : (
                            queue.map((item, i) => {
                                const s = getStatusMeta(item.status, t);
                                return (
                                    <div key={item.id}
                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 20px', borderBottom: i < queue.length - 1 ? `1px solid ${t.borderLight}` : 'none', transition: 'background 150ms' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = t.cardHover)}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <Dot color={s.dot} pulse={item.status === 'sending' || item.status === 'sent'} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: '13px', color: t.text, margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.contact_email}
                                            </p>
                                            <p style={{ fontSize: '11px', color: t.textMuted, marginTop: '2px' }}>
                                                {item.domain_name} · Step {item.sequence_step}
                                            </p>
                                        </div>
                                        <span style={{ fontSize: '12px', color: t.textMuted, whiteSpace: 'nowrap', fontWeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                            <span>{new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                            <span style={{ fontSize: '11px', color: t.textSec }}>({formatQueueTime(item.scheduled_at)})</span>
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Spin animation for refresh button */}
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
