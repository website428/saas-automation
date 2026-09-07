-- Keep per-recipient copy immutable once a campaign is queued. Without this
-- snapshot, changing a contact's personalized copy could alter older scheduled
-- campaigns that have not been sent yet.
ALTER TABLE email_queue
  ADD COLUMN IF NOT EXISTS personalized_subject TEXT,
  ADD COLUMN IF NOT EXISTS personalized_body TEXT;

COMMENT ON COLUMN email_queue.personalized_subject IS
  'Campaign-specific subject captured when this recipient is queued.';
COMMENT ON COLUMN email_queue.personalized_body IS
  'Campaign-specific body captured when this recipient is queued.';
