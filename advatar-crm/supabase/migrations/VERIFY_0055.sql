-- VERIFY 0055 - run this after 0055_your_journey.sql. Every line should say OK.

select '1. Videographer and Sales paths with their levels' as check,
       case when (select count(*) from public.journey_paths where key in ('videographer', 'sales')) = 2
             and (select count(*) from public.journey_levels) >= 16
            then 'OK' else 'PROBLEM - 0055 did not run' end as result;

select '2. the minimum level is CEO only' as check,
       case when (select relrowsecurity from pg_class where oid = 'public.journey_private'::regclass)
             and not exists (select 1 from pg_policies where tablename = 'journey_private' and qual not like '%ceo%')
            then 'OK' else 'PROBLEM - journey_private must be CEO only' end as result;

select '3. people only see their own journey (management sees all)' as check,
       case when exists (select 1 from pg_policies where tablename = 'journey_members' and qual like '%auth.uid()%')
             and (select relrowsecurity from pg_class where oid = 'public.journey_members'::regclass)
            then 'OK' else 'PROBLEM - journey_members rules missing' end as result;

select '4. only the CEO or ops can sign a step off' as check,
       case when exists (select 1 from pg_trigger where tgname = 'journey_ticks_guard') then 'OK' else 'PROBLEM - 0055 did not run' end as result;

select '5. the day each level is reached is recorded' as check,
       case when exists (select 1 from pg_trigger where tgname = 'journey_members_reached') then 'OK' else 'PROBLEM - 0055 did not run' end as result;
