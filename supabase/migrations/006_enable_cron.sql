-- ═══════════════════════════════════════════════════════════════
-- Fix cron auth: use real Supabase anon key so the edge function
-- actually accepts the call from pg_cron
-- ═══════════════════════════════════════════════════════════════

SELECT cron.unschedule('autopilot-queue-processor');

SELECT cron.schedule(
  'autopilot-queue-processor',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ftytilgysewegknoejqe.supabase.co/functions/v1/process-queue',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0eXRpbGd5c2V3ZWdrbm9lanFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDkzMDUsImV4cCI6MjA4NzU4NTMwNX0.q0wPymCWtvXjF0gO2uxEun-r6KKHKYVbeW4n6v3GrRM", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verify
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'autopilot-queue-processor';
