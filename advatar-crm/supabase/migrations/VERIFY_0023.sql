-- Run AFTER 0023, on its own. Changes nothing.
-- Both rows should say OK.

select 'resources read policy present' as thing,
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='resources'
                         and policyname='resources: read own audience')
            then 'OK' else 'MISSING' end as state
union all
select 'policy no longer narrows by assigned_to',
       case when not exists (
              select 1 from pg_policies
              where schemaname='public' and tablename='resources'
                and policyname='resources: read own audience'
                and qual like '%assigned_to%'
            ) then 'OK' else 'STILL NARROWED' end
order by thing;
