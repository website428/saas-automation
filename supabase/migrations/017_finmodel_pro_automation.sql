-- FinModel Pro lifecycle automation
-- Run after migrations 000-016 in the Supabase SQL editor.

alter table contacts
  add column if not exists source text,
  add column if not exists last_event text,
  add column if not exists last_event_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists churned_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists meta_lead_id text;

create index if not exists idx_contacts_last_event on contacts(last_event, last_event_at desc);
create index if not exists idx_contacts_trial_started on contacts(trial_started_at) where trial_started_at is not null;
create unique index if not exists idx_contacts_stripe_customer on contacts(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists idx_contacts_meta_lead on contacts(meta_lead_id) where meta_lead_id is not null;

create table if not exists marketing_automation_rules (
  id uuid primary key default uuid_generate_v4(),
  event_key text not null unique,
  campaign_id uuid references campaigns(id) on delete set null,
  enabled boolean not null default true,
  delay_minutes integer not null default 2 check (delay_minutes between 0 and 43200),
  stop_events text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketing_event_log (
  id uuid primary key default uuid_generate_v4(),
  idempotency_key text not null unique,
  source text not null,
  event_key text not null,
  external_id text,
  email text,
  contact_id uuid references contacts(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_marketing_event_log_email on marketing_event_log(email, created_at desc);
create index if not exists idx_marketing_event_log_external on marketing_event_log(source, external_id);

insert into marketing_automation_rules (event_key, delay_minutes, stop_events)
values
  ('lead_created', 2, '{trial_started,paid}'),
  ('trial_started', 2, '{paid,churned}'),
  ('integration_connected', 2, '{paid,churned}'),
  ('model_generated', 2, '{paid,churned}'),
  ('aha_reached', 2, '{paid,churned}'),
  ('demo_booked', 2, '{paid,churned}'),
  ('trial_day_11', 2, '{paid,churned}'),
  ('trial_day_13', 2, '{paid,churned}'),
  ('trial_expired', 2, '{paid,churned}'),
  ('paid', 2, '{trial_started,trial_day_11,trial_day_13,trial_expired}'),
  ('invoice_failed', 2, '{}'),
  ('subscription_cancelled', 2, '{}'),
  ('churned', 2, '{}')
on conflict (event_key) do nothing;

alter table marketing_automation_rules enable row level security;
alter table marketing_event_log enable row level security;

-- The application server uses the service role for webhook processing.
-- Add authenticated policies here if non-admin users should configure rules.
