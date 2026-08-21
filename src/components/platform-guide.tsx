"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, HelpCircle, X } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

type Guide = { title: string; purpose: string; steps: string[]; nextHref?: string; nextLabel?: string };

function guideFor(pathname: string): Guide {
    if (pathname.startsWith("/dashboard/setup")) return { title: "Setup & Launch guide", purpose: "Complete the cards from top to bottom. A green Ready badge means the platform detected that step.", steps: ["Paste your admin secret and click Check setup.", "Complete the first card marked Action needed.", "After changing Vercel or Supabase, redeploy and click Check again.", "Launch ads only when the final Meta step is ready."] };
    if (pathname.startsWith("/dashboard/automation")) return { title: "Automation guide", purpose: "Automation decides which campaign every new lead should receive.", steps: ["Find lead_created.", "Choose your active welcome campaign.", "Enable the rule and set a short delay.", "Save, then submit one landing-page test lead."], nextHref: "/dashboard/queue", nextLabel: "Check the Queue" };
    if (pathname.includes("/campaigns/new")) return { title: "New campaign guide", purpose: "Create the welcome emails a new Meta lead will receive.", steps: ["Choose a verified sender domain.", "Write a clear subject and first email.", "Add follow-ups with sensible delays.", "Save and activate the campaign."], nextHref: "/dashboard/automation", nextLabel: "Connect Automation" };
    if (pathname.startsWith("/dashboard/campaigns")) return { title: "Campaign guide", purpose: "Campaigns contain your email message and follow-up sequence.", steps: ["Keep the lifecycle campaign Active.", "Use Force Send only for testing queued contacts.", "If sending fails, read the error shown above the progress bar.", "Check Queue & Delivery for the final result."], nextHref: "/dashboard/queue", nextLabel: "Open Queue" };
    if (pathname.startsWith("/dashboard/contacts")) return { title: "Leads guide", purpose: "Every submitted landing-page lead should appear here automatically.", steps: ["Search for the test email address.", "Check its source and latest lifecycle event.", "Do not upload cold-email contacts into your Meta welcome campaign.", "Open Queue to confirm the email was scheduled."], nextHref: "/dashboard/queue", nextLabel: "Open Queue" };
    if (pathname.startsWith("/dashboard/queue")) return { title: "Queue guide", purpose: "This screen shows whether each email is waiting, sent, or failed.", steps: ["Queued means the send time has not arrived or the worker has not processed it.", "Sent means Resend accepted the email.", "Failed shows the exact delivery error.", "Confirm Supabase Cron is succeeding if items remain queued."], nextHref: "/dashboard/inbox", nextLabel: "Open Replies" };
    if (pathname.startsWith("/dashboard/domains")) return { title: "Sending domain guide", purpose: "A verified sender protects deliverability and allows Resend to send mail.", steps: ["Use a sending subdomain, not your main website domain.", "Verify DNS records in Resend.", "Keep the From email identical to the verified domain.", "Start with a low daily limit and increase slowly."], nextHref: "/dashboard/campaigns/new", nextLabel: "Create Campaign" };
    if (pathname.startsWith("/dashboard/inbox")) return { title: "Replies guide", purpose: "Review responses from interested leads and take over the conversation.", steps: ["Open each new reply.", "Respond personally to sales questions.", "Mark paid, unsubscribed, or unsuitable leads correctly.", "Use Analytics to review campaign quality."], nextHref: "/dashboard/analytics", nextLabel: "Open Analytics" };
    if (pathname.startsWith("/dashboard/analytics")) return { title: "Analytics guide", purpose: "Use these results to improve ads and emails, not just to count leads.", steps: ["Compare leads with sent emails.", "Watch delivery, bounce, open and reply rates.", "Pause weak ad or email variations.", "Change one thing at a time before comparing again."] };
    if (pathname.startsWith("/dashboard/database")) return { title: "Database guide", purpose: "This technical screen confirms that Supabase tables and automation records exist.", steps: ["Use Setup & Launch for normal configuration.", "Use Database only for troubleshooting.", "Never paste the service-role key into a public page.", "Check marketing_event_log when a lead does not automate."], nextHref: "/dashboard/setup", nextLabel: "Return to Setup" };
    if (pathname.startsWith("/dashboard/marketing")) return { title: "Landing page guide", purpose: "Build the page Meta visitors see and the form that starts your automation.", steps: ["Open the Landing Pages tab.", "Create or edit a page and its sections.", "Include a lead form and publish the page.", "Open /p/your-slug and submit one test lead."], nextHref: "/dashboard/campaigns/new", nextLabel: "Create Welcome Campaign" };
    return { title: "Overview guide", purpose: "This is your daily health screen after setup is complete.", steps: ["Use Setup & Launch first if you are new.", "Check new leads and queued emails.", "Review failures before changing campaigns.", "Handle replies personally, then review Analytics."], nextHref: "/dashboard/setup", nextLabel: "Open Setup & Launch" };
}

export default function PlatformGuide() {
    const { theme: t } = useTheme();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const guide = guideFor(pathname);
    return (
        <>
            <button onClick={() => setOpen(true)} style={{ position: "fixed", right: 20, bottom: 20, zIndex: 80, display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${t.accentBorder}`, borderRadius: 999, background: t.accent, color: "#fff", padding: "11px 15px", boxShadow: "0 10px 30px rgba(0,0,0,.18)", cursor: "pointer", fontWeight: 700 }}><HelpCircle size={17} /> Guide</button>
            {open && <div role="dialog" aria-modal="true" aria-label={guide.title} style={{ position: "fixed", inset: 0, zIndex: 250 }}>
                <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.42)", backdropFilter: "blur(3px)" }} />
                <aside style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(420px, 92vw)", padding: 24, background: t.card, borderLeft: `1px solid ${t.border}`, overflowY: "auto", boxShadow: "-12px 0 40px rgba(0,0,0,.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 15 }}><div><div style={{ color: t.accent, fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>Guide for this screen</div><h2 style={{ color: t.text, margin: "7px 0 0", fontSize: 23 }}>{guide.title}</h2></div><button aria-label="Close guide" onClick={() => setOpen(false)} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${t.border}`, background: t.cardInner, color: t.textSec, cursor: "pointer" }}><X size={18} /></button></div>
                    <p style={{ color: t.textSec, fontSize: 14, lineHeight: 1.65, margin: "18px 0" }}>{guide.purpose}</p>
                    <div style={{ display: "grid", gap: 10 }}>{guide.steps.map((step, index) => <div key={step} style={{ display: "flex", gap: 11, padding: 13, border: `1px solid ${t.border}`, borderRadius: 10, background: t.cardInner, color: t.textSec, fontSize: 13, lineHeight: 1.5 }}><span style={{ width: 23, height: 23, borderRadius: 7, background: t.accentSoft, color: t.accent, display: "grid", placeItems: "center", fontWeight: 800, flexShrink: 0 }}>{index + 1}</span>{step}</div>)}</div>
                    {guide.nextHref && <Link href={guide.nextHref} onClick={() => setOpen(false)} style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 14px", borderRadius: 9, background: t.accent, color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>{guide.nextLabel}<ArrowRight size={15} /></Link>}
                </aside>
            </div>}
        </>
    );
}
