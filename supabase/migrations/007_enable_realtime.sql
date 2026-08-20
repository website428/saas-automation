-- ═══════════════════════════════════════════════════════════════════
-- Migration 007: Enable Supabase Realtime on email_queue
-- This allows the frontend to receive live row updates (status changes
-- like 'opened', 'clicked', 'delivered') pushed by the Resend webhook.
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- FULL replica identity lets Realtime broadcast the OLD and NEW row data
-- on UPDATE events (required so the client can see what changed).
ALTER TABLE email_queue REPLICA IDENTITY FULL;

-- Add email_queue to the realtime publication so changes are broadcast.
-- supabase_realtime is Supabase's default publication.
ALTER PUBLICATION supabase_realtime ADD TABLE email_queue;
