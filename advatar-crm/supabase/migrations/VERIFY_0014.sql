-- Run AFTER 0014, on its own. Changes nothing.
-- Every row should say PRESENT.

select 'table client_checklist_items' as thing,
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='client_checklist_items')
            then 'PRESENT' else 'MISSING' end as state
union all
select 'table task_templates',
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='task_templates')
            then 'PRESENT' else 'MISSING' end
union all
select 'table task_template_items',
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='task_template_items')
            then 'PRESENT' else 'MISSING' end
union all
select 'trigger create_onboarding_checklist',
       case when exists (select 1 from pg_trigger where tgname='create_onboarding_checklist')
            then 'PRESENT' else 'MISSING' end
union all
select 'trigger create_follow_up_task',
       case when exists (select 1 from pg_trigger where tgname='create_follow_up_task')
            then 'PRESENT' else 'MISSING' end
union all
select 'starter template seeded',
       case when exists (select 1 from public.task_templates where name='Content shoot cycle')
            then 'PRESENT' else 'MISSING' end
order by thing;
