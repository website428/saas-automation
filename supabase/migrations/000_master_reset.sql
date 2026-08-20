-- ═══════════════════════════════════════════════════════════════════
-- ColdReach — COMPLETE MASTER RESET
-- ONE FILE TO RULE THEM ALL — replaces migrations 001–005
-- Run in Supabase SQL Editor to wipe and fully rebuild
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 0. WIPE EVERYTHING ─────────────────────────────────────────────
DROP VIEW  IF EXISTS dashboard_stats CASCADE;
DROP VIEW  IF EXISTS domain_health    CASCADE;
DROP TABLE IF EXISTS inbox_messages   CASCADE;
DROP TABLE IF EXISTS inbox_threads    CASCADE;
DROP TABLE IF EXISTS autopilot_log    CASCADE;
DROP TABLE IF EXISTS webhook_events   CASCADE;
DROP TABLE IF EXISTS daily_warmup_log CASCADE;
DROP TABLE IF EXISTS send_logs        CASCADE;
DROP TABLE IF EXISTS email_queue      CASCADE;
DROP TABLE IF EXISTS email_templates  CASCADE;
DROP TABLE IF EXISTS sequences        CASCADE;
DROP TABLE IF EXISTS campaigns        CASCADE;
DROP TABLE IF EXISTS contacts         CASCADE;
DROP TABLE IF EXISTS domains          CASCADE;

DROP FUNCTION IF EXISTS increment_domain_sent(uuid);
DROP FUNCTION IF EXISTS increment_campaign_sent(uuid);
DROP FUNCTION IF EXISTS increment_campaign_opened(uuid);
DROP FUNCTION IF EXISTS increment_campaign_clicked(uuid);
DROP FUNCTION IF EXISTS increment_campaign_bounced(uuid);
DROP FUNCTION IF EXISTS increment_template_count(uuid);
DROP FUNCTION IF EXISTS get_warmup_limit(int);

-- ─── 1. DOMAINS ─────────────────────────────────────────────────────
CREATE TABLE domains (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_name       TEXT        NOT NULL UNIQUE,
  from_email        TEXT        NOT NULL,   -- MUST be prince@domain.com, NOT noreply@
  product_name      TEXT,
  sender_name       TEXT        DEFAULT '',
  warmup_start      DATE,
  warmup_day        INT         NOT NULL DEFAULT 0,
  daily_limit       INT         NOT NULL DEFAULT 20,
  emails_sent_today INT         NOT NULL DEFAULT 0,
  last_reset_date   DATE,
  send_hour_start   INT         NOT NULL DEFAULT 9,  -- IST hour (24h)
  send_hour_end     INT         NOT NULL DEFAULT 20,
  status            TEXT        NOT NULL DEFAULT 'warming'
                    CHECK (status IN ('warming','warm','paused','burned')),
  bounce_rate       NUMERIC(5,2) NOT NULL DEFAULT 0,
  health_score      INT         NOT NULL DEFAULT 100
                    CHECK (health_score BETWEEN 0 AND 100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. CONTACTS ─────────────────────────────────────────────────────
CREATE TABLE contacts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT        NOT NULL,
  name        TEXT,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','sent','bounced','unsubscribed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. CAMPAIGNS ────────────────────────────────────────────────────
CREATE TABLE campaigns (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT        NOT NULL UNIQUE,
  domain_id      UUID        NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  subject_a      TEXT        NOT NULL,
  subject_b      TEXT,
  body_html      TEXT        NOT NULL,
  ab_test_split  INT         NOT NULL DEFAULT 0 CHECK (ab_test_split BETWEEN 0 AND 50),
  ab_winner      TEXT        CHECK (ab_winner IN ('a','b')),
  status         TEXT        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','active','paused','aborted','completed')),
  total_contacts INT         NOT NULL DEFAULT 0,
  sent_count     INT         NOT NULL DEFAULT 0,
  opened_count   INT         NOT NULL DEFAULT 0,
  clicked_count  INT         NOT NULL DEFAULT 0,
  bounced_count  INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

-- ─── 4. SEQUENCES (follow-up steps) ──────────────────────────────────
CREATE TABLE sequences (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number    INT  NOT NULL,
  delay_days     INT  NOT NULL DEFAULT 0,
  subject        TEXT NOT NULL,
  body_html      TEXT NOT NULL,
  send_condition TEXT NOT NULL DEFAULT 'always'
                 CHECK (send_condition IN ('always','no_open')),
  UNIQUE(campaign_id, step_number)
);

-- ─── 5. EMAIL QUEUE ───────────────────────────────────────────────────
CREATE TABLE email_queue (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id   UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id    UUID        NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
  domain_id     UUID        NOT NULL REFERENCES domains(id)   ON DELETE CASCADE,
  sequence_step INT         NOT NULL DEFAULT 1,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','sending','sent','delivered','opened','clicked','bounced','complained','failed','cancelled')),
  attempts      INT         NOT NULL DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  resend_id     TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 6. EMAIL TEMPLATES (variant pool — plain text only for Primary inbox) ──
-- RULE: HTML variants land in Promotions tab. Keep is_active=false for HTML.
CREATE TABLE email_templates (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id   UUID        NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  variant_id  TEXT        NOT NULL,  -- 'A','B','C','D','E'
  subject     TEXT        NOT NULL,
  body_html   TEXT        NOT NULL,  -- store as plain text for plain variants
  send_count  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_id, variant_id)
);

-- ─── 7. SEND LOGS ─────────────────────────────────────────────────────
CREATE TABLE send_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id    UUID        NOT NULL REFERENCES email_queue(id) ON DELETE CASCADE,
  domain_id   UUID        NOT NULL REFERENCES domains(id),
  contact_id  UUID        NOT NULL REFERENCES contacts(id),
  resend_id   TEXT,
  event       TEXT        NOT NULL
              CHECK (event IN ('delivered','bounced','opened','clicked','complained','failed')),
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. DAILY WARMUP LOG ──────────────────────────────────────────────
CREATE TABLE daily_warmup_log (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id   UUID  NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  log_date    DATE  NOT NULL,
  sent        INT   NOT NULL DEFAULT 0,
  bounced     INT   NOT NULL DEFAULT 0,
  opened      INT   NOT NULL DEFAULT 0,
  daily_limit INT   NOT NULL,
  UNIQUE(domain_id, log_date)
);

-- ─── 9. WEBHOOK EVENTS ────────────────────────────────────────────────
CREATE TABLE webhook_events (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  resend_id   TEXT,
  event_type  TEXT        NOT NULL,
  email_to    TEXT,
  domain_id   UUID        REFERENCES domains(id),
  campaign_id UUID        REFERENCES campaigns(id),
  contact_id  UUID        REFERENCES contacts(id),
  metadata    JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 10. AUTOPILOT LOG ────────────────────────────────────────────────
CREATE TABLE autopilot_log (
  id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent      INT         NOT NULL DEFAULT 0,
  retried   INT         NOT NULL DEFAULT 0,
  completed INT         NOT NULL DEFAULT 0,
  skipped   TEXT,
  errors    JSONB
);

-- ─── 10b. INBOX THREADS ───────────────────────────────────────────────
CREATE TABLE inbox_threads (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id    UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  domain_id     UUID        NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  campaign_id   UUID        REFERENCES campaigns(id),
  queue_id      UUID        REFERENCES email_queue(id),
  subject       TEXT        NOT NULL DEFAULT '',
  last_message  TEXT,
  last_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read       BOOLEAN     NOT NULL DEFAULT FALSE,
  message_count INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id, domain_id)
);

-- ─── 10c. INBOX MESSAGES ──────────────────────────────────────────────
CREATE TABLE inbox_messages (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id   UUID        NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  direction   TEXT        NOT NULL CHECK (direction IN ('inbound','outbound')),
  body        TEXT        NOT NULL,
  resend_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 11. INDEXES ──────────────────────────────────────────────────────
CREATE INDEX idx_queue_status     ON email_queue(status);
CREATE INDEX idx_queue_scheduled  ON email_queue(scheduled_at) WHERE status = 'queued';
CREATE INDEX idx_queue_campaign   ON email_queue(campaign_id);
CREATE INDEX idx_queue_domain     ON email_queue(domain_id);
CREATE INDEX idx_contacts_status  ON contacts(status);
CREATE INDEX idx_contacts_email   ON contacts(email);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_webhook_rid       ON webhook_events(resend_id);
CREATE INDEX idx_webhook_type      ON webhook_events(event_type);
CREATE INDEX idx_templates_domain  ON email_templates(domain_id, is_active);
CREATE INDEX idx_inbox_threads_ct  ON inbox_threads(contact_id);
CREATE INDEX idx_inbox_threads_at  ON inbox_threads(last_at DESC);
CREATE INDEX idx_inbox_messages_th ON inbox_messages(thread_id, created_at);

-- ─── 12. VIEWS ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM contacts     WHERE status != 'unsubscribed')                                  AS total_contacts,
  (SELECT COUNT(*) FROM email_queue  WHERE status IN ('sent','delivered','opened','clicked'))          AS total_sent,
  (SELECT COUNT(*) FROM email_queue  WHERE status = 'queued')                                         AS total_pending,
  (SELECT COUNT(*) FROM email_queue  WHERE status IN ('opened','clicked'))                             AS total_opened,
  (SELECT COUNT(*) FROM email_queue  WHERE status = 'bounced')                                        AS total_bounced,
  (SELECT COUNT(*) FROM email_queue  WHERE status = 'clicked')                                        AS total_clicked,
  (SELECT COUNT(*) FROM email_queue  WHERE status = 'delivered')                                      AS total_delivered,
  (SELECT COUNT(*) FROM campaigns    WHERE status = 'active')                                         AS active_campaigns,
  (SELECT COUNT(*) FROM domains      WHERE status = 'warming')                                        AS warming_domains;

CREATE OR REPLACE VIEW domain_health AS
SELECT
  d.id, d.domain_name, d.from_email, d.product_name, d.sender_name,
  d.warmup_day, d.daily_limit, d.emails_sent_today,
  d.send_hour_start, d.send_hour_end,
  d.status, d.bounce_rate, d.health_score, d.warmup_start,
  (SELECT COUNT(*) FROM email_queue eq WHERE eq.domain_id = d.id AND eq.status = 'queued') AS queued_count,
  (SELECT COUNT(*) FROM email_queue eq WHERE eq.domain_id = d.id AND eq.status = 'sent')   AS total_sent
FROM domains d;

-- ─── 13. RPC FUNCTIONS ────────────────────────────────────────────────
-- Atomic counters — prevent race conditions in concurrent sends

CREATE OR REPLACE FUNCTION increment_domain_sent(did uuid) RETURNS void AS $$
  UPDATE domains SET emails_sent_today = emails_sent_today + 1 WHERE id = did;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION increment_campaign_sent(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION increment_campaign_opened(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET opened_count = opened_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION increment_campaign_clicked(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET clicked_count = clicked_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION increment_campaign_bounced(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET bounced_count = bounced_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION increment_template_count(tid uuid) RETURNS void AS $$
  UPDATE email_templates SET send_count = send_count + 1 WHERE id = tid;
$$ LANGUAGE SQL;

-- 20%/day compound growth: day1=20, day5=50, day10=124, day15=308, day20=500+
CREATE OR REPLACE FUNCTION get_warmup_limit(day_num int) RETURNS int AS $$
BEGIN
  RETURN LEAST(500, GREATEST(5, FLOOR(20 * POWER(1.20, day_num - 1))::int));
END;
$$ LANGUAGE plpgsql;

-- ─── 14. SEED DATA — DOMAINS ──────────────────────────────────────────
-- CRITICAL: from_email uses hello@ — human-feeling, not a spam flag like noreply@
-- Time windows: FinModel=morning, AIMLSchool=afternoon, InvestorRaise=evening
-- This creates sending "personalities" and avoids all-at-once volume spikes

INSERT INTO domains (domain_name, from_email, warmup_start, warmup_day,
  daily_limit, status, health_score, product_name, sender_name, send_hour_start, send_hour_end)
VALUES
(
  'financialmodel.io',
  'hello@financialmodel.io',
  CURRENT_DATE, 1, 20, 'warming', 100,
  'FinModel', 'financialmodel.io',
  9, 12   -- morning: 9am–12pm IST
),
(
  'aimlschool360.com',
  'hello@aimlschool360.com',
  CURRENT_DATE, 1, 20, 'warming', 100,
  'AIML School 360', 'AIML School 360',
  13, 17  -- afternoon: 1pm–5pm IST
),
(
  'mail.investorraise.com',
  'hello@mail.investorraise.com',
  CURRENT_DATE, 1, 20, 'warming', 100,
  'InvestorRaise', 'InvestorRaise',
  17, 20  -- evening: 5pm–8pm IST
);

-- ─── 15. SEED DATA — TEST CONTACTS ───────────────────────────────────
INSERT INTO contacts (email, name, tags) VALUES
  ('princeguptaca9@gmail.com', 'Prince Gupta',   ARRAY['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Rahul Sharma',   ARRAY['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Priya Mehta',    ARRAY['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Arjun Verma',    ARRAY['test','aimlschool']),
  ('princeguptaca9@gmail.com', 'Neha Kapoor',    ARRAY['test','aimlschool']),
  ('princeguptaca9@gmail.com', 'Vikram Singh',   ARRAY['test','investorraise']),
  ('princeguptaca9@gmail.com', 'Anjali Patel',   ARRAY['test','investorraise']);

-- ═══════════════════════════════════════════════════════════════════
-- ─── 16. EMAIL TEMPLATES — ANTI-SPAM OPTIMIZED ──────────────────
-- ═══════════════════════════════════════════════════════════════════
-- RULES APPLIED (based on 2024 Gmail/Outlook deliverability research):
--   1. Plain text ONLY — HTML = Promotions tab guaranteed
--   2. ZERO links in email body — links = spam score spike
--   3. Under 80 words — shorter = more personal = Primary inbox
--   4. No spam words: "AI-powered", "guaranteed", "industry-ready",
--      "limited offer", "click here", "free trial", "exclusive"
--   5. One soft question at end, not a sales CTA
--   6. Signed with full name + domain (builds brand without a link)
--   7. No unsubscribe footer (cold emails, not newsletters)
--   8. HTML variants stored but is_active=FALSE (autopilot ignores them)

-- ════════════════════════════════════
-- financialmodel.io — 5 plain variants
-- ════════════════════════════════════

-- Variant A: Problem-first angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'A',
  '{name} — quick question',
  E'Hi {name},\n\nHow long does it usually take your team to build a financial model from scratch?\n\nI ask because we built something that pulls data from annual reports and PDFs and generates a linked 3-statement model in a few minutes. No formulas, no copy-paste.\n\nWould that be useful for what you''re working on?\n\nfinancialmodel.io',
  TRUE
FROM domains WHERE domain_name = 'financialmodel.io';

-- Variant B: Curiosity angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'B',
  'financial modeling — had a thought',
  E'Hi {name},\n\nI''ve been talking to a lot of finance folks lately and the same problem keeps coming up — building models from company docs takes too long.\n\nWe made a tool that does the heavy lifting automatically. Works on any annual report or PDF.\n\nCurious what your current process looks like?\n\nfinancialmodel.io',
  TRUE
FROM domains WHERE domain_name = 'financialmodel.io';

-- Variant C: Direct relevance angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'C',
  '{name} — thought this might save you time',
  E'{name},\n\nSaw your profile and thought you''d find this relevant — we built a tool that turns PDFs and annual reports into financial models automatically.\n\nIt''s not perfect for every use case, but if you''re doing this kind of analysis regularly it might be worth 10 minutes of your time.\n\nHappy to share more if it sounds relevant.\n\nfinancialmodel.io',
  TRUE
FROM domains WHERE domain_name = 'financialmodel.io';

-- Variant D: Question-first angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'D',
  'do you work with financial models?',
  E'Hi {name},\n\nDo you ever have to build 3-statement models from company reports? I ask because I just launched something that automates most of that work.\n\nIt reads PDFs, pulls the right numbers, and generates a linked model. Took us a while to get right.\n\nWould you want to take a look?\n\nfinancialmodel.io',
  TRUE
FROM domains WHERE domain_name = 'financialmodel.io';

-- Variant E: Social proof angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'E',
  'cut financial modeling time significantly',
  E'Hi {name},\n\nA few analysts we''ve been working with cut their modeling time from days to under an hour using what we built — it takes any company PDF and builds the 3-statement automatically.\n\nNot the right fit for everyone, but wanted to reach out in case it''s useful.\n\nHappy to walk you through it if you''re curious.\n\nfinancialmodel.io',
  TRUE
FROM domains WHERE domain_name = 'financialmodel.io';

-- ════════════════════════════════════
-- aimlschool360.com — 3 plain variants
-- ════════════════════════════════════

-- Variant A: Career angle (no buzzwords)
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'A',
  'building something in AI/ML?',
  E'Hi {name},\n\nAre you currently trying to get into AI or level up what you already know?\n\nI run AIML School 360 — we''ve been teaching this offline for 7 years and recently moved online. The focus is practical: if you can''t build and ship it, we haven''t done our job.\n\nWould it be worth a quick conversation?\n\naimlschool360.com',
  TRUE
FROM domains WHERE domain_name = 'aimlschool360.com';

-- Variant B: Pain angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'B',
  'most AI courses leave you stuck',
  E'Hi {name},\n\nMost people who finish an online AI course still can''t build anything real. The theory is fine, the practice is missing.\n\nAt AIML School 360 we focus on what comes after the notebook — real projects, deployment, and placement support. 1,500+ people have come through our program.\n\nWould that be relevant to where you are right now?\n\naimlschool360.com',
  TRUE
FROM domains WHERE domain_name = 'aimlschool360.com';

-- Variant C: Outcome angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'C',
  '{name} — AI/ML question',
  E'{name},\n\nQuick question — are you happy with where your AI skills are right now, or is there a gap you''re trying to close?\n\nI ask because we work with professionals at exactly that point. AIML School 360 has been around for 7 years and our online program covers the full path from fundamentals to real deployment.\n\nHappy to share details if this is timely.\n\naimlschool360.com',
  TRUE
FROM domains WHERE domain_name = 'aimlschool360.com';

-- ════════════════════════════════════
-- mail.investorraise.com — 3 plain variants
-- ════════════════════════════════════

-- Variant A: Timing angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'A',
  'fundraising question',
  E'Hi {name},\n\nAre you actively raising right now or planning to in the next few months?\n\nI''m with InvestorRaise — we connect founders with verified investors across India. The matching is specific to your stage and sector, which tends to make conversations more useful.\n\nWorth a quick chat if the timing is right.\n\nInvestorRaise',
  TRUE
FROM domains WHERE domain_name = 'mail.investorraise.com';

-- Variant B: Frustration angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'B',
  'finding the right investors',
  E'Hi {name},\n\nFinding investors who actually fund companies at your stage is harder than it should be.\n\nInvestorRaise is a platform we built specifically for that — verified Indian VCs and angels, matched by sector and check size. No cold outreach to people who wouldn''t invest in you anyway.\n\nWould it be useful to see how it works?\n\nInvestorRaise',
  TRUE
FROM domains WHERE domain_name = 'mail.investorraise.com';

-- Variant C: Access angle
INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'C',
  '{name} — investor access',
  E'{name},\n\nWe built InvestorRaise to give founders direct access to investors who are actively writing cheques in India — without the warm intro problem.\n\nOver 10,000 verified VCs and angels on the platform, filtered by what you''re building and what you need.\n\nOpen to a quick walkthrough?\n\nInvestorRaise',
  TRUE
FROM domains WHERE domain_name = 'mail.investorraise.com';

-- ════════════════════════════════════
-- HTML variants — ACTIVE
-- Autopilot rotates through plain + HTML variants together
-- You control which type gets sent via the campaign creation page toggle
-- To disable HTML for a domain, set is_active=FALSE in Supabase Table Editor
-- ════════════════════════════════════

INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'HTML',
  'Connect with investors who matter',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>@import url(''https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap'');</style></head><body style="margin:0;padding:40px 20px;background-color:#F9F7F4;font-family:''DM Sans'',Arial,sans-serif;color:#5A5A5A;"><div style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px -6px rgba(0,0,0,0.08);"><div style="padding:32px 40px;text-align:center;border-bottom:1px solid #F0F0F0;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td valign="middle" style="padding-right:12px;"><div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3A5A3A 0%,#5A7A5A 100%);text-align:center;line-height:36px;"><span style="color:#fff;font-weight:700;font-size:18px;">IR</span></div></td><td valign="middle"><span style="font-family:''Cormorant Garamond'',Georgia,serif;font-size:24px;font-weight:600;color:#151515;letter-spacing:-0.02em;">Investor<span style="color:#4A6A4A;">Raise</span></span></td></tr></table></div><div style="padding:48px 40px;"><h1 style="font-family:''Cormorant Garamond'',Georgia,serif;font-size:36px;font-weight:400;color:#151515;margin:0 0 24px 0;line-height:1.1;letter-spacing:-0.02em;">Connect with investors <span style="font-style:italic;">who matter</span></h1><p style="font-size:16px;line-height:1.7;margin:0 0 24px 0;color:#5A5A5A;">Hi {name},</p><p style="font-size:16px;line-height:1.7;margin:0 0 24px 0;color:#5A5A5A;">We help founders get in front of the right investors faster — matched by stage, sector and check size across our network of 10,000+ verified VCs and angels in India.</p><table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr><td align="center" bgcolor="#151515" style="border-radius:30px;"><a href="https://investorraise.com" style="display:inline-block;padding:16px 36px;font-family:''DM Sans'',Arial,sans-serif;font-weight:500;font-size:15px;color:#FAFAFA;text-decoration:none;border-radius:30px;">Get Started</a></td></tr></table><p style="font-size:16px;line-height:1.7;margin:40px 0 0 0;color:#5A5A5A;">Best,<br><strong>Prince</strong><br><span style="font-size:14px;color:#8A8A8A;">investorraise.com</span></p></div><div style="padding:24px 40px;text-align:center;background-color:#F8F9F8;border-top:1px solid #F0F0F0;"><p style="font-size:12px;color:#9A9A9A;margin:0;"><a href="#" style="color:#9A9A9A;text-decoration:underline;">Unsubscribe</a> | investorraise.com</p></div></div></body></html>',
  TRUE  -- ACTIVE: autopilot includes this HTML variant in rotation
FROM domains WHERE domain_name = 'mail.investorraise.com';

INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'HTML',
  'Where curious minds become AI leaders',
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AIML School 360</title><style type="text/css">@import url(''https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap'');</style></head><body style="margin:0;padding:0;background-color:#FFFAF5;font-family:''Inter'',-apple-system,sans-serif;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FFFAF5;padding:40px 15px;"><tr><td align="center"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.06);padding:40px;text-align:left;"><tr><td style="padding-bottom:30px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td style="background-color:#0D7377;border-radius:12px;width:40px;height:40px;text-align:center;vertical-align:middle;"><span style="color:#ffffff;font-size:14px;font-weight:800;">AI</span></td><td style="padding-left:8px;"><span style="font-size:20px;font-weight:700;color:#1A1A1A;letter-spacing:-0.02em;">MLSchool<span style="color:#0D7377;">360</span></span></td></tr></table></td></tr><tr><td style="padding-bottom:20px;"><h1 style="margin:0;color:#1A1A1A;font-size:32px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;">Where curious minds become <span style="color:#0D7377;">AI leaders</span></h1></td></tr><tr><td style="padding-bottom:24px;"><p style="margin:0;color:#5C5C5C;font-size:16px;line-height:1.6;">Hi {name},</p><br><p style="margin:0;color:#5C5C5C;font-size:16px;line-height:1.6;">7+ years of teaching AI/ML, 1,500+ placements — now fully online. Real projects, real deployment, real support.</p></td></tr><tr><td style="padding-bottom:40px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td style="border-radius:30px;background-color:#0D7377;"><a href="https://aimlschool360.com" style="font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;padding:16px 32px;display:inline-block;border-radius:30px;">Explore Programs</a></td></tr></table></td></tr><tr><td style="border-top:1px solid #E5DDD5;padding-top:24px;"><p style="margin:0;color:#1A1A1A;font-size:14px;font-weight:600;">Best,</p><p style="margin:4px 0 0 0;color:#8C8C8C;font-size:14px;">AIML School 360</p></td></tr><tr><td style="padding-top:24px;"><p style="margin:0;color:#8C8C8C;font-size:12px;text-align:center;"><a href="#" style="color:#8C8C8C;text-decoration:underline;">Unsubscribe</a> | aimlschool360.com</p></td></tr></table></td></tr></table></body></html>',
  TRUE  -- ACTIVE: autopilot includes this HTML variant in rotation
FROM domains WHERE domain_name = 'aimlschool360.com';

INSERT INTO email_templates (domain_id, variant_id, subject, body_html, is_active)
SELECT id, 'HTML',
  'Hi {name} — build financial models 10x faster',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:#07070f;font-family:Inter,system-ui,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#07070f;"><tr><td align="center" style="padding:48px 20px;"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;"><tr><td style="padding-bottom:28px;"><table cellpadding="0" cellspacing="0"><tr><td style="width:38px;height:38px;background:linear-gradient(135deg,#7c3aed,#4338ca);border-radius:10px;text-align:center;vertical-align:middle;"><span style="color:#fff;font-weight:800;font-size:18px;line-height:38px;">F</span></td><td style="padding-left:10px;font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.03em;vertical-align:middle;">FinModel</td></tr></table></td></tr><tr><td style="background:#0f0f1e;border:1px solid rgba(124,58,237,0.2);border-radius:20px;padding:40px;"><h1 style="margin:0 0 20px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.04em;line-height:1.25;">Hi {name} — build models faster</h1><p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.75;">We built an AI platform that turns PDFs into fully-linked 3-statement financial models in minutes — not days.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="https://financialmodel.io" style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#4338ca 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 40px;border-radius:12px;">Try Free Demo</a></td></tr></table><p style="margin:24px 0 0;font-size:14px;color:rgba(255,255,255,0.55);">Best,<br>financialmodel.io<br><a href="https://financialmodel.io" style="color:#a78bfa;text-decoration:none;">financialmodel.io</a></p></td></tr><tr><td style="padding:24px 0;text-align:center;"><p style="font-size:11px;color:rgba(255,255,255,0.2);margin:0;"><a href="#" style="color:rgba(255,255,255,0.2);text-decoration:underline;">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>',
  TRUE  -- ACTIVE: autopilot includes this HTML variant in rotation
FROM domains WHERE domain_name = 'financialmodel.io';

-- ═══════════════════════════════════════════════════════════════════
-- ─── 17. PG_CRON + PG_NET: SUPABASE-ONLY SCHEDULER ───────────────
-- ═══════════════════════════════════════════════════════════════════
-- pg_cron and pg_net must be enabled in Supabase Dashboard first.
--   Database > Extensions > Search "pg_cron" > Enable
--   Database > Extensions > Search "pg_net"  > Enable
--
-- AFTER running this migration, set the database settings:
--   ALTER DATABASE postgres SET app.settings.app_url = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1';
--   ALTER DATABASE postgres SET app.settings.cron_secret = 'YOUR_SECRET';

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── FUNCTION: Trigger the process-queue Edge Function ────────────
-- Called every minute by pg_cron.
-- The process-queue Edge Function handles everything:
--   - Checking domain time windows
--   - Dedup across domains
--   - Template variant rotation
--   - Actually sending via Resend
CREATE OR REPLACE FUNCTION trigger_process_queue() RETURNS void AS $$
DECLARE
  base_url TEXT;
  cron_key TEXT;
  has_due BOOLEAN;
BEGIN
  base_url := current_setting('app.settings.app_url', true);
  cron_key := current_setting('app.settings.cron_secret', true);

  IF base_url IS NULL OR base_url = '' THEN
    RAISE NOTICE 'app.settings.app_url is not set. Skipping.';
    RETURN;
  END IF;
  IF cron_key IS NULL OR cron_key = '' THEN
    cron_key := 'changeme';
  END IF;

  -- Only call the Edge Function if there are queued emails due
  SELECT EXISTS(
    SELECT 1 FROM email_queue
    WHERE status = 'queued'
      AND scheduled_at <= NOW()
    LIMIT 1
  ) INTO has_due;

  IF has_due THEN
    PERFORM net.http_post(
      url := base_url || '/process-queue',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cron_key
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── SCHEDULE: Every minute — trigger process-queue if emails are due ─
SELECT cron.schedule(
  'trigger-process-queue',
  '* * * * *',
  $$SELECT trigger_process_queue()$$
);
