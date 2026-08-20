-- ═══════════════════════════════════════════════════════════════════
-- Migration 014: Email Open Tracking
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Add email_opens table for per-contact open events ────────────
-- Stores every open event with timestamp, allowing a "Recent Opens" feed
CREATE TABLE IF NOT EXISTS email_opens (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id     UUID        NOT NULL REFERENCES email_queue(id) ON DELETE CASCADE,
  contact_id   UUID        NOT NULL REFERENCES contacts(id)    ON DELETE CASCADE,
  campaign_id  UUID        NOT NULL REFERENCES campaigns(id)   ON DELETE CASCADE,
  domain_id    UUID        NOT NULL REFERENCES domains(id)     ON DELETE CASCADE,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent   TEXT,
  ip_address   TEXT
);

CREATE INDEX IF NOT EXISTS idx_opens_campaign    ON email_opens(campaign_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_opens_contact     ON email_opens(contact_id);
CREATE INDEX IF NOT EXISTS idx_opens_queue       ON email_opens(queue_id);

-- Enable realtime for the new table (so "Recent Opens" feed updates live)
ALTER TABLE email_opens REPLICA IDENTITY FULL;

-- ─── 2. Add opened_at to email_queue ─────────────────────────────────
-- Stores FIRST open timestamp on the queue row for quick display
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- ─── 3. Add clicked_count to campaigns (if missing) ──────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS clicked_count INT NOT NULL DEFAULT 0;

-- ─── 4. Fix/update dashboard_stats view ──────────────────────────────
-- Adds open_rate and click_rate computed fields
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM contacts     WHERE status != 'unsubscribed')                                   AS total_contacts,
  (SELECT COUNT(*) FROM email_queue  WHERE status IN ('sent','delivered','opened','clicked'))           AS total_sent,
  (SELECT COUNT(*) FROM email_queue  WHERE status = 'queued')                                          AS total_pending,
  (SELECT COUNT(*) FROM email_queue  WHERE status IN ('opened','clicked'))                              AS total_opened,
  (SELECT COUNT(*) FROM email_queue  WHERE status IN ('bounced','failed') AND error_message = 'Bounced') AS total_bounced,
  (SELECT COUNT(*) FROM email_queue  WHERE status = 'clicked')                                         AS total_clicked,
  (SELECT COUNT(*) FROM email_queue  WHERE status = 'delivered')                                       AS total_delivered,
  (SELECT COUNT(*) FROM campaigns    WHERE status = 'active')                                          AS active_campaigns,
  (SELECT COUNT(*) FROM domains      WHERE status = 'warming')                                         AS warming_domains,
  -- Computed rates (as numeric, 0 if no data)
  CASE
    WHEN (SELECT COUNT(*) FROM email_queue WHERE status IN ('sent','delivered','opened','clicked')) = 0 THEN 0
    ELSE ROUND(
      (SELECT COUNT(*) FROM email_queue WHERE status IN ('opened','clicked'))::numeric * 100.0 /
      (SELECT COUNT(*) FROM email_queue WHERE status IN ('sent','delivered','opened','clicked')),
      1
    )
  END AS open_rate,
  CASE
    WHEN (SELECT COUNT(*) FROM email_queue WHERE status IN ('sent','delivered','opened','clicked')) = 0 THEN 0
    ELSE ROUND(
      (SELECT COUNT(*) FROM email_queue WHERE status IN ('bounced','failed') AND error_message = 'Bounced')::numeric * 100.0 /
      (SELECT COUNT(*) FROM email_queue WHERE status IN ('sent','delivered','opened','clicked')),
      1
    )
  END AS bounce_rate;

-- ─── 5. RLS Policies for email_opens ─────────────────────────────────
ALTER TABLE email_opens ENABLE ROW LEVEL SECURITY;

-- Allow app to read and insert open events
CREATE POLICY "allow_all_email_opens" ON email_opens
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 6. Add email_opens to realtime publication ───────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_opens;
  EXCEPTION WHEN duplicate_object THEN
    -- already added, skip
  END;
END $$;

-- ─── VERIFICATION ─────────────────────────────────────────────────────
-- After running, verify:
-- SELECT * FROM dashboard_stats;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'email_opens';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'email_queue' AND column_name = 'opened_at';
