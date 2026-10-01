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

-- 3. The old example text is gone from every plan.
select
  '3. old example text cleared' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' plan(s) still carry it' end as result
from public.planners
where content::text like '%trending audio%'
   or content::text like '%Craft & Process%'
   or content::text like '%Kickoff call%';

-- 4. The structure survived: every plan still has all twelve sections.
select
  '4. every section present' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' plan(s) missing a section' end as result
from public.planners
where not (content ?& array[
  'hero','thesis','overview','branding','pillars','format',
  'workflow','metrics','competitors','producing','slots','timeline','guarantee'
]);

-- 5. The furniture that should NOT be blank is still there.
select
  '5. section headings kept' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' plan(s) lost their headings' end as result
from public.planners
where coalesce(content->'branding'->>'heading', '') = ''
   or coalesce(content->'pillars'->>'heading', '') = ''
   or coalesce(content->'slots'->>'desc', '') = '';

-- 6. The branding sheet kept its nine labelled rows, with prompts.
select
  '6. branding rows' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' plan(s) have the wrong rows' end as result
from public.planners
where jsonb_array_length(content->'branding'->'rows') <> 9;

-- 7. Nothing is left in the answer fields.
select
  '7. answers blank' as check,
  case when count(*) = 0 then 'OK'
       else 'PROBLEM - ' || count(*) || ' plan(s) still have answers' end as result
from public.planners
where coalesce(content->'thesis'->>'quote', '') <> ''
   or coalesce(content->'overview'->>'desc', '') <> ''
   or coalesce(content->'guarantee'->>'body', '') <> '';

-- A look at one plan, to see it with your own eyes.
select
  c.name as client,
  p.status,
  p.content->'branding'->'rows'->3->>'label' as fourth_branding_label,
  p.content->'branding'->'rows'->3->>'ph'    as fourth_branding_prompt,
  p.content->'format'->'stats'->0->>'label'  as first_stat_label,
  p.content->'format'->'stats'->0->>'ph'     as first_stat_prompt
from public.planners p
join public.clients c on c.id = p.client_id
order by c.name
limit 5;

-- To undo 0034 completely:
--
--   update public.planners p
--   set content = b.content
--   from public.planners_backup_0034 b
--   where b.id = p.id;
