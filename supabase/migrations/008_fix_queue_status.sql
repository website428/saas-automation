-- ═══════════════════════════════════════════════════════════════
-- Migration 008: Fix email_queue status constraint to allow
-- tracking statuses: delivered, opened, clicked, bounced, complained
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Drop the old strict constraint
ALTER TABLE email_queue DROP CONSTRAINT IF EXISTS email_queue_status_check;

-- Add the full set of statuses including tracking events
ALTER TABLE email_queue
  ADD CONSTRAINT email_queue_status_check
  CHECK (status IN (
    'queued', 'sending', 'sent',
    'delivered', 'opened', 'clicked',
    'bounced', 'complained', 'failed', 'cancelled'
  ));

-- Verify
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'email_queue_status_check';
