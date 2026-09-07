-- Support visual landing pages with screenshots and customer reviews.
alter table landing_pages
  add column if not exists design_key text not null default 'sage';

alter table landing_pages
  drop constraint if exists landing_pages_design_key_check;

alter table landing_pages
  add constraint landing_pages_design_key_check
  check (design_key in ('sage','midnight','violet','editorial','aurora'));

alter table landing_page_sections
  drop constraint if exists landing_page_sections_section_type_check;

alter table landing_page_sections
  add constraint landing_page_sections_section_type_check
  check (section_type in ('hero','features','proof','pricing','faq','cta','lead_form','logos','gallery','reviews'));

insert into storage.buckets (id, name, public)
values ('landing-assets', 'landing-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Landing assets are publicly readable" on storage.objects;
create policy "Landing assets are publicly readable"
  on storage.objects for select
  using (bucket_id = 'landing-assets');
