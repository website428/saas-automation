-- Idempotent repair for production projects where migration 016 was skipped
-- or the quota RPC was created without the named arguments used by PostgREST.

CREATE TABLE IF NOT EXISTS public.resend_daily_quota (
  quota_date DATE PRIMARY KEY,
  used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.resend_daily_quota ENABLE ROW LEVEL SECURITY;

-- Keep the argument names in sync with the Supabase client's .rpc() payload.
-- PostgREST resolves RPC calls by both function name and named arguments.
CREATE OR REPLACE FUNCTION public.reserve_resend_quota_slot(
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

  INSERT INTO public.resend_daily_quota (quota_date, used_count)
  VALUES (CURRENT_DATE, 0)
  ON CONFLICT (quota_date) DO NOTHING;

  SELECT used_count INTO today_used
  FROM public.resend_daily_quota
  WHERE quota_date = CURRENT_DATE;

  SELECT COALESCE(SUM(used_count), 0) INTO month_used
  FROM public.resend_daily_quota
  WHERE quota_date >= date_trunc('month', CURRENT_DATE)::date
    AND quota_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date;

  IF today_used >= safe_daily OR month_used >= safe_monthly THEN
    RETURN FALSE;
  END IF;

  UPDATE public.resend_daily_quota
  SET used_count = used_count + 1, updated_at = NOW()
  WHERE quota_date = CURRENT_DATE;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_resend_quota_slot() RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.resend_daily_quota
  SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
  WHERE quota_date = CURRENT_DATE;
$$;

CREATE OR REPLACE FUNCTION public.record_resend_inbound_usage() RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('resend-account-quota'));
  INSERT INTO public.resend_daily_quota (quota_date, used_count, updated_at)
  VALUES (CURRENT_DATE, 1, NOW())
  ON CONFLICT (quota_date) DO UPDATE
    SET used_count = public.resend_daily_quota.used_count + 1, updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_resend_quota_status()
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
  FROM public.resend_daily_quota;
$$;

-- Spread a campaign's initial messages through the domain's working window.
-- This is intentionally one RPC so a large campaign does not require one
-- browser request per queue row. Follow-ups are left untouched; the worker
-- recalculates their eligibility from the actual preceding send time.
CREATE OR REPLACE FUNCTION public.schedule_campaign_initial_emails(
  target_campaign_id UUID,
  requested_start_at TIMESTAMPTZ
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  domain_start INT;
  domain_end INT;
  daily_capacity INT;
  local_start TIMESTAMP;
  cursor_date DATE;
  slot_start_minute INT;
  slot_end_minute INT;
  slot_span INT;
  slot_index INT := 0;
  day_position INT;
  item RECORD;
  scheduled_local TIMESTAMP;
  updated_count INT := 0;
BEGIN
  SELECT
    COALESCE(d.send_hour_start, 9),
    COALESCE(d.send_hour_end, 20),
    LEAST(GREATEST(COALESCE(d.daily_limit, 20), 1), 100)
  INTO domain_start, domain_end, daily_capacity
  FROM public.campaigns c
  JOIN public.domains d ON d.id = c.domain_id
  WHERE c.id = target_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign or sending domain was not found';
  END IF;

  IF domain_end <= domain_start THEN
    RAISE EXCEPTION 'The sending domain has an invalid working-hour window';
  END IF;

  -- Scheduling is displayed and selected in IST throughout this app.
  local_start := requested_start_at AT TIME ZONE 'Asia/Kolkata';
  cursor_date := local_start::date;
  slot_start_minute := GREATEST(
    (EXTRACT(HOUR FROM local_start)::INT * 60) + EXTRACT(MINUTE FROM local_start)::INT,
    domain_start * 60
  );

  -- If the chosen time is after today's window, start next working day.
  IF slot_start_minute >= domain_end * 60 THEN
    cursor_date := cursor_date + 1;
    slot_start_minute := domain_start * 60;
  END IF;

  WHILE EXTRACT(DOW FROM cursor_date) = 0 LOOP
    cursor_date := cursor_date + 1;
  END LOOP;

  slot_end_minute := (domain_end * 60) - 5;

  FOR item IN
    SELECT id
    FROM public.email_queue
    WHERE campaign_id = target_campaign_id
      AND sequence_step = 1
      AND status = 'queued'
    ORDER BY scheduled_at ASC, id ASC
  LOOP
    day_position := slot_index % daily_capacity;

    IF day_position = 0 AND slot_index > 0 THEN
      cursor_date := cursor_date + 1;
      WHILE EXTRACT(DOW FROM cursor_date) = 0 LOOP
        cursor_date := cursor_date + 1;
      END LOOP;
      slot_start_minute := domain_start * 60;
    END IF;

    -- Fit each day's capacity evenly between the selected start and the end
    -- of the working window. A one-message day starts at slot_start_minute.
    slot_span := GREATEST(slot_end_minute - slot_start_minute, 0);
    IF daily_capacity = 1 THEN
      scheduled_local := cursor_date + (slot_start_minute * INTERVAL '1 minute');
    ELSE
      scheduled_local := cursor_date + (
        (slot_start_minute + ROUND(slot_span * day_position::NUMERIC / (daily_capacity - 1))::INT)
        * INTERVAL '1 minute'
      );
    END IF;

    UPDATE public.email_queue
    SET scheduled_at = scheduled_local AT TIME ZONE 'Asia/Kolkata',
        error_message = NULL
    WHERE id = item.id;

    slot_index := slot_index + 1;
    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_resend_quota_slot(INT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_resend_quota_slot() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_resend_inbound_usage() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_resend_quota_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_campaign_initial_emails(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- Ensure PostgREST sees the repaired RPC signatures without waiting for an
-- automatic schema-cache refresh.
NOTIFY pgrst, 'reload schema';
