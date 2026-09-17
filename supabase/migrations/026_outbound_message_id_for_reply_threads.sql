-- Store the RFC Message-ID assigned by Resend to each outbound message.
-- A recipient's reply references this in its In-Reply-To header, which lets
-- the Inbox attach the reply to the exact original campaign email.
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS outbound_message_id text;

CREATE INDEX IF NOT EXISTS idx_email_queue_outbound_message_id
  ON public.email_queue (outbound_message_id)
  WHERE outbound_message_id IS NOT NULL;
