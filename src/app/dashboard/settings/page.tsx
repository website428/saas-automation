"use client";

import { useEffect, useState } from "react";
import { useTheme, Theme } from "@/components/theme-provider";
import { Settings, Gauge } from "lucide-react";
import { supabase } from "@/lib/supabase";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}
function inputStyle(t: Theme): React.CSSProperties {
    return { width: '100%', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, fontSize: '14px', outline: 'none', transition: 'border-color 200ms ease', fontFamily: t.font };
}

const responsiveStyles = `
  .settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 640px) {
    .settings-grid { grid-template-columns: 1fr; }
    .settings-actions { justify-content: stretch !important; }
    .settings-save-btn { width: 100%; justify-content: center; }
  }
`;

export default function SettingsPage() {
    const { theme: t } = useTheme();
    const [quota, setQuota] = useState({ daily_used: 0, monthly_used: 0, daily_limit: 100, monthly_limit: 3000 });

    useEffect(() => {
        supabase.rpc('get_resend_quota_status').then(({ data }) => {
            const row = Array.isArray(data) ? data[0] : data;
            if (row) setQuota(row);
        });
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '800px' }}>
            <style>{responsiveStyles}</style>
            <div>
                <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Settings</h1>
                <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Manage your account and platform preferences.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={card(t)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: t.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Gauge style={{ width: '18px', height: '18px', color: t.accent }} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: t.text }}>Resend Free Quota</h3>
                            <p style={{ margin: '3px 0 0', fontSize: '12px', color: t.textMuted }}>Shared by every domain; inbound replies also count.</p>
                        </div>
                    </div>
                    <div className="settings-grid">
                        <div><span style={lbl(t)}>Today</span><p style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 700, color: t.text }}>{quota.daily_used} / {quota.daily_limit}</p></div>
                        <div><span style={lbl(t)}>This month</span><p style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 700, color: t.text }}>{quota.monthly_used} / {quota.monthly_limit}</p></div>
                    </div>
                </div>
                <div style={card(t)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: t.cardInner, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Settings style={{ width: '18px', height: '18px', color: t.textSec }} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: t.text }}>General Information</h3>
                    </div>

                    <div className="settings-grid">
                        <div>
                            <label style={{ ...lbl(t), display: 'block', marginBottom: '8px' }}>Account Name</label>
                            <input disabled value="Prince Gupta" style={{ ...inputStyle(t), opacity: 0.7, cursor: 'not-allowed' }} />
                        </div>
                        <div>
                            <label style={{ ...lbl(t), display: 'block', marginBottom: '8px' }}>Account Email</label>
                            <input disabled value="princeguptaca9@gmail.com" style={{ ...inputStyle(t), opacity: 0.7, cursor: 'not-allowed' }} />
                        </div>
                    </div>
                </div>

                <div style={card(t)}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600, color: t.text }}>API Keys & Integrations</h3>

                    <div>
                        <label style={{ ...lbl(t), display: 'block', marginBottom: '8px' }}>Resend API Key</label>
                        <input type="text" disabled value="Configured in deployment secrets" style={{ ...inputStyle(t), opacity: 0.7, cursor: 'not-allowed', fontFamily: 'monospace' }} />
                        <p style={{ marginTop: '6px', fontSize: '12px', color: t.textMuted }}>Configured in .env file securely for edge functions.</p>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <label style={{ ...lbl(t), display: 'block', marginBottom: '8px' }}>Webhook Secret</label>
                        <input type="text" disabled value="Configured in deployment secrets" style={{ ...inputStyle(t), opacity: 0.7, cursor: 'not-allowed', fontFamily: 'monospace' }} />
                        <p style={{ marginTop: '6px', fontSize: '12px', color: t.textMuted }}>Used to verify real-time events from Resend.</p>
                    </div>
                </div>

                <div style={card(t)}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600, color: t.text }}>Autopilot Engine</h3>
                    <p style={{ fontSize: '14px', color: t.textSec, lineHeight: 1.6, margin: 0 }}>
                        The smart sending engine runs securely in the background using Supabase Edge Functions + pg_cron. Valid business sending hours are set to <strong>9am to 8pm IST (Mon-Sat)</strong>. It limits sends automatically based on domain health and warmup limits.
                    </p>
                </div>
            </div>

            <div className="settings-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <p style={{ fontSize: '12px', color: t.textMuted, marginTop: '8px' }}>
                    Account settings are managed by your provider. Contact support to make changes.
                </p>
            </div>
        </div>
    );
}
