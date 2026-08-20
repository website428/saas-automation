-- Landing page builder and public lead-capture pages.
-- Run after migrations 000-018 in the Supabase SQL editor.

create table if not exists landing_pages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists landing_page_sections (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid not null references landing_pages(id) on delete cascade,
  section_type text not null check (section_type in ('hero','features','proof','pricing','faq','cta','lead_form','logos')),
  sort_order integer not null default 0,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_landing_pages_status on landing_pages(status);
create index if not exists idx_landing_sections_page_order on landing_page_sections(page_id, sort_order);

create table if not exists landing_page_submissions (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid not null references landing_pages(id) on delete cascade,
  email text not null,
  name text,
  company_name text,
  job_title text,
  phone text,
  message text,
  source text not null default 'landing-page',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_landing_submissions_page on landing_page_submissions(page_id, created_at desc);
create index if not exists idx_landing_submissions_email on landing_page_submissions(email, created_at desc);

alter table landing_pages enable row level security;
alter table landing_page_sections enable row level security;
alter table landing_page_submissions enable row level security;

drop policy if exists "Published landing pages are public" on landing_pages;
create policy "Published landing pages are public"
  on landing_pages for select
  using (status = 'published');

drop policy if exists "Published landing sections are public" on landing_page_sections;
create policy "Published landing sections are public"
  on landing_page_sections for select
  using (exists (
    select 1 from landing_pages
    where landing_pages.id = landing_page_sections.page_id
      and landing_pages.status = 'published'
  ));
