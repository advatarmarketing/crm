-- 0045 - Video months
--
-- A client's videos are worked in numbered months ("Month 1",
-- "Month 2"...) that start when their work starts, not on the 1st.
-- Each month has a start date and an expected end date the team can
-- change, and its videos are numbered Video 1, 2, 3...
--
-- Safe to run twice. Needs 0042 (the video schedule).

create table if not exists public.content_cycles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  number integer not null check (number between 1 and 999),
  starts_on date not null,
  ends_on date not null,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_cycles_dates_in_order check (ends_on >= starts_on),
  constraint content_cycles_number_unique unique (client_id, number)
);

alter table public.content_cycles enable row level security;

-- The same four doors as the videos themselves (0042).
drop policy if exists "content_cycles: management" on public.content_cycles;
create policy "content_cycles: management" on public.content_cycles
  for all using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

drop policy if exists "content_cycles: staff assigned" on public.content_cycles;
create policy "content_cycles: staff assigned" on public.content_cycles
  for all using (public.current_role() = 'staff' and public.is_assigned_staff(client_id))
  with check (public.current_role() = 'staff' and public.is_assigned_staff(client_id));

drop policy if exists "content_cycles: videographer reads assigned" on public.content_cycles;
create policy "content_cycles: videographer reads assigned" on public.content_cycles
  for select using (public.current_role() = 'videographer' and public.is_assigned_staff(client_id));

drop policy if exists "content_cycles: client reads own" on public.content_cycles;
create policy "content_cycles: client reads own" on public.content_cycles
  for select using (public.current_role() = 'client' and client_id = public.current_client_id());

drop trigger if exists content_cycles_touch_updated_at on public.content_cycles;
create trigger content_cycles_touch_updated_at
  before update on public.content_cycles
  for each row execute procedure public.content_videos_touch_updated_at();

-- Which month a video belongs to, and its place in it. Removing a
-- month leaves its videos on the schedule, just outside any month.
alter table public.content_videos
  add column if not exists cycle_id uuid references public.content_cycles (id) on delete set null,
  add column if not exists position integer;

create index if not exists content_videos_cycle_idx on public.content_videos (cycle_id, position);

-- Videos already on the schedule: each client's Month 1 starts on
-- their earliest video, and months follow on from there one calendar
-- month at a time. Only runs for clients with no months yet, so a
-- second run changes nothing.
do $$
declare
  c record;
  first_day date;
  last_day date;
  month_start date;
  month_end date;
  n integer;
  cycle uuid;
begin
  for c in
    select distinct v.client_id
    from public.content_videos v
    where not exists (select 1 from public.content_cycles k where k.client_id = v.client_id)
  loop
    select min(publish_on), max(publish_on) into first_day, last_day
    from public.content_videos where client_id = c.client_id;
    if first_day is null then
      first_day := current_date;
      last_day := current_date;
    end if;

    n := 1;
    month_start := first_day;
    while month_start <= last_day and n <= 120 loop
      month_end := (first_day + make_interval(months => n))::date - 1;
      if n = 1 or exists (
        select 1 from public.content_videos
        where client_id = c.client_id and publish_on between month_start and month_end
      ) then
        insert into public.content_cycles (client_id, number, starts_on, ends_on)
        values (
          c.client_id,
          (select coalesce(max(number), 0) + 1 from public.content_cycles where client_id = c.client_id),
          month_start, month_end
        )
        returning id into cycle;

        update public.content_videos
        set cycle_id = cycle
        where client_id = c.client_id
          and (publish_on between month_start and month_end or (n = 1 and publish_on is null));
      end if;
      n := n + 1;
      month_start := month_end + 1;
    end loop;
  end loop;

  -- Number them in the order they go out.
  update public.content_videos v
  set position = r.rn
  from (
    select id, row_number() over (
      partition by cycle_id order by publish_on nulls last, day_order, created_at, id
    ) as rn
    from public.content_videos
    where cycle_id is not null
  ) r
  where r.id = v.id and v.position is null;
end $$;
