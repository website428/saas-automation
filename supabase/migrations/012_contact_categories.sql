-- ═══════════════════════════════════════════════════════════
-- ColdReach — Migration 012: Contact Categories
-- ═══════════════════════════════════════════════════════════

-- 1. Create categories table
create table if not exists categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- 2. Add category_id to contacts table
alter table contacts add column if not exists category_id uuid references categories(id) on delete set null;

-- 3. Create index for faster filtering
create index if not exists idx_contacts_category on contacts(category_id);
