-- Enable live Inbox updates for the dashboard subscriptions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'inbox_threads'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_threads;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'inbox_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
  END IF;
END $$;

