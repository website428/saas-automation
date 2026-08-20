"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import { formatQueueTime } from "@/lib/data";
import { ArrowLeft, Send, Clock, CheckCircle, AlertTriangle, RefreshCw, Trash2, Mail, Eye, MousePointerClick, XCircle } from "lucide-react";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}

function StatusBadge({ status, t }: { status: string; t: Theme }) {
    const map: Record<string, { color: string; bg: string; label: string }> = {
        active: { color: t.green, bg: t.greenSoft, label: '● Active' },
        draft: { color: t.textMuted, bg: t.cardInner, label: 'Draft' },
        completed: { color: t.accent, bg: t.accentSoft, label: '✓ Completed' },
        paused: { color: t.amber, bg: t.amberSoft, label: '⏸ Paused' },
        aborted: { color: t.coral, bg: t.coralSoft, label: '✕ Aborted' },
    };
    const s = map[status] || map.draft;
    return (
        <span style={{ fontSize: '12px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', color: s.color, background: s.bg }}>
            {s.label}
        </span>
    );
}

function QueueRow({ item, t }: { item: any; t: Theme }) {
    const statusMap: Record<string, { color: string; icon: any; label: string }> = {
        queued: { color: t.textMuted, icon: Clock, label: 'Queued' },
        sending: { color: t.amber, icon: RefreshCw, label: 'Sending' },
        sent: { color: '#60a5fa', icon: Mail, label: 'Sent' },
        delivered: { color: t.green, icon: CheckCircle, label: 'Delivered' },
        opened: { color: '#818cf8', icon: Eye, label: 'Opened' },
        clicked: { color: '#c084fc', icon: MousePointerClick, label: 'Clicked' },
        bounced: { color: t.coral, icon: XCircle, label: 'Bounced' },
        complained: { color: '#f43f5e', icon: AlertTriangle, label: 'Complained' },
        failed: { color: t.coral, icon: XCircle, label: 'Failed' },
        cancelled: { color: t.textMuted, icon: Clock, label: 'Cancelled' },
    };
    const status = statusMap[item.status] || statusMap.queued;
    const StatusIcon = status.icon;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', alignItems: 'center', gap: '12px', padding: '14px 0', borderBottom: `1px solid ${t.borderLight}` }}>
            <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: t.text }}>{item.contacts?.name || '—'}</p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: t.textMuted }}>{item.contacts?.email}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <StatusIcon style={{ width: '13px', height: '13px', color: status.color }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: status.color }}>{status.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: t.textSec, fontFamily: 'monospace' }}>
                {item.sent_at
                    ? new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
                    : item.scheduled_at
                        ? (
                            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span>Scheduled for {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                <span style={{ fontSize: '11px', color: t.textMuted }}>({formatQueueTime(item.scheduled_at)})</span>
                            </span>
                        )
                        : '—'}
            </p>
            <div>
                <p style={{ margin: 0, fontSize: '12px', color: item.error_message ? t.coral : t.textMuted }}>
                    {item.error_message ? item.error_message.slice(0, 40) + '...' : item.resend_id ? '✓ Delivered' : '—'}
                </p>
                {(item.status === 'opened' || item.status === 'clicked') && item.opened_at && (
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#818cf8' }}>
                        👁 Opened {new Date(item.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                )}
            </div>
        </div>
    );
}

export default function CampaignDetailPage() {
    const { theme: t } = useTheme();
    const params = useParams();
    const router = useRouter();
    const campaignId = params.id as string;

    const [campaign, setCampaign] = useState<any>(null);
    const [queue, setQueue] = useState<any[]>([]);
    const [recentOpens, setRecentOpens] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [autoSending, setAutoSending] = useState(false);
    const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0 });
    const [refreshing, setRefreshing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const autoSendRef = useRef(false);

    async function load() {
        const [campRes, queueRes, opensRes] = await Promise.all([
            supabase.from('campaigns').select('*, domains(domain_name, from_email, daily_limit)').eq('id', campaignId).single(),
            supabase.from('email_queue').select('*, contacts(name, email)').eq('campaign_id', campaignId).order('scheduled_at', { ascending: true }),
            supabase.from('email_opens').select('opened_at, contacts(name, email)').eq('campaign_id', campaignId).order('opened_at', { ascending: false }).limit(50),
        ]);
        if (campRes.data) setCampaign(campRes.data);
        if (queueRes.data) setQueue(queueRes.data);
        if (opensRes.data) setRecentOpens(opensRes.data);
        setLoading(false);
    }

    useEffect(() => { load(); }, [campaignId]);

    // Auto-refresh polling every 5 seconds for near real-time updates
    useEffect(() => {
        if (campaign?.status === 'completed' || campaign?.status === 'aborted' || campaign?.status === 'paused') return;

        const interval = setInterval(() => {
            if (!refreshing && !sending && !deleting) {
                load();
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [campaignId, campaign?.status, refreshing, sending, deleting]);

    async function handleSend() {
        setSending(true);
        autoSendRef.current = true;
        try {
            // Ensure campaign is active
            await supabase.from('campaigns').update({ status: 'active' }).eq('id', campaignId);

            // Mark all queued as due now
            await supabase
                .from('email_queue')
                .update({ scheduled_at: new Date().toISOString() })
                .eq('campaign_id', campaignId)
                .eq('status', 'queued');

            // Loop through ALL batches (50 at a time) until none remain
            let totalSent = 0;
            let batchesLeft = true;
            while (batchesLeft) {
                const res = await fetch('/api/send-emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ campaignId, force: true }),
                });
                const result = await res.json();
                if (!res.ok) { console.error('Send error:', result); break; }
                totalSent += result.sent || 0;
                console.log(`Batch done: sent ${result.sent}, remaining: ${result.remaining}`);
                await load();
                if (!result.remaining || result.remaining === 0 || result.sent === 0) {
                    batchesLeft = false;
                } else {
                    // Small pause between batches
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
            console.log(`All done. Total sent: ${totalSent}`);
        } catch (e) {
            console.error('Send error:', e);
        }
        autoSendRef.current = false;
        setSending(false);
        await load();
    }

    async function handleRefresh() {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }

    async function handleDelete() {
        setDeleting(true);
        try {
            // Campaigns have ON DELETE CASCADE for email_queue and send_logs
            await supabase.from('campaigns').delete().eq('id', campaignId);
            router.push('/dashboard/campaigns');
        } catch (e) {
            console.error('Delete error:', e);
            alert('Failed to delete campaign. Please try again.');
            setDeleting(false);
            setConfirmDelete(false);
        }
    }

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', fontFamily: t.font, color: t.textMuted }}>
            Loading campaign…
        </div>
    );

    if (!campaign) return (
        <div style={{ textAlign: 'center', padding: '80px', fontFamily: t.font }}>
            <p style={{ color: t.coral }}>Campaign not found.</p>
            <Link href="/dashboard/campaigns" style={{ color: t.accent }}>← Back</Link>
        </div>
    );

    const pct = campaign.total_contacts > 0 ? Math.min((campaign.sent_count / campaign.total_contacts) * 100, 100) : 0;
    const openRate = campaign.sent_count > 0 ? ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1) : null;
    const bounceRate = campaign.sent_count > 0 ? ((campaign.bounced_count / campaign.sent_count) * 100).toFixed(1) : null;

    const queued = queue.filter(q => q.status === 'queued').length;
    const sent = queue.filter(q => q.status === 'sent').length;
    const failed = queue.filter(q => q.status === 'failed').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: t.font, maxWidth: '900px' }}>

            {/* Header */}
            <div>
                <Link href="/dashboard/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: t.textMuted, textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}>
                    <ArrowLeft style={{ width: '14px', height: '14px' }} /> All Campaigns
                </Link>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>{campaign.name}</h1>
                            <StatusBadge status={campaign.status} t={t} />
                        </div>
                        <p style={{ marginTop: '6px', fontSize: '13px', color: t.textMuted }}>
                            {campaign.domains?.domain_name} · Subject: <em>"{campaign.subject_a}"</em>
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
                        <button onClick={handleRefresh} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: `1px solid ${t.border}`, background: 'none', cursor: 'pointer', fontSize: '13px', color: t.textSec, fontFamily: t.font }}>
                            <RefreshCw style={{ width: '13px', height: '13px', animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                            Refresh
                        </button>
                        {(campaign.status === 'active' || campaign.status === 'draft') && queued > 0 && (
                            <button onClick={handleSend} disabled={sending} title="Warning: This will immediately send all queued emails, ignoring your daily limits and scheduled delays." style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: t.accent, color: '#fff', border: 'none', cursor: sending ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: t.font }}>
                                <Send style={{ width: '13px', height: '13px' }} />
                                {sending ? 'Sending…' : `Force Send All (${queued})`}
                            </button>
                        )}
                        {campaign.status === 'paused' && (
                            <button onClick={async () => {
                                setSending(true);
                                await supabase.from('campaigns').update({ status: 'active' }).eq('id', campaignId);
                                await load();
                                setSending(false);
                            }} disabled={sending || deleting} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: t.green, color: '#fff', border: 'none', cursor: sending || deleting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: t.font }}>
                                <RefreshCw style={{ width: '13px', height: '13px', animation: sending ? 'spin 1s linear infinite' : 'none' }} />
                                {sending ? 'Resuming…' : 'Resume Campaign'}
                            </button>
                        )}
                        {campaign.status === 'active' && (
                            <button onClick={async () => {
                                setSending(true);
                                await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaignId);
                                await load();
                                setSending(false);
                            }} disabled={sending || deleting} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: t.amber, color: '#fff', border: 'none', cursor: sending || deleting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: t.font }}>
                                <AlertTriangle style={{ width: '13px', height: '13px' }} />
                                {sending ? 'Pausing…' : 'Pause Campaign'}
                            </button>
                        )}
                        {/* Delete — two-step confirm */}
                        {!confirmDelete ? (
                            <button onClick={() => setConfirmDelete(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: `1px solid ${t.coral}`, background: 'none', cursor: 'pointer', fontSize: '13px', color: t.coral, fontFamily: t.font }}>
                                <Trash2 style={{ width: '13px', height: '13px' }} />
                                Delete
                            </button>
                        ) : (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 12px', borderRadius: '10px', background: t.coralSoft, border: `1px solid ${t.coral}` }}>
                                <span style={{ fontSize: '12px', color: t.coral, fontWeight: 600 }}>Are you sure?</span>
                                <button onClick={handleDelete} disabled={deleting}
                                    style={{ padding: '4px 12px', borderRadius: '8px', background: t.coral, color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: t.font }}>
                                    {deleting ? 'Deleting…' : 'Yes, delete'}
                                </button>
                                <button onClick={() => setConfirmDelete(false)}
                                    style={{ padding: '4px 10px', borderRadius: '8px', background: 'none', border: `1px solid ${t.border}`, color: t.textSec, fontSize: '12px', cursor: 'pointer', fontFamily: t.font }}>
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats row — responsive grid */}
            <div className="camp-detail-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                {[
                    { label: 'Total', value: campaign.total_contacts, color: t.text },
                    { label: 'Sent', value: sent, color: t.green },
                    { label: 'Queued', value: queued, color: t.amber },
                    {
                        label: 'Opened',
                        value: campaign.opened_count || 0,
                        color: '#818cf8',
                        sub: openRate ? `${openRate}% rate` : null,
                    },
                    { label: 'Failed', value: failed, color: failed > 0 ? t.coral : t.textMuted },
                ].map(s => (
                    <div key={s.label} style={card(t)}>
                        <p style={lbl(t)}>{s.label}</p>
                        <p style={{ margin: '8px 0 0', fontSize: '26px', fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</p>
                        {(s as any).sub && (
                            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#818cf8', fontWeight: 600 }}>{(s as any).sub}</p>
                        )}
                    </div>
                ))}
            </div>

            {/* Progress bar */}
            <div style={card(t)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ ...lbl(t), display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Send Progress
                        {campaign.status === 'active' && queued > 0 && (
                            <span style={{ color: t.accent, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'none', letterSpacing: 'normal' }}>
                                <RefreshCw style={{ width: '10px', height: '10px', animation: 'spin 2s linear infinite' }} />
                                Processing in background...
                            </span>
                        )}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: t.text, fontFamily: 'monospace' }}>{sent}/{campaign.total_contacts} ({pct.toFixed(0)}%)</span>
                </div>
                <div style={{ height: '8px', background: t.borderLight, borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: campaign.status === 'completed' ? t.green : (autoSending ? t.accent : '#60a5fa'), borderRadius: '6px', transition: 'width 600ms ease' }} />
                </div>
                {campaign.completed_at && (
                    <p style={{ margin: '8px 0 0', fontSize: '12px', color: t.textMuted }}>
                        ✓ Completed {new Date(campaign.completed_at).toLocaleString()}
                    </p>
                )}
            </div>

            {/* Recent Opens Feed */}
            {recentOpens.length > 0 && (
                <div style={card(t)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: t.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Eye style={{ width: '15px', height: '15px', color: '#818cf8' }} />
                            Recent Opens
                        </h3>
                        <span style={{ fontSize: '12px', color: t.textMuted }}>{recentOpens.length} open event{recentOpens.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {recentOpens.map((o, i) => {
                            const name = (o.contacts as any)?.name || (o.contacts as any)?.email || 'Unknown';
                            const email = (o.contacts as any)?.email || '';
                            const when = new Date(o.opened_at);
                            const diffMin = Math.floor((Date.now() - when.getTime()) / 60000);
                            const timeAgo = diffMin < 1 ? 'just now'
                                : diffMin < 60 ? `${diffMin}m ago`
                                : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h ago`
                                : when.toLocaleDateString([], { month: 'short', day: 'numeric' });
                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < recentOpens.length - 1 ? `1px solid ${t.borderLight}` : 'none' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#818cf820', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8' }}>{name[0]?.toUpperCase() || '?'}</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: t.text }}>{name}</p>
                                        <p style={{ margin: '1px 0 0', fontSize: '11px', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</p>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#818cf8', fontWeight: 600 }}>👁 Opened</p>
                                        <p style={{ margin: '1px 0 0', fontSize: '11px', color: t.textMuted }}>{timeAgo}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Email queue — overflow-x scrollable on mobile */}
            <div style={card(t)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: t.text }}>Email Queue</h3>
                    <span style={{ fontSize: '12px', color: t.textMuted }}>{queue.length} contacts</span>
                </div>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                    <div style={{ minWidth: '600px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px', paddingBottom: '10px', borderBottom: `1px solid ${t.border}` }}>
                            {['Contact', 'Status', 'Sent At', 'Result'].map(h => (
                                <span key={h} style={lbl(t)}>{h}</span>
                            ))}
                        </div>
                        {queue.length === 0 ? (
                            <p style={{ textAlign: 'center', color: t.textMuted, padding: '24px', fontSize: '14px' }}>No emails queued</p>
                        ) : (
                            queue.map(item => <QueueRow key={item.id} item={item} t={t} />)
                        )}
                    </div>
                </div>
            </div>

            {/* Email preview */}
            <div style={card(t)}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: t.text }}>Email Content</h3>
                <div style={{ marginBottom: '10px' }}>
                    <p style={lbl(t)}>Subject</p>
                    <p style={{ margin: '6px 0 0', fontSize: '14px', color: t.text }}>{campaign.subject_a}</p>
                </div>
                <div>
                    <p style={lbl(t)}>Body</p>
                    {campaign.body_html?.startsWith('<!DOCTYPE') || campaign.body_html?.startsWith('<html') ? (
                        <iframe srcDoc={campaign.body_html} style={{ width: '100%', minHeight: '300px', border: `1px solid ${t.border}`, borderRadius: '8px', marginTop: '6px' }} title="Email body" />
                    ) : (
                        <pre style={{ margin: '6px 0 0', padding: '16px', background: t.cardInner, borderRadius: '10px', fontSize: '13px', lineHeight: 1.8, color: t.textSec, whiteSpace: 'pre-wrap', fontFamily: t.font }}>
                            {campaign.body_html}
                        </pre>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .camp-detail-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
                @media (max-width: 800px) {
                    .camp-detail-stats { grid-template-columns: repeat(3, 1fr) !important; }
                }
                @media (max-width: 640px) {
                    .camp-detail-stats { grid-template-columns: repeat(2, 1fr) !important; }
                }
            `}</style>
        </div>
    );
}
