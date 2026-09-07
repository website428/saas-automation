-- Idempotent production repair for Excel campaign automation.
-- This deliberately repeats the required columns from earlier migrations so a
-- production database that missed one of them can be repaired with one script.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS company_name      TEXT,
  ADD COLUMN IF NOT EXISTS job_title         TEXT,
  ADD COLUMN IF NOT EXISTS website           TEXT,
  ADD COLUMN IF NOT EXISTS personalization   TEXT,
  ADD COLUMN IF NOT EXISTS custom_subject    TEXT,
  ADD COLUMN IF NOT EXISTS custom_body       TEXT,
  ADD COLUMN IF NOT EXISTS custom_followup_1 TEXT,
  ADD COLUMN IF NOT EXISTS custom_followup_2 TEXT;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS bounce_email_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bounce_subject          TEXT,
  ADD COLUMN IF NOT EXISTS bounce_body             TEXT,
  ADD COLUMN IF NOT EXISTS followup_email_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup_subject        TEXT,
  ADD COLUMN IF NOT EXISTS followup_body           TEXT,
  ADD COLUMN IF NOT EXISTS followup_delay_days     INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS followup2_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup2_subject       TEXT,
  ADD COLUMN IF NOT EXISTS followup2_body          TEXT,
  ADD COLUMN IF NOT EXISTS followup2_delay_days    INT DEFAULT 4;

ALTER TABLE email_queue
  ADD COLUMN IF NOT EXISTS personalized_subject TEXT,
  ADD COLUMN IF NOT EXISTS personalized_body    TEXT,
  ADD COLUMN IF NOT EXISTS wait_days            INT NOT NULL DEFAULT 0;

ALTER TABLE email_queue
  DROP CONSTRAINT IF EXISTS email_queue_wait_days_check;
ALTER TABLE email_queue
  ADD CONSTRAINT email_queue_wait_days_check CHECK (wait_days BETWEEN 0 AND 30);

CREATE INDEX IF NOT EXISTS idx_queue_campaign_contact_step
  ON email_queue(campaign_id, contact_id, sequence_step);

COMMENT ON COLUMN contacts.company_name IS 'Company used for per-recipient campaign personalization.';
COMMENT ON COLUMN contacts.custom_followup_1 IS 'Optional recipient-specific first follow-up body.';
COMMENT ON COLUMN contacts.custom_followup_2 IS 'Optional recipient-specific second follow-up body.';
COMMENT ON COLUMN email_queue.personalized_subject IS 'Immutable recipient subject captured when queued.';
COMMENT ON COLUMN email_queue.personalized_body IS 'Immutable recipient body captured when queued.';
COMMENT ON COLUMN email_queue.wait_days IS 'Minimum days after the prior sequence step was sent.';

-- PostgREST caches table metadata. Reload it immediately so the new columns are
-- visible to the deployed portal without waiting for cache expiry.
NOTIFY pgrst, 'reload schema';
