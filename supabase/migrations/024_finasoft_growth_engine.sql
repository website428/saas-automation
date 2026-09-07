-- Finasoft Growth Engine: qualification, CRM pipeline, bookings, tasks,
-- partners, content planning and revenue attribution.
-- Run after migration 023 in the Supabase SQL editor.

alter table public.contacts
  add column if not exists phone text,
  add column if not exists company_website text,
  add column if not exists industry text,
  add column if not exists employee_count integer,
  add column if not exists requirement text,
  add column if not exists problem_statement text,
  add column if not exists budget_band text,
  add column if not exists timeline text,
  add column if not exists decision_maker boolean not null default false,
  add column if not exists manual_hours_weekly numeric(10,2),
  add column if not exists hourly_cost numeric(12,2),
  add column if not exists repetitive_workflows integer,
  add column if not exists estimated_monthly_savings numeric(14,2),
  add column if not exists lead_score integer not null default 0,
  add column if not exists lead_temperature text not null default 'nurture',
  add column if not exists pipeline_stage text not null default 'new',
  add column if not exists next_action_at timestamptz,
  add column if not exists owner_notes text,
  add column if not exists last_utm_source text,
  add column if not exists last_utm_medium text,
  add column if not exists last_utm_campaign text,
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id text,
  add column if not exists meta_ad_id text,
  add column if not exists meta_form_id text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_contacts_lead_score on public.contacts(lead_score desc);
create index if not exists idx_contacts_pipeline_stage on public.contacts(pipeline_stage);
create index if not exists idx_contacts_next_action on public.contacts(next_action_at) where next_action_at is not null;

create table if not exists public.automation_audits (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  offer_slug text not null default 'ai-automation',
  industry text,
  requirement text,
  problem_statement text,
  employee_count integer,
  repetitive_workflows integer,
  manual_hours_weekly numeric(10,2),
  hourly_cost numeric(12,2),
  budget_band text,
  timeline text,
  decision_maker boolean not null default false,
  lead_score integer not null default 0,
  lead_temperature text not null default 'nurture',
  estimated_monthly_cost numeric(14,2) not null default 0,
  estimated_monthly_savings numeric(14,2) not null default 0,
  potential text not null default 'medium',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_bookings (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  requested_date date,
  requested_time text,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'requested',
  meeting_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_tasks (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid references public.contacts(id) on delete cascade,
  title text not null,
  task_type text not null default 'follow_up',
  priority text not null default 'normal',
  due_at timestamptz,
  status text not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_activity (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid references public.contacts(id) on delete cascade,
  activity_type text not null,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.growth_partners (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  company text,
  email text,
  partner_type text not null default 'agency',
  stage text not null default 'prospect',
  potential_value numeric(14,2),
  follow_up_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_content (
  id uuid primary key default uuid_generate_v4(),
  channel text not null default 'linkedin',
  pillar text not null default 'education',
  title text not null,
  body text,
  cta text,
  status text not null default 'idea',
  scheduled_for timestamptz,
  published_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audits_contact_created on public.automation_audits(contact_id, created_at desc);
create index if not exists idx_bookings_status_date on public.sales_bookings(status, requested_date);
create index if not exists idx_sales_tasks_status_due on public.sales_tasks(status, due_at);
create index if not exists idx_sales_activity_contact on public.sales_activity(contact_id, created_at desc);
create index if not exists idx_partners_stage_followup on public.growth_partners(stage, follow_up_at);
create index if not exists idx_growth_content_status_date on public.growth_content(status, scheduled_for);

alter table public.automation_audits enable row level security;
alter table public.sales_bookings enable row level security;
alter table public.sales_tasks enable row level security;
alter table public.sales_activity enable row level security;
alter table public.growth_partners enable row level security;
alter table public.growth_content enable row level security;

insert into public.marketing_automation_rules (event_key, delay_minutes, stop_events)
values
  ('qualified_lead', 2, '{audit_booked,paid}'),
  ('hot_lead', 0, '{audit_booked,paid}'),
  ('audit_booked', 2, '{paid}'),
  ('proposal_sent', 2, '{paid}'),
  ('pilot_paid', 2, '{}'),
  ('customer_won', 2, '{}')
on conflict (event_key) do nothing;

comment on table public.automation_audits is 'Qualification and ROI calculator submissions from Finasoft offer pages.';
comment on table public.sales_tasks is 'Daily founder follow-ups generated by lead qualification and pipeline actions.';
