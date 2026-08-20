-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Email Templates (Variants) + Domain Time Windows
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Email templates table — multiple variants per domain
CREATE TABLE IF NOT EXISTS email_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id   UUID REFERENCES domains(id) ON DELETE CASCADE,
    variant_id  TEXT NOT NULL,          -- 'A', 'B', 'C', 'D', 'E'
    subject     TEXT NOT NULL,
    body_html   TEXT NOT NULL,
    send_count  INT DEFAULT 0,          -- how many times this variant was used
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(domain_id, variant_id)
);

-- 2. Add time window columns to domains (morning/afternoon/evening personality)
ALTER TABLE domains
    ADD COLUMN IF NOT EXISTS send_hour_start INT DEFAULT 9,   -- 9 = 9am IST
    ADD COLUMN IF NOT EXISTS send_hour_end   INT DEFAULT 20;  -- 20 = 8pm IST

-- 3. Set personality time windows for each domain
-- FinModel = morning person (9am–12pm)
-- AIMLSchool = afternoon person (1pm–5pm)
-- InvestorRaise = evening person (5pm–8pm)
UPDATE domains SET send_hour_start = 9,  send_hour_end = 12 WHERE domain_name LIKE '%financialmodel%';
UPDATE domains SET send_hour_start = 13, send_hour_end = 17 WHERE domain_name LIKE '%aimlschool%';
UPDATE domains SET send_hour_start = 17, send_hour_end = 20 WHERE domain_name LIKE '%investorraise%';

-- 4. Seed email templates for financialmodel.io
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'A',
    '{name} — quick question about financial modeling',
    E'Hi {name},\n\nI''ve been building an AI tool that creates investor-ready financial models in about 10 minutes from any annual report or PDF.\n\nTook us a while to get right, but it now does in minutes what used to take a week of manual work.\n\nWould love to know if that''s useful for what you''re working on.\n\nPrince\nfinancialmodel.io'
FROM domains WHERE domain_name LIKE '%financialmodel%'
ON CONFLICT DO NOTHING;

INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'B',
    'financial models in 10 minutes?',
    E'Hey {name},\n\nQuick question — how much time does your team spend on financial modeling each month?\n\nI built something that might cut that down significantly. It''s an AI tool that turns company PDFs into fully-linked 3-statement models automatically.\n\nHappy to give you access and walk you through it if you''re curious.\n\nPrince\nfinancialmodel.io'
FROM domains WHERE domain_name LIKE '%financialmodel%'
ON CONFLICT DO NOTHING;

INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'C',
    '{name} — thought this might be relevant',
    E'{name},\n\nNot sure if this is relevant to you, but I recently launched an AI-powered financial modeling tool and wanted to get your thoughts.\n\nIt generates complete 3-statement models from any company''s annual reports in minutes — no Excel formulas, no manual data entry.\n\nWould this be useful for what you are working on?\n\nPrince\nfinancialmodel.io'
FROM domains WHERE domain_name LIKE '%financialmodel%'
ON CONFLICT DO NOTHING;

INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'D',
    'AI for financial modeling',
    E'Hi {name},\n\nSaw your profile and thought this might interest you. I''m working on an AI tool that generates 3-statement financial models automatically from PDFs and annual reports.\n\nThe idea is simple: upload a document, get a complete model in minutes instead of days.\n\nWould it make sense to chat for 15 minutes?\n\nPrince\nfinancialmodel.io'
FROM domains WHERE domain_name LIKE '%financialmodel%'
ON CONFLICT DO NOTHING;

INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'E',
    '{name} — do you work with financial models?',
    E'{name},\n\nDo you ever work with financial models? I built a tool that creates them with AI in minutes. Fully automated from company documents.\n\nWould love your feedback if you have 10 minutes.\n\nPrince\nfinancialmodel.io'
FROM domains WHERE domain_name LIKE '%financialmodel%'
ON CONFLICT DO NOTHING;

-- 5. Seed templates for aimlschool360.com (REAL copy from brand)
-- Brand: Inter font, #0D7377 teal, #FFFAF5 cream bg, 7+ years, 1500+ placements

-- Variant A: plain text — "AI/ML skills that land jobs"
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'A',
    'AI/ML skills that land jobs',
    E'Hi {name},\n\nAIML School 360 has spent 7+ years helping professionals master AI and ML through our trusted offline training.\n\nNow, we''re bringing our proven methodology online so you can access industry-ready education from anywhere.\n\nWith over 1,500 successful placements, our programs are designed to turn curious minds into AI leaders. Are you open to exploring how we can accelerate your career in AI?\n\nBest,\nPrince\naimlschool360.com'
FROM domains WHERE domain_name LIKE '%aimlschool%'
ON CONFLICT DO NOTHING;

-- Variant B: plain text — "Accelerate your AI career trajectory"
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'B',
    'Accelerate your AI career trajectory',
    E'Hi {name},\n\nLooking to break into the AI space or level up your current skills?\n\nAt AIML School 360, we offer industry-ready AI education backed by a proven placement framework at top MNCs.\n\nOur online programs give you the exact curriculum that has already led to 1,500+ successful career transitions. Mind if I send over our course syllabus for you to review?\n\nBest,\nPrince\naimlschool360.com'
FROM domains WHERE domain_name LIKE '%aimlschool%'
ON CONFLICT DO NOTHING;

-- Variant C: plain text — "Your next step in AI/ML"
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'C',
    'Your next step in AI/ML',
    E'Hi {name},\n\nIt''s an exciting time to build a career in AI, and having the right foundation makes all the difference.\n\nWe''ve transitioned our proven 7+ year offline curriculum at AIML School 360 into an accessible online program with guaranteed job assistance.\n\nIf you''re looking for practical, industry-aligned AI education, we can help. Let me know if you''d like to chat about our upcoming cohorts.\n\nBest,\nPrince\naimlschool360.com'
FROM domains WHERE domain_name LIKE '%aimlschool%'
ON CONFLICT DO NOTHING;

-- Variant D: branded HTML — Inter font, #0D7377 teal, #FFFAF5 cream
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'D',
    'Where curious minds become AI leaders',
    '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIML School 360</title>
  <style type="text/css">
    @import url(''https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap'');
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FFFAF5;font-family:''Inter'',-apple-system,sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FFFAF5;padding:40px 15px;">
    <tr><td align="center">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.06);padding:40px;text-align:left;">
        <tr><td style="padding-bottom:30px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#0D7377;border-radius:12px;width:40px;height:40px;text-align:center;vertical-align:middle;">
              <span style="color:#ffffff;font-family:''Inter'',sans-serif;font-size:14px;font-weight:800;">AI</span>
            </td>
            <td style="padding-left:8px;">
              <span style="font-family:''Inter'',sans-serif;font-size:20px;font-weight:700;color:#1A1A1A;letter-spacing:-0.02em;">MLSchool<span style="color:#0D7377;">360</span></span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
            <td style="padding:4px 12px;border-radius:30px;border:1px solid rgba(249,115,22,0.2);background-color:#FFF4ED;">
              <span style="color:#EA580C;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;font-family:''Inter'',sans-serif;">Guaranteed Job Assistance</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <h1 style="margin:0;color:#1A1A1A;font-family:''Inter'',sans-serif;font-size:32px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;">Where curious minds become <span style="color:#0D7377;">AI leaders</span></h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0;color:#5C5C5C;font-family:''Inter'',sans-serif;font-size:16px;line-height:1.6;">Hi {name},</p><br>
          <p style="margin:0;color:#5C5C5C;font-family:''Inter'',sans-serif;font-size:16px;line-height:1.6;">With over <strong style="color:#1A1A1A;">7+ years of trusted offline training</strong> and 1,500+ successful placements, we know exactly what it takes to break into the AI space.</p><br>
          <p style="margin:0;color:#5C5C5C;font-family:''Inter'',sans-serif;font-size:16px;line-height:1.6;">We are now bringing our proven methodology online, so you can access industry-ready AI and ML education from anywhere. Get real placement support, personalized coaching, and a curriculum built by experts.</p>
        </td></tr>
        <tr><td style="padding-bottom:40px;padding-top:10px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:30px;background-color:#0D7377;box-shadow:0 8px 24px rgba(13,115,119,0.2);">
              <a href="https://aimlschool360.com" style="font-family:''Inter'',sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;padding:16px 32px;display:inline-block;border-radius:30px;">Explore Programs</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="border-top:1px solid #E5DDD5;padding-top:24px;">
          <p style="margin:0;color:#1A1A1A;font-family:''Inter'',sans-serif;font-size:14px;font-weight:600;">Best,</p>
          <p style="margin:4px 0 0 0;color:#8C8C8C;font-family:''Inter'',sans-serif;font-size:14px;">Prince<br>AIML School 360</p>
        </td></tr>
      </table>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;"><tr>
        <td align="center" style="padding-top:20px;">
          <p style="margin:0;color:#8C8C8C;font-family:''Inter'',sans-serif;font-size:11px;line-height:1.5;">
            <a href="#" style="color:#8C8C8C;text-decoration:underline;">Unsubscribe</a> | <a href="https://aimlschool360.com" style="color:#8C8C8C;text-decoration:none;">aimlschool360.com</a>
          </p>
        </td>
      </tr></table>
    </td></tr>
  </table>
</body>
</html>'
FROM domains WHERE domain_name LIKE '%aimlschool%'
ON CONFLICT DO NOTHING;

-- 6. Seed templates for investorraise.com (REAL copy from brand)
-- Variant A: plain text — "Quick question about your fundraise"
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'A',
    'Quick question about your fundraise',
    E'Hi {name},\n\nI noticed you''re currently raising and wanted to reach out. We built InvestorRaise to help founders get AI-crafted, personalized pitches in front of our network of 10,000+ verified VCs and angels across India.\n\nAre you open to exploring a new channel for your round?\n\nBest,\nPrince\ninvestorraise.com'
FROM domains WHERE domain_name LIKE '%investorraise%'
ON CONFLICT DO NOTHING;

-- Variant B: plain text — "Connecting with the right investors in India"
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'B',
    'Connecting with the right investors in India',
    E'Hi {name},\n\nRaising capital is exhausting when you''re sending generic pitches. At InvestorRaise, we automate personalized outreach to 10,000+ verified Indian investors so you can focus on building.\n\nWould you be opposed to seeing how it works for your startup?\n\nCheers,\nPrince\ninvestorraise.com'
FROM domains WHERE domain_name LIKE '%investorraise%'
ON CONFLICT DO NOTHING;

-- Variant C: plain text — "Streamline your investor outreach"
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'C',
    'Streamline your investor outreach',
    E'Hey {name},\n\nFinding investors who actually matter for your stage and sector takes too much time. InvestorRaise gives you AI-personalized pitches and direct access to 10,000+ verified VCs and angels in India.\n\nLet me know if you have 5 minutes next week to see a quick demo.\n\nThanks,\nPrince\ninvestorraise.com'
FROM domains WHERE domain_name LIKE '%investorraise%'
ON CONFLICT DO NOTHING;

-- Variant D: branded HTML — Cormorant Garamond + DM Sans, green/dark palette
INSERT INTO email_templates (domain_id, variant_id, subject, body_html)
SELECT id, 'D',
    'Connect with investors who matter',
    '<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connect with investors who matter</title>
<style>
  @import url(''https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap'');
</style>
</head>
<body style="margin:0;padding:40px 20px;background-color:#F9F7F4;font-family:''DM Sans'',Arial,sans-serif;color:#5A5A5A;">
  <div style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px -6px rgba(0,0,0,0.08);">
    <div style="padding:32px 40px;text-align:center;border-bottom:1px solid #F0F0F0;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td valign="middle" style="padding-right:12px;">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3A5A3A 0%,#5A7A5A 100%);text-align:center;line-height:36px;">
              <span style="color:#fff;font-weight:700;font-size:18px;">IR</span>
            </div>
          </td>
          <td valign="middle">
            <span style="font-family:''Cormorant Garamond'',Georgia,serif;font-size:24px;font-weight:600;color:#151515;letter-spacing:-0.02em;">
              Investor<span style="color:#4A6A4A;">Raise</span>
            </span>
          </td>
        </tr>
      </table>
    </div>
    <div style="padding:48px 40px;">
      <h1 style="font-family:''Cormorant Garamond'',Georgia,serif;font-size:36px;font-weight:400;color:#151515;margin:0 0 24px 0;line-height:1.1;letter-spacing:-0.02em;">
        Connect with investors <span style="font-style:italic;">who matter</span>
      </h1>
      <p style="font-size:16px;line-height:1.7;margin:0 0 24px 0;color:#5A5A5A;">Hi {name},</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 24px 0;color:#5A5A5A;">
        Pitching shouldn''t mean sending generic emails into the void. At InvestorRaise, we help you secure funding faster with AI-crafted, highly personalized pitches.
      </p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 32px 0;color:#5A5A5A;">
        Get direct access to our verified network of <strong>10,000+ VCs and angel investors</strong> across India. Stand out in the inbox and start closing your round today.
      </p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td align="center" bgcolor="#151515" style="border-radius:30px;">
            <a href="https://investorraise.com" style="display:inline-block;padding:16px 36px;font-family:''DM Sans'',Arial,sans-serif;font-weight:500;font-size:15px;color:#FAFAFA;text-decoration:none;border-radius:30px;">
              Get Started
            </a>
          </td>
        </tr>
      </table>
      <p style="font-size:16px;line-height:1.7;margin:40px 0 0 0;color:#5A5A5A;">
        Best,<br><strong>Prince</strong><br>
        <span style="font-size:14px;color:#8A8A8A;">investorraise.com</span>
      </p>
    </div>
    <div style="padding:32px 40px;text-align:center;background-color:#F8F9F8;border-top:1px solid #F0F0F0;">
      <p style="font-size:12px;color:#9A9A9A;margin:0;">
        <a href="#" style="color:#9A9A9A;text-decoration:underline;">Unsubscribe</a> | investorraise.com
      </p>
    </div>
  </div>
</body>
</html>'
FROM domains WHERE domain_name LIKE '%investorraise%'
ON CONFLICT DO NOTHING;

-- 7. Index for fast variant selection
CREATE INDEX IF NOT EXISTS idx_email_templates_domain ON email_templates(domain_id, is_active);

