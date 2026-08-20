"use client";

import { useTheme, Theme } from "@/components/theme-provider";
import { ShieldCheck, Info } from "lucide-react";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}

export default function CompliancePage() {
    const { theme: t } = useTheme();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '800px' }}>
            <div>
                <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Compliance & Safety</h1>
                <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Guidelines and automated protocols that protect your sending domains.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={card(t)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: t.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShieldCheck style={{ width: '18px', height: '18px', color: t.accent }} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: t.text }}>CAN-SPAM Built-in</h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <p style={{ ...lbl(t), marginBottom: '8px' }}>One-Click Unsubscribe</p>
                            <p style={{ margin: 0, fontSize: '14px', color: t.text, lineHeight: 1.7 }}>By default, ColdReach handles all unsubscribe requests seamlessly through Resend webhooks. If a user complains or marks an email as spam, they are permanently unsubscribed and will not receive future campaigns.</p>
                        </div>
                        <div>
                            <p style={{ ...lbl(t), marginBottom: '8px' }}>Bounce Rate Monitors</p>
                            <p style={{ margin: 0, fontSize: '14px', color: t.text, lineHeight: 1.7 }}>If a sending domain's bounce rate exceeds 5% in a given day, the Autopilot engine automatically pauses all queues for that domain to prevent catastrophic reputation damage.</p>
                        </div>
                    </div>
                </div>

                <div style={{ ...card(t), background: t.cardInner, border: `1px solid ${t.borderLight}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <Info style={{ width: '18px', height: '18px', color: t.textMuted, marginTop: '2px', flexShrink: 0 }} />
                        <div>
                            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: t.text }}>Best Practices Checklist</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {[
                                    'Never send more than 300–500 emails per day per domain.',
                                    'Always provide a clear way for recipients to opt out inside your messaging.',
                                    'Use verified email lists to keep bounce rates strictly below 2%.',
                                    'Do not use deceptive subject lines (e.g. misleading "Re:" prefixes).',
                                ].map((item, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: t.greenSoft, color: t.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>✓</span>
                                        <span style={{ fontSize: '13px', color: t.textSec, lineHeight: 1.7 }}>{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
