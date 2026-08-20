"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import { Plus, Send } from "lucide-react";

interface Campaign {
    id: string;
    name: string;
    status: string;
    sent_count: number;
    total_contacts: number;
    opened_count: number;
    bounced_count: number;
    created_at: string;
    domain_name?: string;
}

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', transition: 'all 250ms ease', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}

function StatusBadge({ status, t }: { status: string; t: Theme }) {
    const map: Record<string, { color: string; bg: string; label: string }> = {
        active: { color: t.green, bg: t.greenSoft, label: 'Active' },
        draft: { color: t.textMuted, bg: t.cardInner, label: 'Draft' },
        completed: { color: t.accent, bg: t.accentSoft, label: 'Completed' },
        paused: { color: t.amber, bg: t.amberSoft, label: 'Paused' },
        aborted: { color: t.coral, bg: t.coralSoft, label: 'Aborted' },
    };
    const s = map[status] || map.draft;
    return (
        <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', color: s.color, background: s.bg }}>
            {s.label}
        </span>
    );
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
    return <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0, animation: pulse ? 'pulse-dot 2s ease-in-out infinite' : 'none' }} />;
}

const responsiveStyles = `
  @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }

  .camp-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 12px;
  }
  .camp-card-grid {
    display: grid;
    grid-template-columns: 2fr 1.2fr 1fr 1fr 1fr;
    align-items: center;
    gap: 16px;
    padding: 20px 24px;
  }
  .camp-stat { display: block; }

  @media (max-width: 768px) {
    .camp-header h1 { font-size: 22px !important; }
    .camp-card-grid {
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 16px;
    }
    .camp-card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .camp-stats-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-top: 4px;
    }
    .camp-stat-box {
      padding: 10px 12px;
      border-radius: 10px;
    }
  }
  @media (min-width: 769px) {
    .camp-card-top { display: contents; }
    .camp-stats-row { display: contents; }
    .camp-stat-box { padding: 0; background: none !important; border: none !important; }
  }
`;

export default function CampaignsPage() {
    const { theme: t } = useTheme();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        async function load() {
            const { data } = await supabase
                .from('campaigns')
                .select(`id, name, status, sent_count, total_contacts, opened_count, bounced_count, created_at, domains(domain_name)`)
                .order('created_at', { ascending: false });

            if (!data) { setLoading(false); return; }

            const enriched = await Promise.all(data.map(async (c: any) => {
                let derivedStatus = c.status;
                if (c.status === 'active' && c.total_contacts > 0) {
                    const { count: queuedCount } = await supabase
                        .from('email_queue').select('id', { count: 'exact', head: true })
                        .eq('campaign_id', c.id).eq('status', 'queued');
                    if ((queuedCount ?? 0) === 0 && c.sent_count >= c.total_contacts) {
                        derivedStatus = 'completed';
                        supabase.from('campaigns').update({ status: 'completed' }).eq('id', c.id).then(() => { });
                    }
                }
                return { ...c, domain_name: c.domains?.domain_name || '', status: derivedStatus };
            }));

            setCampaigns(enriched);
            setLoading(false);
        }
        load();
        
        // Auto-refresh the campaigns list every 10 seconds to show real-time progress
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, []);

    const openRate = (c: Campaign) =>
        c.sent_count > 0 ? ((c.opened_count / c.sent_count) * 100).toFixed(1) : null;
    const bounceRate = (c: Campaign) =>
        c.sent_count > 0 ? ((c.bounced_count / c.sent_count) * 100).toFixed(1) : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font }}>
            <style>{responsiveStyles}</style>

            {/* Header */}
            <div className="camp-header">
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Campaigns</h1>
                    <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Manage and track your outreach campaigns</p>
                </div>
                <Link href="/dashboard/campaigns/new"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', background: t.accent, color: t.card, fontSize: '13px', fontWeight: 600, textDecoration: 'none', transition: 'opacity 150ms', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                    <Plus style={{ width: '15px', height: '15px' }} />
                    New Campaign
                </Link>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {['all', 'active', 'draft', 'paused', 'completed'].map((f) => {
                    const isActive = statusFilter === f;
                    return (
                        <button key={f} onClick={() => setStatusFilter(f)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '20px',
                                border: `1px solid ${isActive ? t.accent : t.border}`,
                                background: isActive ? t.accentSoft : t.cardInner,
                                color: isActive ? t.accent : t.textSec,
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                                whiteSpace: 'nowrap',
                                textTransform: 'capitalize'
                            }}
                        >
                            {f === 'active' && <Dot color={isActive ? t.accent : t.green} pulse={f === 'active'} />}{' '}
                            {f}
                        </button>
                    );
                })}
            </div>

            {/* Campaigns List */}
            {loading ? (
                <div style={{ ...card(t), padding: '80px', textAlign: 'center', color: t.textMuted }}>Loading…</div>
            ) : campaigns.length === 0 ? (
                <div style={{ ...card(t), padding: '80px', textAlign: 'center' }}>
                    <Send style={{ width: '40px', height: '40px', color: t.textMuted, margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>No campaigns yet</p>
                    <p style={{ fontSize: '14px', color: t.textMuted, margin: '0 0 24px' }}>Create your first campaign to start sending</p>
                    <Link href="/dashboard/campaigns/new"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', background: t.accent, color: '#fff', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                        <Plus style={{ width: '14px', height: '14px' }} /> New Campaign
                    </Link>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter).length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>
                            No {statusFilter !== 'all' ? statusFilter : ''} campaigns found.
                        </div>
                    ) : (
                        campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter).map((c) => {
                            const or = openRate(c);
                            const br = bounceRate(c);
                        const pct = c.total_contacts > 0 ? Math.min((c.sent_count / c.total_contacts) * 100, 100) : 0;
                        return (
                            <Link key={c.id} href={`/dashboard/campaigns/${c.id}`} style={{ textDecoration: 'none' }}>
                                <div style={{ ...card(t), overflow: 'hidden', cursor: 'pointer' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = t.cardHover)}
                                    onMouseLeave={e => (e.currentTarget.style.background = t.card)}
                                >
                                    <div className="camp-card-grid">
                                        {/* Name + Status (top row on mobile) */}
                                        <div className="camp-card-top">
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                                    {c.status === 'active' && <Dot color={t.green} pulse />}
                                                    <p style={{ fontSize: '14px', fontWeight: 600, color: t.text, margin: 0 }}>{c.name}</p>
                                                </div>
                                                <p style={{ fontSize: '12px', color: t.textMuted, margin: 0 }}>{c.domain_name}</p>
                                            </div>
                                            <StatusBadge status={c.status} t={t} />
                                        </div>

                                        {/* Stats row (grid on mobile, inline on desktop) */}
                                        <div className="camp-stats-row">
                                            {/* Progress */}
                                            <div className="camp-stat-box" style={{ background: t.cardInner, border: `1px solid ${t.borderLight}` }}>
                                                <p style={{ ...lbl(t), marginBottom: '6px' }}>Progress</p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <div style={{ height: '4px', background: t.borderLight, borderRadius: '4px' }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: c.status === 'completed' ? t.green : t.accent, borderRadius: '4px' }} />
                                                    </div>
                                                    <span style={{ fontSize: '12px', fontFamily: "'JetBrains Mono',monospace", color: t.textMuted }}>{c.sent_count}/{c.total_contacts}</span>
                                                </div>
                                            </div>
                                            {/* Open rate */}
                                            <div className="camp-stat-box" style={{ background: t.cardInner, border: `1px solid ${t.borderLight}` }}>
                                                <p style={{ ...lbl(t), margin: 0 }}>Opened</p>
                                                <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 700, color: t.text, fontFamily: "'JetBrains Mono',monospace" }}>{or ? `${or}%` : '—'}</p>
                                            </div>
                                            {/* Bounce rate */}
                                            <div className="camp-stat-box" style={{ background: t.cardInner, border: `1px solid ${t.borderLight}` }}>
                                                <p style={{ ...lbl(t), margin: 0 }}>Bounce</p>
                                                <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: !br ? t.textMuted : parseFloat(br) < 2 ? t.green : t.amber }}>{br ? `${br}%` : '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })
                    )}
                </div>
            )}
        </div>
    );
}

