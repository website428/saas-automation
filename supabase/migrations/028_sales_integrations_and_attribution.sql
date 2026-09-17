-- Growth integrations: Calendly bookings, payment attribution, and landing variants.
-- Run after migration 027 in the Supabase SQL Editor.

alter table public.sales_bookings
  add column if not exists provider text not null default 'manual',
  add column if not exists external_event_id text,
  add column if not exists external_invitee_id text,
  add column if not exists event_uri text,
  add column if not exists invitee_uri text,
  add column if not exists event_name text,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_sales_bookings_external_event
  on public.sales_bookings(external_event_id)
  where external_event_id is not null;

create index if not exists idx_sales_bookings_provider_status
  on public.sales_bookings(provider, status, start_at);

alter table public.contacts
  add column if not exists last_landing_variant text,
  add column if not exists last_payment_amount numeric(14,2),
  add column if not exists last_payment_currency text;

create index if not exists idx_contacts_meta_campaign on public.contacts(meta_campaign_id);
create index if not exists idx_contacts_utm_campaign on public.contacts(last_utm_campaign);

comment on column public.sales_bookings.external_event_id is 'Idempotency key from Calendly or another booking provider.';
comment on column public.contacts.last_payment_amount is 'Latest attributed paid amount from a payment webhook.';
