-- ═══════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Run each section in Supabase SQL Editor
-- Copy/paste results back to diagnose the sending issue
-- ═══════════════════════════════════════════════════════════════

-- 1. Check domain status (most important - must be 'warming' or 'warm')
SELECT
  domain_name,
  status,
  health_score,
  daily_limit,
  emails_sent_today,
  warmup_start,
  warmup_day,
  send_hour_start,
  send_hour_end
FROM domains
ORDER BY domain_name;

-- 2. Check last 10 autopilot runs (shows what happened each time cron fired)
SELECT
  run_at,
  sent,
  retried,
  skipped,
  errors
FROM autopilot_log
ORDER BY run_at DESC
LIMIT 10;

-- 3. Check queued emails
SELECT
  eq.id,
  eq.status,
  eq.scheduled_at,
  eq.attempts,
  eq.error_message,
  c.name AS contact_name,
  d.domain_name,
  d.status AS domain_status
FROM email_queue eq
JOIN contacts c ON c.id = eq.contact_id
JOIN domains d ON d.id = eq.domain_id
WHERE eq.status = 'queued'
ORDER BY eq.scheduled_at;

-- 4. Check campaign status
SELECT id, name, status, domain_id FROM campaigns ORDER BY created_at DESC LIMIT 5;
