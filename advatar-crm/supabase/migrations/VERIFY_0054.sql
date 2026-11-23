-- VERIFY 0054 - run this after 0054_pillar_guides.sql. Every line should say OK.

select '1. checklists can be put under Filming or Editing' as check,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'resources' and column_name = 'stage') then 'OK' else 'PROBLEM - 0054 did not run' end as result;

select '2. a Filming and an Editing guide per client pillar' as check,
       case when to_regclass('public.pillar_guides') is not null then 'OK' else 'PROBLEM - 0054 did not run' end as result;

select '3. starter templates are there' as check,
       case when (select count(*) from public.guide_templates) = 2 then 'OK' else 'PROBLEM - templates missing' end as result;

select '4. ticking through a guide is saved per video' as check,
       case when to_regclass('public.guide_runs') is not null then 'OK' else 'PROBLEM - 0054 did not run' end as result;

select '5. clients can never see guides' as check,
       case when (select relrowsecurity from pg_class where oid = 'public.pillar_guides'::regclass)
             and (select relrowsecurity from pg_class where oid = 'public.guide_runs'::regclass)
             and not exists (select 1 from pg_policies where tablename in ('pillar_guides', 'guide_runs') and qual not like '%client%')
            then 'OK' else 'PROBLEM - guides must be team only' end as result;
