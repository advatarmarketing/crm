-- Phase 4: Storage bucket for client avatars.
--
-- Public read (avatars are shown in the CRM grid and, later, the
-- client portal — no reason to gate viewing them behind auth), but
-- writes restricted to ceo/staff, mirroring the clients table's own
-- RLS from Phase 3.

insert into storage.buckets (id, name, public)
values ('client-avatars', 'client-avatars', true)
on conflict (id) do nothing;

drop policy if exists "client-avatars: public read" on storage.objects;
create policy "client-avatars: public read"
  on storage.objects for select
  using (bucket_id = 'client-avatars');

drop policy if exists "client-avatars: ceo/staff write" on storage.objects;
create policy "client-avatars: ceo/staff write"
  on storage.objects for insert
  with check (bucket_id = 'client-avatars' and public.is_staff_or_ceo());

drop policy if exists "client-avatars: ceo/staff update" on storage.objects;
create policy "client-avatars: ceo/staff update"
  on storage.objects for update
  using (bucket_id = 'client-avatars' and public.is_staff_or_ceo())
  with check (bucket_id = 'client-avatars' and public.is_staff_or_ceo());

drop policy if exists "client-avatars: ceo/staff delete" on storage.objects;
create policy "client-avatars: ceo/staff delete"
  on storage.objects for delete
  using (bucket_id = 'client-avatars' and public.is_staff_or_ceo());
