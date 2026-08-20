-- ═══════════════════════════════════════════════════════════
-- ColdReach — Initial Schema
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── DOMAINS ────────────────────────────────────────────────
create table if not exists domains (
  id              uuid primary key default uuid_generate_v4(),
  domain_name     text not null unique,
  from_email      text not null,
  warmup_start    date,
  warmup_day      int not null default 0,
  daily_limit     int not null default 5,
  emails_sent_today int not null default 0,
  last_reset_date date,
  status          text not null default 'warming' check (status in ('warming','warm','paused','burned')),
  bounce_rate     numeric(5,2) not null default 0,
  health_score    int not null default 100 check (health_score between 0 and 100),
  created_at      timestamptz not null default now()
);

-- ─── CONTACTS ───────────────────────────────────────────────
create table if not exists contacts (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null,
  name        text,
  tags        text[] not null default '{}',
  status      text not null default 'pending' check (status in ('pending','sent','bounced','unsubscribed')),
  created_at  timestamptz not null default now()
);

-- ─── CAMPAIGNS ──────────────────────────────────────────────
create table if not exists campaigns (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null unique,
  domain_id           uuid not null references domains(id) on delete cascade,
  subject_a           text not null,
  subject_b           text,
  body_html           text not null,
  ab_test_split       int not null default 0 check (ab_test_split between 0 and 50),
  ab_winner           text check (ab_winner in ('a','b')),
  status              text not null default 'draft' check (status in ('draft','active','paused','aborted','completed')),
  total_contacts      int not null default 0,
  sent_count          int not null default 0,
  opened_count        int not null default 0,
  bounced_count       int not null default 0,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

-- ─── SEQUENCES ──────────────────────────────────────────────
create table if not exists sequences (
  id              uuid primary key default uuid_generate_v4(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  step_number     int not null,
  delay_days      int not null default 0,
  subject         text not null,
  body_html       text not null,
  send_condition  text not null default 'always' check (send_condition in ('always','no_open')),
  unique(campaign_id, step_number)
);

-- ─── EMAIL QUEUE ─────────────────────────────────────────────
create table if not exists email_queue (
  id              uuid primary key default uuid_generate_v4(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  contact_id      uuid not null references contacts(id) on delete cascade,
  domain_id       uuid not null references domains(id) on delete cascade,
  sequence_step   int not null default 1,
  scheduled_at    timestamptz not null,
  status          text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  attempts        int not null default 0,
  sent_at         timestamptz,
  resend_id       text,
  error_message   text,
  created_at      timestamptz not null default now()
);

-- ─── SEND LOGS ──────────────────────────────────────────────
create table if not exists send_logs (
  id          uuid primary key default uuid_generate_v4(),
  queue_id    uuid not null references email_queue(id) on delete cascade,
  domain_id   uuid not null references domains(id),
  contact_id  uuid not null references contacts(id),
  resend_id   text,
  event       text not null check (event in ('delivered','bounced','opened','clicked','complained','failed')),
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

-- ─── DAILY WARMUP LOG ────────────────────────────────────────
create table if not exists daily_warmup_log (
  id          uuid primary key default uuid_generate_v4(),
  domain_id   uuid not null references domains(id) on delete cascade,
  log_date    date not null,
  sent        int not null default 0,
  bounced     int not null default 0,
  opened      int not null default 0,
  daily_limit int not null,
  unique(domain_id, log_date)
);

-- ─── INDEXES ─────────────────────────────────────────────────
create index if not exists idx_email_queue_status on email_queue(status);
create index if not exists idx_email_queue_scheduled on email_queue(scheduled_at) where status = 'queued';
create index if not exists idx_email_queue_campaign on email_queue(campaign_id);
create index if not exists idx_send_logs_domain on send_logs(domain_id);
create index if not exists idx_send_logs_event on send_logs(event);
create index if not exists idx_contacts_status on contacts(status);
create index if not exists idx_contacts_email on contacts(email);
create index if not exists idx_campaigns_status on campaigns(status);

-- ─── VIEWS ───────────────────────────────────────────────────

-- Dashboard overview stats view
create or replace view dashboard_stats as
select
  (select count(*) from contacts where status != 'unsubscribed') as total_contacts,
  (select count(*) from email_queue where status = 'sent') as total_sent,
  (select count(*) from email_queue where status = 'queued') as total_pending,
  (select count(*) from send_logs where event = 'opened') as total_opened,
  (select count(*) from send_logs where event = 'bounced') as total_bounced,
  (select count(*) from campaigns where status = 'active') as active_campaigns;

-- Domain health view
create or replace view domain_health as
select
  d.id,
  d.domain_name,
  d.from_email,
  d.warmup_day,
  d.daily_limit,
  d.emails_sent_today,
  d.status,
  d.bounce_rate,
  d.health_score,
  d.warmup_start,
  (select count(*) from email_queue eq where eq.domain_id = d.id and eq.status = 'queued') as queued_count,
  (select count(*) from email_queue eq where eq.domain_id = d.id and eq.status = 'sent') as total_sent
from domains d;

-- ─── SEED DATA ───────────────────────────────────────────────

-- Step 1: Drop the unique constraint on email if it exists
--         (Supabase auto-named it "contacts_email_key")
alter table contacts drop constraint if exists contacts_email_key;

-- Step 2: Clear any stale test contacts and re-seed fresh
delete from contacts where tags @> array['test'];

-- Step 3: Insert verified domain
insert into domains (domain_name, from_email, warmup_start, warmup_day, daily_limit, status, health_score)
values (
  'financialmodel.io',
  'noreply@financialmodel.io',
  current_date,
  1,
  5,
  'warming',
  100
)
on conflict (domain_name) do nothing;

-- Step 4: Insert 10 test contacts — all deliver to princeguptaca9@gmail.com
insert into contacts (email, name, tags) values
  ('princeguptaca9@gmail.com', 'Prince Gupta',   array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Rahul Sharma',   array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Priya Mehta',    array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Arjun Verma',    array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Neha Kapoor',    array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Vikram Singh',   array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Anjali Patel',   array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Rohan Malhotra', array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Divya Nair',     array['test','financialmodel']),
  ('princeguptaca9@gmail.com', 'Karan Joshi',    array['test','financialmodel']);
