"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, Users, Globe, ChevronDown, Eye, EyeOff, Zap, Inbox, Sparkles, RefreshCw, Clock, AlertTriangle, X, Check, Tag, Upload, FileSpreadsheet, Download } from "lucide-react";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";

function card(t: Theme): React.CSSProperties {
  return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
  return { display: 'block', fontSize: '13px', fontWeight: 600, color: t.textSec, marginBottom: '8px', fontFamily: t.font };
}
function inputStyle(t: Theme): React.CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '14px', fontFamily: t.font,
    border: `1px solid ${t.border}`, background: t.cardInner, color: t.text, outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 150ms',
  };
}

// ── PLAIN TEXT — FinModel default (lands in Primary inbox) ─────────────────
const PLAIN_SUBJECT = "{name} — had a question";
const PLAIN_BODY = `Hi {name},

Saw your profile and thought you might find this useful — we built a tool that automatically generates 3-statement financial models from any company's annual reports or PDFs.

Took us a while to get right, but it now does in a few minutes what used to take a week of manual work.

Would it be useful for what you're working on? Happy to give you access and walk you through it.

Best,
financialmodel.io`;

// ── BRANDED HTML — matches financialmodel.io navy/purple brand ───
const BRANDED_SUBJECT = "Hi {name} — build financial models 10x faster";
const BRANDED_BODY = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#07070f;font-family:'Inter',system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07070f;">
<tr><td align="center" style="padding:48px 20px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Logo bar -->
  <tr><td style="padding-bottom:28px;">
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="width:38px;height:38px;background:linear-gradient(135deg,#7c3aed,#4338ca);border-radius:10px;text-align:center;vertical-align:middle;">
        <span style="color:#fff;font-weight:800;font-size:18px;line-height:38px;">F</span>
      </td>
      <td style="padding-left:10px;font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.03em;vertical-align:middle;">FinModel</td>
    </tr></table>
  </td></tr>

  <!-- Main card -->
  <tr><td style="background:#0f0f1e;border:1px solid rgba(124,58,237,0.2);border-radius:20px;padding:40px;">

    <!-- Eyebrow badge -->
    <div style="display:inline-block;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.35);border-radius:20px;padding:5px 14px;font-size:11px;font-weight:600;color:#a78bfa;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:20px;">
      Personal outreach
    </div>

    <h1 style="margin:0 0 20px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.04em;line-height:1.25;">
      Hi {name} 👋
    </h1>

    <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.75;">
      I'm from <strong style="color:#fff;">financialmodel.io</strong>. I wanted to reach out because I think we can save your team a lot of time.
    </p>

    <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.75;">
      We built an AI platform that turns complex auditory PDFs into fully-linked 3-statement financial models in <strong style="color:#a78bfa;">5 minutes</strong> — not 10 days.
    </p>

    <!-- Stats -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
    <tr>
      <td width="33%" style="padding:0 4px 0 0;">
        <div style="background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.25);border-radius:14px;padding:18px 12px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#a78bfa;margin-bottom:4px;">10x</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:500;">Faster models</div>
        </div>
      </td>
      <td width="33%" style="padding:0 2px;">
        <div style="background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.25);border-radius:14px;padding:18px 12px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#a78bfa;margin-bottom:4px;">2K+</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:500;">Finance pros</div>
        </div>
      </td>
      <td width="33%" style="padding:0 0 0 4px;">
        <div style="background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.25);border-radius:14px;padding:18px 12px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#a78bfa;margin-bottom:4px;">4.9★</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:500;">Rating</div>
        </div>
      </td>
    </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
    <tr><td align="center">
      <a href="https://financialmodel.io" style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#4338ca 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 40px;border-radius:12px;letter-spacing:-0.01em;">
        Try Free Demo — No Signup &rarr;
      </a>
    </td></tr>
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,0.45);line-height:1.7;">
      Would you have 15 minutes this week? I'd love to show you how it works for your specific use case.
    </p>

    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.55);line-height:1.8;">
      Best regards,<br/>
      <strong style="color:#ffffffcc;">financialmodel.io</strong><br/>
      <a href="https://financialmodel.io" style="color:#a78bfa;text-decoration:none;font-weight:500;">financialmodel.io</a>
    </p>

  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0;text-align:center;">
    <p style="font-size:11px;color:rgba(255,255,255,0.2);margin:0;line-height:1.8;">
      FinModel &middot; Solving the 10-Day Financial Modeling Bottleneck<br/>
      <a href="https://financialmodel.io/unsubscribe?email={email}" style="color:rgba(255,255,255,0.2);text-decoration:underline;">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
// ── PER-PRODUCT BRANDED TEMPLATES ────────────────────────────────
// Each domain gets its own visual identity matching the real website
const PRODUCT_BRANDED_TEMPLATES: Record<string, { subject: string; body: string }> = {
  'FinModel': {
    subject: "Hi {name} — build financial models 10x faster",
    body: BRANDED_BODY,
  },
  'InvestorRaise': {
    subject: "Connect with investors who matter",
    body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap');</style>
</head>
<body style="margin:0;padding:40px 20px;background-color:#F9F7F4;font-family:'DM Sans',Arial,sans-serif;color:#5A5A5A;">
  <div style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px -6px rgba(0,0,0,0.08);">
    <div style="padding:32px 40px;text-align:center;border-bottom:1px solid #F0F0F0;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
          <td valign="middle" style="padding-right:12px;">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3A5A3A 0%,#5A7A5A 100%);text-align:center;line-height:36px;">
              <span style="color:#fff;font-weight:700;font-size:18px;">IR</span>
            </div>
          </td>
          <td valign="middle">
            <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;color:#151515;letter-spacing:-0.02em;">Investor<span style="color:#4A6A4A;">Raise</span></span>
          </td>
      </tr></table>
    </div>
    <div style="padding:48px 40px;">
      <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:400;color:#151515;margin:0 0 24px 0;line-height:1.1;letter-spacing:-0.02em;">Connect with investors <span style="font-style:italic;">who matter</span></h1>
      <p style="font-size:16px;line-height:1.7;margin:0 0 24px 0;color:#5A5A5A;">Hi {name},</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 24px 0;color:#5A5A5A;">Pitching shouldn't mean sending generic emails into the void. At InvestorRaise, we help you secure funding faster with AI-crafted, highly personalized pitches.</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 32px 0;color:#5A5A5A;">Get direct access to our verified network of <strong>10,000+ VCs and angel investors</strong> across India. Stand out in the inbox and start closing your round today.</p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr>
          <td align="center" bgcolor="#151515" style="border-radius:30px;">
            <a href="https://investorraise.com" style="display:inline-block;padding:16px 36px;font-family:'DM Sans',Arial,sans-serif;font-weight:500;font-size:15px;color:#FAFAFA;text-decoration:none;border-radius:30px;">Get Started</a>
          </td>
      </tr></table>
      <p style="font-size:16px;line-height:1.7;margin:40px 0 0 0;color:#5A5A5A;">Best,<br><strong>InvestorRaise</strong><br><span style="font-size:14px;color:#8A8A8A;">investorraise.com</span></p>
    </div>
    <div style="padding:24px 40px;text-align:center;background-color:#F8F9F8;border-top:1px solid #F0F0F0;">
      <p style="font-size:12px;color:#9A9A9A;margin:0;"><a href="https://investorraise.com/unsubscribe?email={email}" style="color:#9A9A9A;text-decoration:underline;">Unsubscribe</a> | investorraise.com</p>
    </div>
  </div>
</body></html>`,
  },
  'AIML School 360': {
    subject: "Where curious minds become AI leaders",
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIML School 360</title>
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FFFAF5;font-family:'Inter',-apple-system,sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FFFAF5;padding:40px 15px;">
    <tr><td align="center">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.06);padding:40px;text-align:left;">
        <tr><td style="padding-bottom:30px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#0D7377;border-radius:12px;width:40px;height:40px;text-align:center;vertical-align:middle;">
              <span style="color:#ffffff;font-size:14px;font-weight:800;">AI</span>
            </td>
            <td style="padding-left:8px;">
              <span style="font-size:20px;font-weight:700;color:#1A1A1A;letter-spacing:-0.02em;">MLSchool<span style="color:#0D7377;">360</span></span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
            <td style="padding:4px 12px;border-radius:30px;border:1px solid rgba(249,115,22,0.2);background-color:#FFF4ED;">
              <span style="color:#EA580C;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;">Guaranteed Job Assistance</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <h1 style="margin:0;color:#1A1A1A;font-size:32px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;">Where curious minds become <span style="color:#0D7377;">AI leaders</span></h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0;color:#5C5C5C;font-size:16px;line-height:1.6;">Hi {name},</p><br>
          <p style="margin:0;color:#5C5C5C;font-size:16px;line-height:1.6;">With over <strong style="color:#1A1A1A;">7+ years of trusted offline training</strong> and 1,500+ successful placements, we know exactly what it takes to break into the AI space.</p><br>
          <p style="margin:0;color:#5C5C5C;font-size:16px;line-height:1.6;">We are now bringing our proven methodology online so you can access industry-ready AI and ML education from anywhere. Real placement support, personalized coaching, curriculum built by experts.</p>
        </td></tr>
        <tr><td style="padding-bottom:40px;padding-top:10px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:30px;background-color:#0D7377;box-shadow:0 8px 24px rgba(13,115,119,0.2);">
              <a href="https://aimlschool360.com" style="font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;padding:16px 32px;display:inline-block;border-radius:30px;">Explore Programs</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="border-top:1px solid #E5DDD5;padding-top:24px;">
          <p style="margin:0;color:#1A1A1A;font-size:14px;font-weight:600;">Best,</p>
          <p style="margin:4px 0 0 0;color:#8C8C8C;font-size:14px;">AIML School 360</p>
        </td></tr>
      </table>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;"><tr>
        <td align="center" style="padding-top:20px;">
          <p style="margin:0;color:#8C8C8C;font-size:11px;line-height:1.5;">
            <a href="https://aimlschool360.com/unsubscribe?email={email}" style="color:#8C8C8C;text-decoration:underline;">Unsubscribe</a> | aimlschool360.com
          </p>
        </td>
      </tr></table>
    </td></tr>
  </table>
</body>
</html>`,
  },
};

const newCampStyles = `
  .nc-stats-strip { display: flex; gap: 12px; }
  .nc-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .nc-template-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .nc-actions { display: flex; gap: 10px; justify-content: flex-end; padding-bottom: 32px; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 640px) {
    .nc-stats-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .nc-form-row { grid-template-columns: 1fr; }
    .nc-template-grid { grid-template-columns: 1fr; }
    .nc-actions {
      flex-direction: column-reverse;
      padding-bottom: 24px;
    }
    .nc-actions a, .nc-actions button { width: 100%; justify-content: center; text-align: center; }
    .nc-page-title { font-size: 22px !important; }
  }
`;

export default function NewCampaignPage() {
  const { theme: t } = useTheme();
  const router = useRouter();

  const [domains, setDomains] = useState<{ id: string; domain_name: string; from_email: string; daily_limit: number; warmup_day: number; product_name?: string; sender_name?: string; send_hour_start?: number; send_hour_end?: number }[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  type CampaignContact = {
    id: string;
    name: string | null;
    email: string;
    company_name: string | null;
    job_title: string | null;
    website: string | null;
    personalization: string | null;
    custom_subject: string | null;
    custom_body: string | null;
    status: string;
  };
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [previewContactId, setPreviewContactId] = useState("");
  const [rangeStart, setRangeStart] = useState<number | ''>('');
  const [rangeEnd, setRangeEnd] = useState<number | ''>('');

  // template mode
  const [templateMode, setTemplateMode] = useState<'plain' | 'branded'>('plain');

  const [name, setName] = useState("");
  const [domainId, setDomainId] = useState("");
  const [subject, setSubject] = useState(PLAIN_SUBJECT);
  const [bodyHtml, setBodyHtml] = useState(PLAIN_BODY);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);

  // ── Bounce email ────────────────────────────────────────────────
  const [bounceSubject, setBounceSubject] = useState("");
  const [bounceBody, setBounceBody] = useState("");
  const [bounceEnabled, setBounceEnabled] = useState(false);
  const [bouncePreview, setBouncePreview] = useState(false);

  // ── Follow-up email (no-open) ────────────────────────────────────
  const [followUpSubject, setFollowUpSubject] = useState("");
  const [followUpBody, setFollowUpBody] = useState("");
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpDelayDays, setFollowUpDelayDays] = useState<number>(3);
  const [followUpPreview, setFollowUpPreview] = useState(false);

  // Per-recipient AI personalization (generation never sends email)
  const [personalizationBrief, setPersonalizationBrief] = useState("");
  const [personalizing, setPersonalizing] = useState(false);
  const [personalizationStatus, setPersonalizationStatus] = useState("");
  const [sheetImporting, setSheetImporting] = useState(false);
  const [sheetImportStatus, setSheetImportStatus] = useState("");

  // Per-product templates keyed by product_name
  const PRODUCT_TEMPLATES: Record<string, { subject: string; body: string }> = {
    'FinModel': {
      subject: "{name} — had a question",
      body: `Hi {name},

Saw your profile and thought you might find this useful — we built a tool that automatically generates 3-statement financial models from any company's annual reports or PDFs.

Took us a while to get right, but it now does in a few minutes what used to take a week of manual work.

Would it be useful for what you're working on? Happy to give you access.

Best,
financialmodel.io`,
    },
    'AIML School 360': {
      subject: "{name} — AI/ML question",
      body: `Hi {name},

I noticed you're working in tech and wanted to reach out.

I run AIML School 360 — we help professionals go from zero to production-ready AI/ML skills in 8 weeks. Fully project-based, no fluff.

We have a cohort starting soon. Would this be relevant to you or anyone on your team?

Best,
aimlschool360.com`,
    },
    'InvestorRaise': {
      subject: "Quick question about your fundraise",
      body: `Hi {name},

I noticed you're currently raising and wanted to reach out. We built InvestorRaise to help founders get AI-crafted, personalized pitches in front of our network of 10,000+ verified VCs and angels across India.

Are you open to exploring a new channel for your round?

Best,
investorraise.com`,
    },
  };

  useEffect(() => {
    supabase.from('domains').select('id,domain_name,from_email,daily_limit,warmup_day,product_name,sender_name,send_hour_start,send_hour_end').then(({ data }) => {
      setDomains(data || []);
      if (data && data.length > 0) {
        setDomainId(data[0].id);
        const pName = data[0].product_name || 'FinModel';
        // Case-insensitive lookup inline for initial load
        const findTpl = (map: Record<string, { subject: string; body: string }>, key: string) => {
          if (map[key]) return map[key];
          const lk = key.toLowerCase();
          const found = Object.keys(map).find(k => k.toLowerCase() === lk);
          return found ? map[found] : undefined;
        };
        const tpl = findTpl(PRODUCT_TEMPLATES, pName) || PRODUCT_TEMPLATES['FinModel'];
        setSubject(tpl.subject);
        setBodyHtml(tpl.body);
      }
    });
    supabase.from('categories').select('*').order('name').then(({ data }) => setCategories(data || []));

    // Close category dropdown on outside click
    function handleClickOutside(e: MouseEvent) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    async function fetchAllContacts() {
      const PAGE_SIZE = 1000;
      let allContacts: CampaignContact[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let q = supabase
          .from('contacts')
          .select('id,name,email,company_name,job_title,website,personalization,custom_subject,custom_body,status')
          .eq('status', 'pending')
          .range(from, from + PAGE_SIZE - 1);

        if (selectedCategories.size > 0) {
          q = q.in('category_id', Array.from(selectedCategories));
        }

        const { data, error } = await q;
        if (error || !data || data.length === 0) {
          hasMore = false;
        } else {
          allContacts = allContacts.concat(data);
          if (data.length < PAGE_SIZE) {
            hasMore = false; // last page
          } else {
            from += PAGE_SIZE;
          }
        }
      }

      setContacts(allContacts);
      setRecipientCount(allContacts.length);
      setSelectedContactIds(new Set(allContacts.map(c => c.id)));
      setPreviewContactId(current => current || allContacts[0]?.id || '');
    }

    fetchAllContacts();
  }, [selectedCategories]);

  // Case-insensitive template lookup helper
  function findTemplate<T>(map: Record<string, T>, key: string): T | undefined {
    if (!key) return undefined;
    // Try exact match first
    if (map[key]) return map[key];
    // Fall back to case-insensitive match
    const lk = key.toLowerCase();
    const found = Object.keys(map).find(k => k.toLowerCase() === lk);
    return found ? map[found] : undefined;
  }

  function switchTemplate(mode: 'plain' | 'branded') {
    setTemplateMode(mode);
    // Find the selected domain's product name
    const selectedDomain = domains.find(d => d.id === domainId);
    const productName = selectedDomain?.product_name || 'FinModel';
    if (mode === 'plain') {
      const tpl = findTemplate(PRODUCT_TEMPLATES, productName) || PRODUCT_TEMPLATES['FinModel'];
      setSubject(tpl.subject);
      setBodyHtml(tpl.body);
    } else {
      const tpl = findTemplate(PRODUCT_BRANDED_TEMPLATES, productName) || PRODUCT_BRANDED_TEMPLATES['FinModel'];
      setSubject(tpl.subject);
      setBodyHtml(tpl.body);
    }
    setPreview(false);
  }

  async function personalizeSelectedContacts() {
    const ids = Array.from(selectedContactIds);
    if (ids.length === 0) { setError('Select at least one contact to personalize.'); return; }
    if (ids.length > 100) { setError('Personalize up to 100 contacts at a time so you can review the output safely.'); return; }
    if (!subject.trim() || !bodyHtml.trim()) { setError('Add the base campaign subject and body first.'); return; }

    setPersonalizing(true);
    setError('');
    setPersonalizationStatus(`Preparing 0 of ${ids.length}…`);
    const generated: CampaignContact[] = [];
    const selectedProduct = domains.find(d => d.id === domainId)?.product_name || 'our product';

    try {
      for (let i = 0; i < ids.length; i += 15) {
        const chunk = ids.slice(i, i + 15);
        const { data, error: invokeError } = await supabase.functions.invoke('personalize-contacts', {
          body: {
            contactIds: chunk,
            productName: selectedProduct,
            brief: personalizationBrief,
            baseSubject: subject,
            baseBody: bodyHtml,
          },
        });
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        generated.push(...(data?.contacts || []));
        setPersonalizationStatus(`Generated ${Math.min(i + chunk.length, ids.length)} of ${ids.length}…`);
      }

      const byId = new Map(generated.map((item: any) => [item.id, item]));
      setContacts(previous => previous.map(contact => {
        const update: any = byId.get(contact.id);
        return update ? { ...contact, ...update } : contact;
      }));
      setPersonalizationStatus(`✓ Personalized ${generated.length} contacts. Review each preview before launching.`);
      if (generated[0]?.id) setPreviewContactId(generated[0].id);
      setPreview(true);
    } catch (err: any) {
      setError(err?.message || 'Personalization failed. Confirm the Edge Function is deployed and GEMINI_API_KEY is configured.');
      setPersonalizationStatus('');
    } finally {
      setPersonalizing(false);
    }
  }

  async function clearSelectedPersonalization() {
    const ids = Array.from(selectedContactIds);
    if (ids.length === 0) return;
    setPersonalizing(true);
    setError('');
    const { error: clearError } = await supabase.from('contacts').update({
      personalization: null,
      custom_subject: null,
      custom_body: null,
    }).in('id', ids);
    if (clearError) {
      setError(clearError.message);
    } else {
      setContacts(previous => previous.map(contact => selectedContactIds.has(contact.id)
        ? { ...contact, personalization: null, custom_subject: null, custom_body: null }
        : contact));
      setPersonalizationStatus(`Cleared personalized copy for ${ids.length} contacts.`);
    }
    setPersonalizing(false);
  }

  async function importPersonalizedSheet(file: File) {
    setSheetImporting(true);
    setSheetImportStatus('Reading spreadsheet…');
    setError('');

    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Use a spreadsheet smaller than 10 MB.');
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as any[][];
      if (rows.length < 2) throw new Error('The spreadsheet is empty or has no data rows.');
      if (rows.length > 5001) throw new Error('Import up to 5,000 recipients per spreadsheet.');

      const headers = rows[0].map(value => String(value).trim().toLowerCase());
      const column = (...aliases: string[]) => headers.findIndex(header => aliases.includes(header));
      const emailIndex = column('email', 'email address', 'work email');
      const nameIndex = column('name', 'full name', 'contact name');
      const subjectIndex = column('subject', 'email subject', 'custom subject');
      const bodyIndex = column('body', 'email body', 'custom body', 'mail', 'email content', 'message');
      const companyIndex = column('company', 'company name', 'organization', 'organisation');
      const titleIndex = column('job title', 'title', 'role', 'position');
      const websiteIndex = column('website', 'company website', 'domain');
      const personalizationIndex = column('personalization', 'personalisation', 'personalized line', 'personalised line', 'icebreaker', 'opening line');

      if (emailIndex === -1 || subjectIndex === -1 || bodyIndex === -1) {
        throw new Error('Required columns: Email, Subject, and Body (or Mail). Name and Company are optional.');
      }

      const valueAt = (row: any[], index: number) => index >= 0 ? String(row[index] || '').trim() : '';
      const byEmail = new Map<string, any>();
      let invalidRows = 0;
      for (const row of rows.slice(1)) {
        const email = valueAt(row, emailIndex).toLowerCase();
        const customSubject = valueAt(row, subjectIndex);
        const customBody = valueAt(row, bodyIndex);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !customSubject || !customBody) {
          invalidRows++;
          continue;
        }
        byEmail.set(email, {
          email,
          name: valueAt(row, nameIndex) || null,
          company_name: valueAt(row, companyIndex) || null,
          job_title: valueAt(row, titleIndex) || null,
          website: valueAt(row, websiteIndex) || null,
          personalization: valueAt(row, personalizationIndex) || null,
          custom_subject: customSubject,
          custom_body: customBody,
        });
      }
      const importedRows = Array.from(byEmail.values());
      if (importedRows.length === 0) throw new Error('No valid rows with Email, Subject, and Body were found.');

      setSheetImportStatus(`Matching ${importedRows.length} recipients…`);
      const existing: any[] = [];
      for (let i = 0; i < importedRows.length; i += 200) {
        const emails = importedRows.slice(i, i + 200).map(row => row.email);
        const { data, error: lookupError } = await supabase
          .from('contacts')
          .select('id,email,name,company_name,job_title,website,personalization,custom_subject,custom_body,status')
          .in('email', emails);
        if (lookupError) throw lookupError;
        existing.push(...(data || []));
      }

      const existingByEmail = new Map(existing.map(contact => [contact.email.toLowerCase(), contact]));
      const updatedContacts: CampaignContact[] = [];
      const newRows: any[] = [];

      const existingUpdates: Array<{ found: any; fields: any }> = [];
      for (const row of importedRows) {
        const found = existingByEmail.get(row.email);
        if (!found) {
          newRows.push({ ...row, status: 'pending', tags: ['personalized-sheet'] });
          continue;
        }
        const fields = {
          name: row.name || found.name,
          company_name: row.company_name || found.company_name,
          job_title: row.job_title || found.job_title,
          website: row.website || found.website,
          personalization: row.personalization || found.personalization,
          custom_subject: row.custom_subject,
          custom_body: row.custom_body,
        };
        existingUpdates.push({ found, fields });
      }

      for (let i = 0; i < existingUpdates.length; i += 20) {
        const results = await Promise.all(existingUpdates.slice(i, i + 20).map(async ({ found, fields }) => {
          const { data: updated, error: updateError } = await supabase
            .from('contacts').update(fields).eq('id', found.id)
            .select('id,email,name,company_name,job_title,website,personalization,custom_subject,custom_body,status')
            .single();
          if (updateError) throw updateError;
          return updated as CampaignContact;
        }));
        updatedContacts.push(...results);
      }

      const createdContacts: CampaignContact[] = [];
      for (let i = 0; i < newRows.length; i += 200) {
        const { data: created, error: createError } = await supabase
          .from('contacts').insert(newRows.slice(i, i + 200))
          .select('id,email,name,company_name,job_title,website,personalization,custom_subject,custom_body,status');
        if (createError) throw createError;
        createdContacts.push(...((created || []) as CampaignContact[]));
      }

      const importedContacts = [...updatedContacts, ...createdContacts];
      const importedIds = new Set(importedContacts.map(contact => contact.id));
      setContacts(previous => {
        const importedEmailSet = new Set(importedContacts.map(contact => contact.email.toLowerCase()));
        return [...previous.filter(contact => !importedEmailSet.has(contact.email.toLowerCase())), ...importedContacts];
      });
      const eligibleIds = new Set(importedContacts
        .filter(contact => !['bounced', 'unsubscribed'].includes(contact.status))
        .map(contact => contact.id));
      setSelectedContactIds(eligibleIds);
      if (importedContacts[0]) setPreviewContactId(importedContacts[0].id);
      setPreview(true);

      const suppressed = importedIds.size - eligibleIds.size;
      setSheetImportStatus(`✓ Loaded ${importedContacts.length} personalized emails${invalidRows ? `; skipped ${invalidRows} invalid rows` : ''}${suppressed ? `; suppressed ${suppressed} bounced/unsubscribed contacts` : ''}. Review, then launch.`);
    } catch (err: any) {
      setError(err?.message || 'Could not import the personalized spreadsheet.');
      setSheetImportStatus('');
    } finally {
      setSheetImporting(false);
    }
  }

  async function handleCreate(startNow = false) {
    if (!name.trim()) { setError("Campaign name is required."); return; }
    if (!domainId) { setError("Select a domain."); return; }
    if (!subject.trim()) { setError("Subject line is required."); return; }
    if (!bodyHtml.trim()) { setError("Email body is required."); return; }
    if (bounceEnabled && !bounceSubject.trim()) { setError("Bounce email subject is required when enabled."); return; }
    if (bounceEnabled && !bounceBody.trim()) { setError("Bounce email body is required when enabled."); return; }
    if (followUpEnabled && !followUpSubject.trim()) { setError("Follow-up email subject is required when enabled."); return; }
    if (followUpEnabled && !followUpBody.trim()) { setError("Follow-up email body is required when enabled."); return; }

    setLoading(true); setError("");

    const { data: camp, error: cErr } = await supabase.from('campaigns').insert({
      name: name.trim(),
      domain_id: domainId,
      subject_a: subject.trim(),
      body_html: bodyHtml.trim(),
      status: startNow ? 'active' : 'draft',
      total_contacts: sendingTo,
      // Bounce email
      bounce_email_enabled: bounceEnabled,
      bounce_subject: bounceEnabled ? bounceSubject.trim() : null,
      bounce_body: bounceEnabled ? bounceBody.trim() : null,
      // Follow-up email
      followup_email_enabled: followUpEnabled,
      followup_subject: followUpEnabled ? followUpSubject.trim() : null,
      followup_body: followUpEnabled ? followUpBody.trim() : null,
      followup_delay_days: followUpEnabled ? followUpDelayDays : null,
    }).select().single();

    if (cErr || !camp) {
      setError(cErr?.message || "Failed to create campaign.");
      setLoading(false);
      return;
    }

    const selectedContacts = contacts.filter(c => selectedContactIds.has(c.id));
    if (selectedContacts.length > 0) {
      // ── Warmup-Safe Hourly-Tranche Scheduling (v5) ─────────────────────────
      //
      // Rules:
      //  • Warmup curve controls DAILY CAPACITY → protects domain reputation
      //    getDailyLimit(warmupDay + dayIndex) = min(100, floor(20 × 1.20^(day-1)))
      //  • Within each day: emails spread across hourly buckets (9 AM – 6 PM IST)
      //    → ~55/hr on a warmed domain, fewer on early warmup days (safe)
      //  • Mon–Sat only — no Sunday sends
      //  • Different campaigns on DIFFERENT domains are 100% independent:
      //    each starts from tomorrow simultaneously — no inter-campaign day gaps
      //  • Same-domain conflict detection prevents duplicate sends

      const SEND_START_HOUR = 9;   // 9 AM IST
      const SEND_END_HOUR   = 20;  // 8 PM IST
      const HOURS_IN_WINDOW = SEND_END_HOUR - SEND_START_HOUR; // 11 hours

      const selectedDomainConfig = domains.find(d => d.id === domainId);
      const currentWarmupDay = selectedDomainConfig?.warmup_day ?? 1;

      // ── Warmup curve (same formula as process-queue) ─── DOMAIN SAFE ──────
      // Day 1 = 20 emails, each day +20%, capped at the free account's 100/day
      function getDailyLimit(day: number): number {
        return Math.max(5, Math.min(100, Math.floor(20 * Math.pow(1.20, day - 1))));
      }

      const now = new Date();
      const contactIds = selectedContacts.map(c => c.id);

      // Conflict detection — same domain only (cross-domain is fully independent)
      const { data: conflicts } = await supabase
        .from('email_queue')
        .select('contact_id')
        .in('contact_id', contactIds)
        .eq('domain_id', domainId)
        .in('status', ['queued', 'sent', 'sending'])
        .gte('scheduled_at', now.toISOString());

      const conflictSet = new Set<string>();
      for (const row of (conflicts || [])) conflictSet.add(row.contact_id);

      // ── Mon–Sat calendar days starting TOMORROW ───────────────────────────
      function buildValidDays(count: number): Date[] {
        const days: Date[] = [];
        const cursor = new Date();
        cursor.setDate(cursor.getDate() + 1); // always start TOMORROW
        cursor.setHours(0, 0, 0, 0);
        while (days.length < count) {
          if (cursor.getDay() !== 0) days.push(new Date(cursor)); // skip Sundays
          cursor.setDate(cursor.getDate() + 1);
        }
        return days;
      }

      // ── Hourly tranche slot ────────────────────────────────────────────────
      // Assigns email to the correct hour bucket based on its position in the day.
      // perHour = floor(dailyCapacity / 9 hours). Random minute+second for jitter.
      function trancheSlot(date: Date, positionInDay: number, dailyCapacity: number): Date {
        const perHour = Math.max(1, Math.floor(dailyCapacity / HOURS_IN_WINDOW));
        const hourBucket = Math.min(
          SEND_START_HOUR + Math.floor(positionInDay / perHour),
          SEND_END_HOUR - 1  // cap at 5 PM bucket (5–6 PM)
        );
        const d = new Date(date);
        d.setHours(hourBucket, Math.floor(Math.random() * 58), Math.floor(Math.random() * 60), 0);
        return d;
      }

      // Walk warmup curve to find how many days we need
      let tempIdx = 0, tempDay = 0;
      while (tempIdx < selectedContacts.length) {
        tempIdx += getDailyLimit(currentWarmupDay + tempDay);
        tempDay++;
      }
      const validDays = buildValidDays(tempDay + 5); // +5 buffer for conflict skips

      // ── Bucket contacts into warmup-safe daily slots → hourly tranches ────
      const queueRows: object[] = [];
      let idx = 0;
      let dayIndex = 0;

      while (idx < selectedContacts.length) {
        const capacity = getDailyLimit(currentWarmupDay + dayIndex); // warmup-safe
        const bucket = selectedContacts.slice(idx, idx + capacity);
        const sendDate = validDays[dayIndex];

        bucket.forEach((c, positionInDay) => {
          // Assign to hourly tranche based on position in this day's batch
          let sendAt = trancheSlot(sendDate, positionInDay, capacity);

          // Same-domain conflict: push to next day's same tranche
          if (conflictSet.has(c.id)) {
            const nextDay = validDays[dayIndex + 1] ?? validDays[validDays.length - 1];
            sendAt = trancheSlot(nextDay, positionInDay, capacity);
          }

          queueRows.push({
            campaign_id: camp.id,
            contact_id: c.id,
            domain_id: domainId,
            sequence_step: 1,
            scheduled_at: sendAt.toISOString(),
            status: 'queued',
          });
        });

        idx += capacity;
        dayIndex++;
      }

      // Single bulk insert — no N+1, works for 100 or 25,000 contacts
      await supabase.from('email_queue').insert(queueRows);
    }

    // Campaign is now active — the cron/queue worker will pick up and send
    // emails on their individual scheduled_at times. No immediate blast.

    router.push('/dashboard/campaigns');
  }

  const selectedDomain = domains.find(d => d.id === domainId);
  function personalizePreview(template: string, contact?: CampaignContact): string {
    const values: Record<string, string> = {
      name: contact?.name || 'there',
      email: contact?.email || 'contact@example.com',
      company: contact?.company_name || 'your company',
      company_name: contact?.company_name || 'your company',
      job_title: contact?.job_title || '',
      role: contact?.job_title || '',
      website: contact?.website || '',
      personalization: contact?.personalization || '',
      personalized_line: contact?.personalization || '',
    };
    return template.replace(/\{([a-z_]+)\}/gi, (match, key: string) => values[key.toLowerCase()] ?? match);
  }

  const previewContact = contacts.find(c => c.id === previewContactId) || contacts.find(c => selectedContactIds.has(c.id)) || contacts[0];
  const previewHtml = personalizePreview(previewContact?.custom_body?.trim() || bodyHtml, previewContact);
  const previewSubject = personalizePreview(previewContact?.custom_subject?.trim() || subject, previewContact);
  const sendingTo = selectedContactIds.size;

  const isPlain = templateMode === 'plain';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '820px' }}>
      <style>{newCampStyles}</style>

      {/* Header */}
      <div>
        <Link href="/dashboard/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: t.textMuted, textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}
          onMouseEnter={e => (e.currentTarget.style.color = t.text)}
          onMouseLeave={e => (e.currentTarget.style.color = t.textMuted)}
        >
          <ArrowLeft style={{ width: '14px', height: '14px' }} /> Back to Campaigns
        </Link>
        <h1 className="nc-page-title" style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>New Campaign</h1>
        <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Set up your outreach and start sending to your contacts</p>
      </div>

      {/* Stats strip */}
      <div className="nc-stats-strip">
        {[
          { icon: Users, label: 'Total Contacts', value: contacts.length },
          { icon: Globe, label: 'Domain', value: selectedDomain?.domain_name || '—' },
          { icon: Zap, label: 'Daily limit', value: selectedDomain ? `${Math.min(selectedDomain.daily_limit, 100)}/day (100 account cap)` : '—' },
          { icon: Send, label: 'Sending to', value: sendingTo, highlight: true },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '10px', background: (s as any).highlight ? t.accentSoft : t.card, border: `1px solid ${(s as any).highlight ? t.accent : t.border}` }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: t.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon style={{ width: '15px', height: '15px', color: t.accent }} />
              </div>
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, margin: 0 }}>{s.label}</p>
                <p style={{ fontSize: '15px', fontWeight: 700, color: (s as any).highlight ? t.accent : t.text, margin: '2px 0 0' }}>{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Name + Domain */}
        <div className="nc-form-row">
          <div style={card(t)}>
            <label style={lbl(t)}>Campaign Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CFO Financial Tools"
              style={inputStyle(t)}
              onFocus={e => (e.target.style.borderColor = t.accent)}
              onBlur={e => (e.target.style.borderColor = t.border)}
            />
          </div>
          <div style={card(t)}>
            <label style={lbl(t)}>Sending Domain *</label>
            <div style={{ position: 'relative' }}>
              <select value={domainId} onChange={e => {
                const newId = e.target.value;
                setDomainId(newId);
                const dom = domains.find(d => d.id === newId);
                if (dom) {
                  const pName = dom.product_name || 'FinModel';
                  if (templateMode === 'plain') {
                    const tpl = findTemplate(PRODUCT_TEMPLATES, pName) || PRODUCT_TEMPLATES['FinModel'];
                    setSubject(tpl.subject);
                    setBodyHtml(tpl.body);
                  } else {
                    const tpl = findTemplate(PRODUCT_BRANDED_TEMPLATES, pName) || PRODUCT_BRANDED_TEMPLATES['FinModel'];
                    setSubject(tpl.subject);
                    setBodyHtml(tpl.body);
                  }
                }
              }}
                style={{ ...inputStyle(t), appearance: 'none', paddingRight: '36px', cursor: 'pointer' }}>
                {domains.map(d => (
                  <option key={d.id} value={d.id}>{d.domain_name} ({d.from_email})</option>
                ))}
              </select>
              <ChevronDown style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', color: t.textMuted, pointerEvents: 'none' }} />
            </div>
          </div>
        </div>

        {/* Target Categories — Multi-select */}
        <div style={card(t)}>
          <label style={lbl(t)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Tag style={{ width: '13px', height: '13px' }} />
              Target Categories
              <span style={{ fontSize: '11px', color: t.textMuted, fontWeight: 400 }}>
                — select one or more categories, or leave empty for all contacts
              </span>
            </div>
          </label>

          {/* Selected category chips */}
          {selectedCategories.size > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {Array.from(selectedCategories).map(catId => {
                const cat = categories.find(c => c.id === catId);
                if (!cat) return null;
                return (
                  <div key={catId} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '5px 10px 5px 12px', borderRadius: '20px',
                    background: t.accentSoft, border: `1px solid ${t.accent}55`,
                    fontSize: '12px', fontWeight: 600, color: t.accent,
                    animation: 'fadeIn 200ms ease',
                  }}>
                    <Tag style={{ width: '11px', height: '11px' }} />
                    {cat.name}
                    <button
                      onClick={() => {
                        const next = new Set(selectedCategories);
                        next.delete(catId);
                        setSelectedCategories(next);
                      }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '50%', color: t.accent, transition: 'background 150ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = t.accent + '22')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <X style={{ width: '12px', height: '12px' }} />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={() => setSelectedCategories(new Set())}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '5px 12px', borderRadius: '20px',
                  background: t.coralSoft, border: `1px solid ${t.coral}44`,
                  fontSize: '11px', fontWeight: 600, color: t.coral,
                  cursor: 'pointer', transition: 'all 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = t.coral + '22')}
                onMouseLeave={e => (e.currentTarget.style.background = t.coralSoft)}
              >
                <X style={{ width: '11px', height: '11px' }} />
                Clear All
              </button>
            </div>
          )}

          {/* Dropdown trigger + menu */}
          <div ref={categoryDropdownRef} style={{ position: 'relative', zIndex: 50 }}>
            <button
              type="button"
              onClick={() => setCategoryDropdownOpen(v => !v)}
              style={{
                ...inputStyle(t),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', paddingRight: '36px',
                background: categoryDropdownOpen ? t.cardInner : t.cardInner,
                borderColor: categoryDropdownOpen ? t.accent : t.border,
              }}
            >
              <span style={{ color: selectedCategories.size === 0 ? t.textMuted : t.text, pointerEvents: 'none' }}>
                {selectedCategories.size === 0
                  ? '📋 All Pending Contacts (no filter)'
                  : `${selectedCategories.size} categor${selectedCategories.size === 1 ? 'y' : 'ies'} selected`}
              </span>
              <ChevronDown style={{
                position: 'absolute', right: '12px', top: '50%',
                transform: `translateY(-50%) rotate(${categoryDropdownOpen ? '180deg' : '0deg'})`,
                width: '15px', height: '15px', color: t.textMuted,
                transition: 'transform 200ms ease',
                pointerEvents: 'none'
              }} />
            </button>

            {categoryDropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '6px',
                background: t.card, border: `1px solid ${t.border}`,
                borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                zIndex: 50, maxHeight: '280px', overflowY: 'auto',
                animation: 'fadeIn 150ms ease',
              }}>
                {/* Select All / Clear header */}
                <div style={{
                  padding: '12px 16px', borderBottom: `1px solid ${t.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: t.cardInner, borderRadius: '12px 12px 0 0',
                  position: 'sticky', top: 0, zIndex: 1,
                }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted }}>Mail Categories</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setSelectedCategories(new Set(categories.map(c => c.id)))}
                      style={{
                        padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        background: t.accentSoft, border: `1px solid ${t.accent}44`, color: t.accent,
                        cursor: 'pointer',
                      }}
                    >Select All</button>
                    <button
                      onClick={() => setSelectedCategories(new Set())}
                      style={{
                        padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        background: t.card, border: `1px solid ${t.border}`, color: t.textMuted,
                        cursor: 'pointer',
                      }}
                    >Clear</button>
                  </div>
                </div>

                {categories.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: t.textMuted, fontSize: '13px' }}>
                    No categories yet. <Link href="/dashboard/categories/new" style={{ color: t.accent, textDecoration: 'none', fontWeight: 600 }}>Create one →</Link>
                  </div>
                ) : (
                  categories.map((cat, i) => {
                    const isChecked = selectedCategories.has(cat.id);
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          const next = new Set(selectedCategories);
                          if (isChecked) next.delete(cat.id);
                          else next.add(cat.id);
                          setSelectedCategories(next);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                          padding: '12px 16px', border: 'none',
                          borderBottom: i < categories.length - 1 ? `1px solid ${t.borderLight}` : 'none',
                          background: isChecked ? t.accentSoft : 'transparent',
                          cursor: 'pointer', textAlign: 'left', fontFamily: t.font,
                          transition: 'background 150ms ease',
                        }}
                        onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = t.cardInner; }}
                        onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                          border: `2px solid ${isChecked ? t.accent : t.border}`,
                          background: isChecked ? t.accent : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 200ms ease',
                        }}>
                          {isChecked && <Check style={{ width: '12px', height: '12px', color: '#fff' }} />}
                        </div>
                        {/* Label */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '14px', fontWeight: isChecked ? 600 : 500, color: isChecked ? t.accent : t.text }}>{cat.name}</p>
                        </div>
                        {/* Badge */}
                        <span style={{
                          fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                          borderRadius: '20px', background: isChecked ? t.accent + '22' : t.cardInner,
                          color: isChecked ? t.accent : t.textMuted,
                          border: `1px solid ${isChecked ? t.accent + '44' : t.borderLight}`,
                        }}>
                          {cat.name.slice(0, 2).toUpperCase()}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Info line */}
          <p style={{ marginTop: '8px', fontSize: '12px', color: t.textMuted }}>
            {selectedCategories.size === 0
              ? '📬 No filter applied — campaign will target all pending contacts'
              : `🎯 Targeting contacts from ${selectedCategories.size} categor${selectedCategories.size === 1 ? 'y' : 'ies'}`}
          </p>
        </div>

        {/* Recipient count & selection */}
        {contacts.length > 0 && (
          <div style={{ ...card(t), padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t.cardInner }}>
              <label style={{ ...lbl(t), marginBottom: 0 }}>Select Contacts for Campaign</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setSelectedContactIds(new Set(contacts.slice(0, 10).map(c => c.id)))}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: t.card, border: `1px solid ${t.border}`, color: t.textSec, cursor: 'pointer' }}>
                  First 10
                </button>
                <button onClick={() => setSelectedContactIds(new Set(contacts.slice(0, 50).map(c => c.id)))}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: t.card, border: `1px solid ${t.border}`, color: t.textSec, cursor: 'pointer' }}>
                  First 50
                </button>
                <button onClick={() => setSelectedContactIds(new Set(contacts.slice(0, 100).map(c => c.id)))}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: t.card, border: `1px solid ${t.border}`, color: t.textSec, cursor: 'pointer' }}>
                  First 100
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderLeft: `1px solid ${t.border}`, paddingLeft: '8px', marginLeft: '4px' }}>
                  <span style={{ fontSize: '11px', color: t.textMuted }}>Custom:</span>
                  <input type="number" min={1} max={contacts.length} value={rangeStart} onChange={e => setRangeStart(e.target.value ? Number(e.target.value) : '')} placeholder="1" style={{ width: '40px', padding: '4px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${t.border}`, background: t.cardInner, color: t.text }} />
                  <span style={{ fontSize: '11px', color: t.textMuted }}>to</span>
                  <input type="number" min={1} max={contacts.length} value={rangeEnd} onChange={e => setRangeEnd(e.target.value ? Number(e.target.value) : '')} placeholder={contacts.length.toString()} style={{ width: '40px', padding: '4px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${t.border}`, background: t.cardInner, color: t.text }} />
                  <button onClick={() => {
                    const start = Math.max(1, Number(rangeStart) || 1);
                    const end = Math.min(contacts.length, Number(rangeEnd) || contacts.length);
                    if (start <= end) {
                      setSelectedContactIds(new Set(contacts.slice(start - 1, end).map(c => c.id)));
                    }
                  }} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: t.accentSoft, border: `1px solid ${t.accent}`, color: t.accent, cursor: 'pointer' }}>
                    Select
                  </button>
                </div>
                <div style={{ width: '1px', background: t.border, margin: '0 4px' }} />
                <button onClick={() => setSelectedContactIds(new Set(contacts.map(c => c.id)))}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: selectedContactIds.size === contacts.length ? t.accent : t.card, border: `1px solid ${selectedContactIds.size === contacts.length ? t.accent : t.border}`, color: selectedContactIds.size === contacts.length ? '#fff' : t.textSec, cursor: 'pointer' }}>
                  Select All
                </button>
                <button onClick={() => setSelectedContactIds(new Set())}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: selectedContactIds.size === 0 ? t.coralSoft : t.card, border: `1px solid ${selectedContactIds.size === 0 ? t.coral : t.border}`, color: selectedContactIds.size === 0 ? t.coral : t.textSec, cursor: 'pointer' }}>
                  Clear
                </button>
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: '13px', color: t.textMuted }}>
                Targeting <strong style={{ color: t.text }}>{sendingTo} of {contacts.length}</strong> contacts in this list.
              </p>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: t.cardInner, borderBottom: `1px solid ${t.border}` }}>
                    <th style={{ padding: '12px 20px', width: '40px' }}>
                      <input type="checkbox" 
                        checked={selectedContactIds.size === contacts.length && contacts.length > 0} 
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedContactIds(new Set(contacts.map(c => c.id)));
                          } else {
                            setSelectedContactIds(new Set());
                          }
                        }}
                        style={{ accentColor: t.accent, cursor: 'pointer', transform: 'scale(1.1)' }} 
                      />
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textMuted, letterSpacing: '0.05em', textAlign: 'left' }}>Name</th>
                    <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textMuted, letterSpacing: '0.05em', textAlign: 'left' }}>Email</th>
                    <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textMuted, letterSpacing: '0.05em', textAlign: 'left' }}>Company</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => {
                    const isSelected = selectedContactIds.has(c.id);
                    return (
                      <tr key={c.id} 
                        style={{ borderBottom: i < contacts.length - 1 ? `1px solid ${t.borderLight}` : 'none', background: isSelected ? t.accentSoft : 'transparent', transition: 'background 150ms ease' }}>
                        <td style={{ padding: '10px 20px' }}>
                          <input type="checkbox" 
                            checked={isSelected}
                            onChange={() => {
                              const newSet = new Set(selectedContactIds);
                              if (isSelected) newSet.delete(c.id);
                              else newSet.add(c.id);
                              setSelectedContactIds(newSet);
                            }}
                            style={{ accentColor: t.accent, cursor: 'pointer', transform: 'scale(1.1)' }}
                          />
                        </td>
                        <td style={{ padding: '10px 20px', fontWeight: 500, color: t.text }}>{c.name || '—'}</td>
                        <td style={{ padding: '10px 20px', color: t.textMuted }}>{c.email}</td>
                        <td style={{ padding: '10px 20px', color: t.textMuted }}>{c.company_name || '—'}{c.custom_body ? ' · custom email' : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AI per-recipient personalization */}
        <div style={{ ...card(t), border: `1px solid ${t.accent}55`, background: t.accentSoft }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
            <Sparkles style={{ width: '18px', height: '18px', color: t.accent, marginTop: '2px', flexShrink: 0 }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: t.text }}>AI Personalize Selected</h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: t.textMuted, lineHeight: 1.5 }}>
                Generates and saves a distinct subject, opening, and body for each selected contact. It does not send email.
              </p>
            </div>
          </div>
          <div style={{ padding: '14px', borderRadius: '10px', border: `1px dashed ${t.accent}88`, background: t.card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileSpreadsheet style={{ width: '18px', height: '18px', color: t.accent }} />
                <div>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: t.text }}>Upload prepared personalized emails</p>
                  <p style={{ margin: '3px 0 0', fontSize: '11px', color: t.textMuted }}>Excel/CSV columns: Email, Subject, Body or Mail. Optional: Name, Company, Job Title, Website, Personalization.</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href="/personalized-email-import-template.xlsx"
                  download
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 14px', borderRadius: '9px', background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
                >
                  <Download style={{ width: '14px', height: '14px' }} />
                  Download sample template
                </a>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 14px', borderRadius: '9px', background: t.cardInner, border: `1px solid ${t.accent}`, color: t.accent, fontSize: '12px', fontWeight: 700, cursor: sheetImporting ? 'wait' : 'pointer' }}>
                  <Upload style={{ width: '14px', height: '14px' }} />
                  {sheetImporting ? 'Importing…' : 'Choose Excel / CSV'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    disabled={sheetImporting}
                    style={{ display: 'none' }}
                    onChange={async e => {
                      const input = e.currentTarget;
                      const selectedFile = input.files?.[0];
                      if (selectedFile) await importPersonalizedSheet(selectedFile);
                      input.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            {sheetImportStatus && <p style={{ margin: '10px 0 0', fontSize: '12px', color: sheetImportStatus.startsWith('✓') ? t.green : t.textMuted }}>{sheetImportStatus}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 16px' }}>
            <div style={{ height: '1px', background: t.border, flex: 1 }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>or generate with AI</span>
            <div style={{ height: '1px', background: t.border, flex: 1 }} />
          </div>
          <label style={lbl(t)}>Optional personalization brief</label>
          <textarea
            value={personalizationBrief}
            onChange={e => setPersonalizationBrief(e.target.value)}
            rows={3}
            placeholder="Example: Focus on reducing financial-model preparation time. Keep the tone founder-to-founder and ask whether a 10-minute demo would help."
            style={{ ...inputStyle(t), resize: 'vertical', marginBottom: '12px', background: t.card }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={personalizeSelectedContacts}
              disabled={personalizing || selectedContactIds.size === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '9px', border: 'none', background: t.accent, color: '#fff', fontSize: '12px', fontWeight: 700, cursor: personalizing ? 'wait' : 'pointer', opacity: selectedContactIds.size === 0 ? 0.55 : 1, fontFamily: t.font }}
            >
              <Sparkles style={{ width: '14px', height: '14px' }} />
              {personalizing ? 'Generating…' : `Personalize ${selectedContactIds.size} selected`}
            </button>
            <button
              onClick={clearSelectedPersonalization}
              disabled={personalizing || selectedContactIds.size === 0}
              style={{ padding: '9px 14px', borderRadius: '9px', border: `1px solid ${t.border}`, background: t.card, color: t.textSec, fontSize: '12px', fontWeight: 600, cursor: personalizing ? 'wait' : 'pointer', fontFamily: t.font }}
            >
              Clear selected copy
            </button>
            {personalizationStatus && <span style={{ fontSize: '12px', color: personalizationStatus.startsWith('✓') ? t.green : t.textMuted }}>{personalizationStatus}</span>}
          </div>
          {contacts.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <label style={lbl(t)}>Preview recipient</label>
              <select value={previewContact?.id || ''} onChange={e => { setPreviewContactId(e.target.value); setPreview(true); }} style={{ ...inputStyle(t), background: t.card }}>
                {contacts.filter(c => selectedContactIds.has(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.email}{c.company_name ? ` — ${c.company_name}` : ''}{c.custom_body ? ' (personalized)' : ''}</option>
                ))}
              </select>
            </div>
          )}
          <p style={{ margin: '12px 0 0', fontSize: '11px', color: t.textMuted }}>
            Requires the deployed <code>personalize-contacts</code> Edge Function and <code>GEMINI_API_KEY</code>. Missing facts are never intentionally invented, but AI output should still be reviewed.
          </p>
        </div>

        {/* Template picker */}
        <div style={card(t)}>
          <label style={lbl(t)}>Email Style</label>
          <div className="nc-template-grid">
            {[
              {
                mode: 'plain' as const,
                icon: Inbox,
                title: 'Plain Text',
                desc: 'Lands in Primary inbox',
                badge: '📥 Best for cold email',
                color: t.green,
                soft: t.greenSoft,
              },
              {
                mode: 'branded' as const,
                icon: Sparkles,
                title: 'Branded HTML',
                desc: `Premium design for ${selectedDomain?.product_name || 'your brand'}`,
                badge: '✨ Looks stunning',
                color: '#a78bfa',
                soft: 'rgba(124,58,237,0.1)',
              },
            ].map(opt => {
              const Icon = opt.icon;
              const active = templateMode === opt.mode;
              return (
                <button key={opt.mode} onClick={() => switchTemplate(opt.mode)}
                  style={{ textAlign: 'left', padding: '16px', borderRadius: '12px', border: `2px solid ${active ? opt.color : t.border}`, background: active ? opt.soft : 'transparent', cursor: 'pointer', fontFamily: t.font, transition: 'all 150ms' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Icon style={{ width: '16px', height: '16px', color: active ? opt.color : t.textMuted }} />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: active ? opt.color : t.text }}>{opt.title}</span>
                    {active && <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, color: opt.color, background: opt.soft, border: `1px solid ${opt.color}`, borderRadius: '20px', padding: '2px 8px' }}>ACTIVE</span>}
                  </div>
                  <p style={{ fontSize: '12px', color: t.textMuted, margin: '0 0 6px' }}>{opt.desc}</p>
                  <p style={{ fontSize: '11px', color: opt.color, margin: 0, fontWeight: 600 }}>{opt.badge}</p>
                </button>
              );
            })}
          </div>
          {templateMode === 'branded' && (
            <p style={{ fontSize: '12px', color: t.amber, marginTop: '10px', padding: '8px 12px', background: t.amberSoft, borderRadius: '8px' }}>
              ⚠️ HTML emails may land in <strong>Promotions</strong> tab. Use Plain Text to reach Primary inbox.
            </p>
          )}
        </div>

        {/* Subject */}
        <div style={card(t)}>
          <label style={lbl(t)}>Subject Line * <span style={{ fontSize: '11px', color: t.textMuted, fontWeight: 400 }}>— supports {'{name}'}, {'{company}'}, {'{job_title}'}, {'{website}'}, {'{personalization}'}</span></label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Hi {name}, quick question…"
            style={inputStyle(t)}
            onFocus={e => (e.target.style.borderColor = t.accent)}
            onBlur={e => (e.target.style.borderColor = t.border)}
          />
          {subject && (
            <p style={{ marginTop: '8px', fontSize: '12px', color: t.textMuted }}>
              <span style={{ fontWeight: 600 }}>Preview:</span> {previewSubject}
            </p>
          )}
        </div>

        {/* Body */}
        <div style={card(t)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ ...lbl(t), marginBottom: 0 }}>
              Email Body * <span style={{ fontSize: '11px', color: t.textMuted, fontWeight: 400 }}>— use contact/company placeholders; imported Custom Body overrides this per recipient</span>
            </label>
            <button onClick={() => setPreview(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: t.textSec, fontFamily: t.font }}>
              {preview ? <EyeOff style={{ width: '13px', height: '13px' }} /> : <Eye style={{ width: '13px', height: '13px' }} />}
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {preview ? (
            <div style={{ border: `1px solid ${t.border}`, borderRadius: '10px', overflow: 'hidden', minHeight: '300px' }}>
              {isPlain ? (
                <pre style={{ margin: 0, padding: '20px 24px', background: '#fff', fontSize: '14px', lineHeight: 1.8, color: '#111', whiteSpace: 'pre-wrap', fontFamily: 'Georgia,serif' }}>
                  {previewHtml}
                </pre>
              ) : (
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: '100%', minHeight: '400px', border: 'none', display: 'block' }}
                  title="Email Preview"
                />
              )}
            </div>
          ) : (
            <textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} rows={isPlain ? 10 : 14}
              style={{ ...inputStyle(t), resize: 'vertical', fontFamily: isPlain ? t.font : t.mono, fontSize: '13px', lineHeight: 1.6 }}
              onFocus={e => (e.target.style.borderColor = t.accent)}
              onBlur={e => (e.target.style.borderColor = t.border)}
            />
          )}
        </div>

        {/* ── Bounce Email ──────────────────────────────────────────────── */}
        <div style={card(t)}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: bounceEnabled ? '20px' : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: t.coralSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle style={{ width: '16px', height: '16px', color: t.coral }} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: t.text }}>Bounce Email</p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: t.textMuted }}>Auto-send this email when a message bounces back</p>
              </div>
            </div>
            {/* Toggle */}
            <button
              onClick={() => setBounceEnabled(v => !v)}
              style={{ flexShrink: 0, width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative', background: bounceEnabled ? t.coral : t.border, transition: 'background 200ms' }}
            >
              <span style={{ position: 'absolute', top: '3px', left: bounceEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 200ms', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </button>
          </div>

          {bounceEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={lbl(t)}>Bounce Subject <span style={{ fontSize: '11px', color: t.textMuted, fontWeight: 400 }}>— use {'{name}'} for personalisation</span></label>
                <input
                  value={bounceSubject}
                  onChange={e => setBounceSubject(e.target.value)}
                  placeholder="e.g. Sorry to bother, {name} — just checking in"
                  style={inputStyle(t)}
                  onFocus={e => (e.target.style.borderColor = t.coral)}
                  onBlur={e => (e.target.style.borderColor = t.border)}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ ...lbl(t), marginBottom: 0 }}>Bounce Email Body</label>
                  <button onClick={() => setBouncePreview(p => !p)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: t.textSec, fontFamily: t.font }}>
                    {bouncePreview ? <EyeOff style={{ width: '13px', height: '13px' }} /> : <Eye style={{ width: '13px', height: '13px' }} />}
                    {bouncePreview ? 'Edit' : 'Preview'}
                  </button>
                </div>
                {bouncePreview ? (
                  <div style={{ border: `1px solid ${t.border}`, borderRadius: '10px', overflow: 'hidden', minHeight: '160px' }}>
                    <pre style={{ margin: 0, padding: '20px 24px', background: '#fff', fontSize: '14px', lineHeight: 1.8, color: '#111', whiteSpace: 'pre-wrap', fontFamily: 'Georgia,serif' }}>
                      {bounceBody.replace(/\{name\}/gi, contacts[0]?.name || 'there')}
                    </pre>
                  </div>
                ) : (
                  <textarea
                    value={bounceBody}
                    onChange={e => setBounceBody(e.target.value)}
                    rows={6}
                    placeholder={`Hi {name},\n\nWe noticed our previous email didn't reach you. Here's what we wanted to share...\n\nBest,\nYour Team`}
                    style={{ ...inputStyle(t), resize: 'vertical', lineHeight: 1.6 }}
                    onFocus={e => (e.target.style.borderColor = t.coral)}
                    onBlur={e => (e.target.style.borderColor = t.border)}
                  />
                )}
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: t.coralSoft, border: `1px solid ${t.coral}22`, fontSize: '12px', color: t.coral, fontWeight: 500 }}>
                🔄 This email is sent automatically to the same address when a hard / soft bounce is detected by the sending domain.
              </div>
            </div>
          )}
        </div>

        {/* ── Follow-up Email ───────────────────────────────────────────── */}
        <div style={card(t)}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: followUpEnabled ? '20px' : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: t.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <RefreshCw style={{ width: '16px', height: '16px', color: t.amber }} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: t.text }}>Follow-up Email <span style={{ fontSize: '11px', fontWeight: 500, color: t.amber, marginLeft: '6px', background: t.amberSoft, border: `1px solid ${t.amber}44`, borderRadius: '20px', padding: '2px 8px' }}>if not opened</span></p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: t.textMuted }}>Send a follow-up if the recipient never opened your first email</p>
              </div>
            </div>
            {/* Toggle */}
            <button
              onClick={() => setFollowUpEnabled(v => !v)}
              style={{ flexShrink: 0, width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative', background: followUpEnabled ? t.amber : t.border, transition: 'background 200ms' }}
            >
              <span style={{ position: 'absolute', top: '3px', left: followUpEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 200ms', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </button>
          </div>

          {followUpEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Delay */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', background: t.amberSoft, border: `1px solid ${t.amber}33` }}>
                <Clock style={{ width: '15px', height: '15px', color: t.amber, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: t.text, fontWeight: 500 }}>Send follow-up after</span>
                <input
                  type="number" min={1} max={30}
                  value={followUpDelayDays}
                  onChange={e => setFollowUpDelayDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                  style={{ width: '60px', padding: '5px 10px', borderRadius: '8px', border: `1px solid ${t.amber}55`, background: t.card, color: t.text, fontSize: '13px', fontWeight: 700, textAlign: 'center' }}
                />
                <span style={{ fontSize: '13px', color: t.textMuted }}>day{followUpDelayDays === 1 ? '' : 's'} if recipient has not opened</span>
              </div>

              <div>
                <label style={lbl(t)}>Follow-up Subject <span style={{ fontSize: '11px', color: t.textMuted, fontWeight: 400 }}>— use {'{name}'} for personalisation</span></label>
                <input
                  value={followUpSubject}
                  onChange={e => setFollowUpSubject(e.target.value)}
                  placeholder={`e.g. {name} — just following up`}
                  style={inputStyle(t)}
                  onFocus={e => (e.target.style.borderColor = t.amber)}
                  onBlur={e => (e.target.style.borderColor = t.border)}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ ...lbl(t), marginBottom: 0 }}>Follow-up Email Body</label>
                  <button onClick={() => setFollowUpPreview(p => !p)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: t.textSec, fontFamily: t.font }}>
                    {followUpPreview ? <EyeOff style={{ width: '13px', height: '13px' }} /> : <Eye style={{ width: '13px', height: '13px' }} />}
                    {followUpPreview ? 'Edit' : 'Preview'}
                  </button>
                </div>
                {followUpPreview ? (
                  <div style={{ border: `1px solid ${t.border}`, borderRadius: '10px', overflow: 'hidden', minHeight: '160px' }}>
                    <pre style={{ margin: 0, padding: '20px 24px', background: '#fff', fontSize: '14px', lineHeight: 1.8, color: '#111', whiteSpace: 'pre-wrap', fontFamily: 'Georgia,serif' }}>
                      {followUpBody.replace(/\{name\}/gi, contacts[0]?.name || 'there')}
                    </pre>
                  </div>
                ) : (
                  <textarea
                    value={followUpBody}
                    onChange={e => setFollowUpBody(e.target.value)}
                    rows={6}
                    placeholder={`Hi {name},\n\nI wanted to circle back on my previous email. Did you get a chance to look at it?\n\nWould love to connect. Happy to answer any questions.\n\nBest,\nYour Team`}
                    style={{ ...inputStyle(t), resize: 'vertical', lineHeight: 1.6 }}
                    onFocus={e => (e.target.style.borderColor = t.amber)}
                    onBlur={e => (e.target.style.borderColor = t.border)}
                  />
                )}
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: t.amberSoft, border: `1px solid ${t.amber}22`, fontSize: '12px', color: t.amber, fontWeight: 500 }}>
                📬 The follow-up will only be sent to contacts who haven't opened the original email after {followUpDelayDays} day{followUpDelayDays === 1 ? '' : 's'}.
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: t.coralSoft, border: `1px solid ${t.coral}`, color: t.coral, fontSize: '13px', fontWeight: 500 }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="nc-actions">
        <Link href="/dashboard/campaigns"
          style={{ padding: '10px 20px', borderRadius: '10px', border: `1px solid ${t.border}`, background: 'none', color: t.textSec, fontSize: '13px', fontWeight: 500, cursor: 'pointer', textDecoration: 'none', fontFamily: t.font }}>
          Cancel
        </Link>
        <button onClick={() => handleCreate(false)} disabled={loading}
          style={{ padding: '10px 20px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: '13px', fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: t.font }}>
          {loading && !sending ? 'Saving…' : 'Save as Draft'}
        </button>
        <button onClick={() => handleCreate(true)} disabled={loading || contacts.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', borderRadius: '10px', background: t.accent, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: (loading || contacts.length === 0) ? 'not-allowed' : 'pointer', border: 'none', fontFamily: t.font, opacity: contacts.length === 0 ? 0.5 : 1 }}>
          <Send style={{ width: '14px', height: '14px' }} />
          {sending ? 'Sending…' : `Launch & Send to ${sendingTo} Contact${sendingTo !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
