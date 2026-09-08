-- Run AFTER 0017, on its own. Changes nothing.
-- Both rows should say OK.

select 'no old checklist labels left' as thing,
       case when not exists (select 1 from public.client_checklist_items
                             where label = '90-day plan approved')
            then 'OK' else 'STILL THERE' end as state
union all
select 'trigger seeds the new wording',
       case when exists (
              select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname = 'create_onboarding_checklist'
                and pg_get_functiondef(p.oid) like '%Content plan approved%'
            )
            then 'OK' else 'NOT UPDATED' end
order by thing;
