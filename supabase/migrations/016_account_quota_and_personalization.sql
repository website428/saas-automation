-- Account-wide Resend free-plan quota and per-contact personalization.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS company_name    TEXT,
  ADD COLUMN IF NOT EXISTS job_title       TEXT,
  ADD COLUMN IF NOT EXISTS website         TEXT,
  ADD COLUMN IF NOT EXISTS personalization TEXT,
  ADD COLUMN IF NOT EXISTS custom_subject  TEXT,
  ADD COLUMN IF NOT EXISTS custom_body     TEXT;

CREATE TABLE IF NOT EXISTS resend_daily_quota (
  quota_date DATE PRIMARY KEY,
  used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE resend_daily_quota ENABLE ROW LEVEL SECURITY;

-- Atomically reserve one account-wide message. The hard clamps prevent a
-- caller from raising the free-plan ceiling above 100/day or 3,000/month.
CREATE OR REPLACE FUNCTION reserve_resend_quota_slot(
  max_daily INT DEFAULT 100,
  max_monthly INT DEFAULT 3000
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_used INT;
  month_used INT;
  safe_daily INT := LEAST(GREATEST(max_daily, 1), 100);
  safe_monthly INT := LEAST(GREATEST(max_monthly, 1), 3000);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('resend-account-quota'));

  INSERT INTO resend_daily_quota (quota_date, used_count)
  VALUES (CURRENT_DATE, 0)
  ON CONFLICT (quota_date) DO NOTHING;

  SELECT used_count INTO today_used
  FROM resend_daily_quota
  WHERE quota_date = CURRENT_DATE;

  SELECT COALESCE(SUM(used_count), 0) INTO month_used
  FROM resend_daily_quota
  WHERE quota_date >= date_trunc('month', CURRENT_DATE)::date
    AND quota_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date;

  IF today_used >= safe_daily OR month_used >= safe_monthly THEN
    RETURN FALSE;
  END IF;

  UPDATE resend_daily_quota
  SET used_count = used_count + 1, updated_at = NOW()
  WHERE quota_date = CURRENT_DATE;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION release_resend_quota_slot() RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE resend_daily_quota
  SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
  WHERE quota_date = CURRENT_DATE;
$$;

-- Inbound messages also count against Resend's free quota. Over-counting a
-- retried webhook is conservative: it may pause early but cannot oversend.
CREATE OR REPLACE FUNCTION record_resend_inbound_usage() RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('resend-account-quota'));
  INSERT INTO resend_daily_quota (quota_date, used_count, updated_at)
  VALUES (CURRENT_DATE, 1, NOW())
  ON CONFLICT (quota_date) DO UPDATE
    SET used_count = resend_daily_quota.used_count + 1, updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION get_resend_quota_status()
RETURNS TABLE (daily_used BIGINT, monthly_used BIGINT, daily_limit INT, monthly_limit INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(used_count) FILTER (WHERE quota_date = CURRENT_DATE), 0)::BIGINT,
    COALESCE(SUM(used_count) FILTER (
      WHERE quota_date >= date_trunc('month', CURRENT_DATE)::date
        AND quota_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
    ), 0)::BIGINT,
    100,
    3000
  FROM resend_daily_quota;
$$;

GRANT EXECUTE ON FUNCTION reserve_resend_quota_slot(INT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION release_resend_quota_slot() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_resend_inbound_usage() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_resend_quota_status() TO anon, authenticated, service_role;
