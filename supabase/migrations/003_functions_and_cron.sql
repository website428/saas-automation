-- ═══════════════════════════════════════════════════════════════
-- ColdReach — SQL Helper Functions for Webhook Counters
-- Run this in Supabase SQL Editor AFTER 002_autopilot_domains.sql
-- ═══════════════════════════════════════════════════════════════

-- Increment sent_count on campaign
CREATE OR REPLACE FUNCTION increment_campaign_sent(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

-- Increment opened_count on campaign
CREATE OR REPLACE FUNCTION increment_campaign_opened(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET opened_count = opened_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

-- Increment clicked_count on campaign
CREATE OR REPLACE FUNCTION increment_campaign_clicked(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET clicked_count = clicked_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

-- Increment bounced_count on campaign
CREATE OR REPLACE FUNCTION increment_campaign_bounced(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET bounced_count = bounced_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

-- ─── pg_cron schedule ─────────────────────────────────────────────
-- Enable pg_cron first: Dashboard → Extensions → pg_cron → Enable
-- Then run this to schedule autopilot every 5 minutes:

-- SELECT cron.schedule(
--   'autopilot-queue-processor',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://ftytilgysewegknoejqe.supabase.co/functions/v1/process-queue',
--     headers := '{"Authorization": "Bearer coldreach_cron_2026", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- To check scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('autopilot-queue-processor');
