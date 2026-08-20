-- ═══════════════════════════════════════════════════════════
-- Migration 013 — Add Bounce & Follow-up Email columns to campaigns
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ─── BOUNCE EMAIL ────────────────────────────────────────────────
alter table campaigns
  add column if not exists bounce_email_enabled boolean not null default false,
  add column if not exists bounce_subject        text,
  add column if not exists bounce_body           text;

-- ─── FOLLOW-UP EMAIL (sent when recipient never opens) ───────────
alter table campaigns
  add column if not exists followup_email_enabled boolean not null default false,
  add column if not exists followup_subject        text,
  add column if not exists followup_body           text,
  add column if not exists followup_delay_days     int default 3;

-- ─── COMMENTS ────────────────────────────────────────────────────
comment on column campaigns.bounce_email_enabled  is 'If true, a bounce-recovery email is queued when a hard/soft bounce is detected';
comment on column campaigns.bounce_subject        is 'Subject line for the bounce-recovery email';
comment on column campaigns.bounce_body           is 'Body (plain text or HTML) for the bounce-recovery email';
comment on column campaigns.followup_email_enabled is 'If true, a follow-up email is sent to contacts who never opened the initial email';
comment on column campaigns.followup_subject       is 'Subject line for the follow-up email';
comment on column campaigns.followup_body          is 'Body (plain text or HTML) for the follow-up email';
comment on column campaigns.followup_delay_days    is 'Number of days after the initial send before the follow-up is triggered (if no open detected)';
