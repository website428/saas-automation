-- Diagnostic: Check if replies are reaching the database
-- Run in Supabase SQL Editor

-- 1. Are there any inbox threads at all?
SELECT id, subject, last_message, message_count, is_read, last_at
FROM inbox_threads
ORDER BY last_at DESC
LIMIT 10;

-- 2. Are there inbox messages?
SELECT id, direction, body, created_at
FROM inbox_messages
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check the most recent email_queue items and their resend_ids
SELECT id, status, resend_id, sent_at
FROM email_queue
ORDER BY sent_at DESC
LIMIT 5;
