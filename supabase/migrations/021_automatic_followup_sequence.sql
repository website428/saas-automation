-- Automatic, per-recipient follow-up sequence.
-- Spreadsheet copy is kept on the contact only until campaign launch; each
-- queue row then receives an immutable subject/body snapshot.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS custom_followup_1 TEXT,
  ADD COLUMN IF NOT EXISTS custom_followup_2 TEXT;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS followup2_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup2_subject TEXT,
  ADD COLUMN IF NOT EXISTS followup2_body TEXT,
  ADD COLUMN IF NOT EXISTS followup2_delay_days INT DEFAULT 4;

ALTER TABLE email_queue
  ADD COLUMN IF NOT EXISTS wait_days INT NOT NULL DEFAULT 0;

ALTER TABLE email_queue
  DROP CONSTRAINT IF EXISTS email_queue_wait_days_check;
ALTER TABLE email_queue
  ADD CONSTRAINT email_queue_wait_days_check CHECK (wait_days BETWEEN 0 AND 30);

CREATE INDEX IF NOT EXISTS idx_queue_campaign_contact_step
  ON email_queue(campaign_id, contact_id, sequence_step);

COMMENT ON COLUMN contacts.custom_followup_1 IS 'Optional spreadsheet follow-up 1 body, snapshotted when queued.';
COMMENT ON COLUMN contacts.custom_followup_2 IS 'Optional spreadsheet follow-up 2 body, snapshotted when queued.';
COMMENT ON COLUMN campaigns.followup_delay_days IS 'Days after the initial email before follow-up 1; cancelled after a reply.';
COMMENT ON COLUMN campaigns.followup2_delay_days IS 'Days after follow-up 1 before follow-up 2; cancelled after a reply.';
COMMENT ON COLUMN email_queue.wait_days IS 'Minimum days after the previous sequence step was actually sent.';
