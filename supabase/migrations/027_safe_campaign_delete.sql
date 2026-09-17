-- Keep Inbox history when a campaign is deleted.
-- The API also detaches these references for immediate safety; this migration
-- makes direct SQL/dashboard deletes safe in future.

ALTER TABLE public.inbox_threads
  DROP CONSTRAINT IF EXISTS inbox_threads_campaign_id_fkey;

ALTER TABLE public.inbox_threads
  ADD CONSTRAINT inbox_threads_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.inbox_threads
  DROP CONSTRAINT IF EXISTS inbox_threads_queue_id_fkey;

ALTER TABLE public.inbox_threads
  ADD CONSTRAINT inbox_threads_queue_id_fkey
  FOREIGN KEY (queue_id) REFERENCES public.email_queue(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.webhook_events') IS NOT NULL THEN
    ALTER TABLE public.webhook_events
      DROP CONSTRAINT IF EXISTS webhook_events_campaign_id_fkey;

    ALTER TABLE public.webhook_events
      ADD CONSTRAINT webhook_events_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;
