-- VERIFY_0034.sql — read-only. Run after 0034.
--
-- Every row should read OK. Anything else means 0034 did not finish,
-- and the restore statement at the bottom puts things back.

-- 1. The backup exists and holds something.
select
  '1. backup table exists' as check,
  case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'planners_backup_0034'
  ) then 'OK' else 'PROBLEM - 0034 did not run' end as result;

-- 2. The backup covers every plan.
select
  '2. backup covers every plan' as check,
  case when (select count(*) from public.planners_backup_0034)
          >= (select count(*) from public.planners)
    then 'OK' else 'PROBLEM - fewer backed up than exist' end as result,
  (select count(*) from public.planners) as plans_now,
  (select count(*) from public.planners_backup_0034) as plans_backed_up;

-- 3. No plan is still sitting on the untouched example.
--
-- Matches the migration's own condition exactly. A plan that still
-- mentions "trending audio" because somebody kept that line while
-- rewriting the rest is NOT a problem -- it is their writing, and
-- the migration correctly left it alone. Only a plan carrying all
-- four fingerprints was never worked on.
select
  '3. untouched examples cleared' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' plan(s) are still the seeded example' end as result
from public.planners
where content->'thesis'->>'quote' like '%trending audio%'
  and content->'overview'->>'heading' = 'Three jobs, one feed'
  and content->'pillars'->'items'->0->>'name' = 'Client Work'
  and content->'guarantee'->>'body' like '%inbound DMs%';

-- 4. Every plan this migration rewrote has all thirteen sections.
--
-- Scoped to the blanked plans, like checks 5 and 6. A plan the
-- migration passed by is whatever its author has made it, and this
-- file has no business grading that.
select
  '4. sections on blanked plans' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' blanked plan(s) missing a section' end as result
from public.planners
where coalesce(content->'thesis'->>'quote', '') = ''
  and coalesce(content->'overview'->>'desc', '') = ''
  and not (content ?& array[
  'hero','thesis','overview','branding','pillars','format',
  'workflow','metrics','competitors','producing','slots','timeline','guarantee'
]);

-- 5. The furniture that should NOT be blank is still there, on the
--    plans this migration rewrote.
select
  '5. headings on blanked plans' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' blanked plan(s) lost their headings' end as result
from public.planners
where coalesce(content->'thesis'->>'quote', '') = ''
  and coalesce(content->'overview'->>'desc', '') = ''
  and (coalesce(content->'branding'->>'heading', '') = ''
    or coalesce(content->'pillars'->>'heading', '') = ''
    or coalesce(content->'slots'->>'desc', '') = '');

-- 6. Every plan this migration rewrote has the nine labelled rows.
--
-- Counted only over the plans it touched. A plan somebody has been
-- working on may well have more rows or fewer, because they added or
-- removed some -- which is theirs to do, not a fault.
select
  '6. branding rows on blanked plans' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' blanked plan(s) have the wrong rows' end as result
from public.planners
where coalesce(content->'thesis'->>'quote', '') = ''
  and jsonb_array_length(content->'branding'->'rows') <> 9;

-- 7. Work that was already there survived.
--
-- The one that matters most. This counts the plans that still have
-- writing in them -- which should be every plan anybody had started.
-- It is reported rather than judged, because only you know how many
-- that should be: read the number, and the list underneath.
select
  '7. plans with writing in them' as check,
  'kept ' || count(*) || ' (these were left untouched)' as result
from public.planners
where coalesce(content->'thesis'->>'quote', '') <> ''
   or coalesce(content->'overview'->>'desc', '') <> ''
   or coalesce(content->'guarantee'->>'body', '') <> '';

-- Every plan, and what happened to it. This is the one to read.
select
  c.name as client,
  p.status,
  case
    when coalesce(p.content->'thesis'->>'quote', '') <> ''
      or coalesce(p.content->'overview'->>'desc', '') <> ''
      then 'kept - has writing in it'
    else 'blank template'
  end as outcome,
  left(coalesce(p.content->'hero'->>'brand', ''), 40) as headline
from public.planners p
join public.clients c on c.id = p.client_id
order by outcome, c.name;

-- To undo 0034 completely:
--
--   update public.planners p
--   set content = b.content
--   from public.planners_backup_0034 b
--   where b.id = p.id;
