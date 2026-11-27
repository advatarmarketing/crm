-- 0062 - The video sales letter page (app.advatar.co.uk/enquire-vsl)
--
-- The page's words, video link, logos and case studies are kept in one
-- row here and edited on the page itself by the CEO or operations.
-- The logos are stored in a public "site-media" folder, because anyone
-- visiting the page has to be able to load them.
--
-- The page reads this with the server's own access (visitors are not
-- signed in), so nobody outside the team needs a policy here. Saving
-- goes through the app, which checks the person is the CEO or
-- operations; the policies below say the same for anyone signed in.
--
-- Safe to run twice.

create table if not exists public.site_pages (
  slug text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.site_pages enable row level security;

drop policy if exists "site_pages: ceo and operations" on public.site_pages;
create policy "site_pages: ceo and operations" on public.site_pages
  for all using (public.current_role() in ('ceo', 'operations_manager'))
  with check (public.current_role() in ('ceo', 'operations_manager'));

insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do update set public = true;

drop policy if exists "site-media: public read" on storage.objects;
create policy "site-media: public read" on storage.objects
  for select using (bucket_id = 'site-media');

drop policy if exists "site-media: ceo and operations write" on storage.objects;
create policy "site-media: ceo and operations write" on storage.objects
  for insert with check (bucket_id = 'site-media' and public.current_role() in ('ceo', 'operations_manager'));

drop policy if exists "site-media: ceo and operations delete" on storage.objects;
create policy "site-media: ceo and operations delete" on storage.objects
  for delete using (bucket_id = 'site-media' and public.current_role() in ('ceo', 'operations_manager'));
