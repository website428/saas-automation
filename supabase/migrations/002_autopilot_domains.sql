-- ═══════════════════════════════════════════════════════════════
-- ColdReach — Domain Additions + Autopilot Schema Updates
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Add clicked_count to campaigns if not exists
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS clicked_count int not null default 0;

-- Add product label to domains for UI grouping
ALTER TABLE domains ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS sender_name text default 'Prince Gupta';

-- Update existing domain with product name
UPDATE domains SET product_name = 'FinModel', sender_name = 'Prince Gupta'
WHERE domain_name = 'financialmodel.io';

-- ─── ADD NEW DOMAINS ─────────────────────────────────────────────

-- AIML School 360
INSERT INTO domains (domain_name, from_email, warmup_start, warmup_day, daily_limit, status, health_score, product_name, sender_name)
VALUES (
  'aimlschool360.com',
  'noreply@aimlschool360.com',
  current_date,
  1,
  20,  -- Week 1: 20/day (industry standard)
  'warming',
  100,
  'AIML School 360',
  'Prince — AIML School'
)
ON CONFLICT (domain_name) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  sender_name = EXCLUDED.sender_name;

-- InvestorRaise (using subdomain mail.investorraise.com)
INSERT INTO domains (domain_name, from_email, warmup_start, warmup_day, daily_limit, status, health_score, product_name, sender_name)
VALUES (
  'mail.investorraise.com',
  'noreply@mail.investorraise.com',
  current_date,
  1,
  20,
  'warming',
  100,
  'InvestorRaise',
  'Prince — InvestorRaise'
)
ON CONFLICT (domain_name) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  sender_name = EXCLUDED.sender_name;

-- ─── WEBHOOK EVENTS TABLE ────────────────────────────────────────
-- Stores raw Resend webhook events for audit trail
CREATE TABLE IF NOT EXISTS webhook_events (
  id          uuid primary key default uuid_generate_v4(),
  resend_id   text,
  event_type  text not null,
  email_to    text,
  domain_id   uuid references domains(id),
  campaign_id uuid references campaigns(id),
  contact_id  uuid references contacts(id),
  metadata    jsonb,
  received_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_resend_id ON webhook_events(resend_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);

-- ─── AUTOPILOT LOG TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autopilot_log (
  id          uuid primary key default uuid_generate_v4(),
  run_at      timestamptz not null default now(),
  sent        int not null default 0,
  retried     int not null default 0,
  completed   int not null default 0,
  skipped     text,  -- reason if skipped (e.g. outside business hours)
  errors      jsonb
);

-- ─── UPDATED DASHBOARD STATS VIEW ────────────────────────────────
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
  (SELECT count(*) FROM contacts WHERE status != 'unsubscribed')     AS total_contacts,
  (SELECT count(*) FROM email_queue WHERE status = 'sent')           AS total_sent,
  (SELECT count(*) FROM email_queue WHERE status = 'queued')         AS total_pending,
  (SELECT count(*) FROM webhook_events WHERE event_type = 'email.opened')   AS total_opened,
  (SELECT count(*) FROM webhook_events WHERE event_type = 'email.bounced')  AS total_bounced,
  (SELECT count(*) FROM webhook_events WHERE event_type = 'email.clicked')  AS total_clicked,
  (SELECT count(*) FROM campaigns WHERE status = 'active')           AS active_campaigns,
  (SELECT count(*) FROM domains WHERE status = 'warming')            AS warming_domains;

-- ─── WARMUP SCHEDULE FUNCTION ─────────────────────────────────────
-- Returns the correct daily_limit based on warmup_day
CREATE OR REPLACE FUNCTION get_warmup_limit(day_num int) RETURNS int AS $$
BEGIN
  RETURN CASE
    WHEN day_num <= 7  THEN 20
    WHEN day_num <= 14 THEN 40
    WHEN day_num <= 21 THEN 80
    WHEN day_num <= 28 THEN 150
    WHEN day_num <= 35 THEN 300
    ELSE 500
  END;
END;
$$ LANGUAGE plpgsql;
