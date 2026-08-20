"use client";

import { useEffect, useState } from "react";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import { BarChart3, MailOpen, MousePointerClick, ShieldAlert, Send } from "lucide-react";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}

export default function AnalyticsPage() {
    const { theme: t } = useTheme();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        const { data } = await supabase.from('dashboard_stats').select('*').single();
        setStats(data || null);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    const metrics = [
        { label: 'Total Sent', value: stats?.total_sent || 0, icon: Send, color: t.text, bg: t.cardInner },
        { label: 'Total Opened', value: stats?.total_opened || 0, icon: MailOpen, color: t.accent, bg: t.accentSoft },
        { label: 'Total Clicked', value: stats?.total_clicked || 0, icon: MousePointerClick, color: t.green, bg: t.greenSoft },
        { label: 'Total Bounced', value: stats?.total_bounced || 0, icon: ShieldAlert, color: t.coral, bg: t.coralSoft },
    ];

    const openRate = stats?.total_sent ? Math.round((stats.total_opened / stats.total_sent) * 100) : 0;
    const clickRate = stats?.total_sent ? Math.round((stats.total_clicked / stats.total_sent) * 100) : 0;
    const bounceRate = stats?.total_sent ? Math.round((stats.total_bounced / stats.total_sent) * 100) : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '1000px' }}>
            <div>
                <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Analytics</h1>
                <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Overall event metrics tracked across all campaigns.</p>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>Loading analytics…</div>
            ) : (
                <>
                    {/* Top Stats Grid — responsive */}
                    <div className="analytics-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        {metrics.map(m => {
                            const Icon = m.icon;
                            return (
                                <div key={m.label} style={{ ...card(t), padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Icon style={{ width: '18px', height: '18px', color: m.color }} />
                                        </div>
                                        <p style={{ margin: 0, ...lbl(t) }}>{m.label}</p>
                                    </div>
                                    <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: t.text, letterSpacing: '-0.03em', fontFamily: "'JetBrains Mono', monospace" }}>
                                        {m.value.toLocaleString()}
                                    </h2>
                                </div>
                            );
                        })}
                    </div>

                    {/* Rates Section */}
                    <div style={{ ...card(t), marginTop: '8px' }}>
                        <h3 style={{ margin: '0 0 24px', fontSize: '16px', fontWeight: 600, color: t.text }}>Conversion Rates</h3>
                        <div className="analytics-rates">
                            {[
                                { label: 'Open Rate', value: openRate, color: t.accent },
                                { label: 'Click Rate', value: clickRate, color: t.green },
                                { label: 'Bounce Rate', value: bounceRate, color: bounceRate > 5 ? t.coral : t.amber },
                            ].map(r => (
                                <div key={r.label}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 500, color: t.textSec }}>{r.label}</span>
                                        <span style={{ fontSize: '15px', fontWeight: 700, color: t.text, fontFamily: "'JetBrains Mono', monospace" }}>{r.value}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '10px', background: t.cardInner, borderRadius: '5px', overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(r.value, 100)}%`, height: '100%', background: r.color, borderRadius: '5px', transition: 'width 0.9s ease-out' }} />
                                    </div>
                                    {r.label === 'Bounce Rate' && r.value > 5 && (
                                        <p style={{ margin: '6px 0 0', fontSize: '11px', color: t.coral, fontWeight: 600 }}>⚠ High bounce rate — check your lists</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
            <style>{`
                .analytics-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
                .analytics-rates { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; }
                @media (max-width: 900px) {
                    .analytics-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
                }
                @media (max-width: 640px) {
                    .analytics-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
                    .analytics-rates { grid-template-columns: 1fr; gap: 20px; }
                }
                @media (max-width: 400px) {
                    .analytics-stats-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    );
}
