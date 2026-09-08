-- Run AFTER 0018, on its own. Changes nothing.
-- Every row should say PRESENT.

select 'table schedule_events' as thing,
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='schedule_events')
            then 'PRESENT' else 'MISSING' end as state
union all
select 'table resources',
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='resources')
            then 'PRESENT' else 'MISSING' end
union all
select 'RLS on schedule_events',
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relname='schedule_events' and c.relrowsecurity)
            then 'PRESENT' else 'MISSING' end
union all
select 'RLS on resources',
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relname='resources' and c.relrowsecurity)
            then 'PRESENT' else 'MISSING' end
union all
select 'policy schedule_events management',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='schedule_events'
                         and policyname='schedule_events: management full access')
            then 'PRESENT' else 'MISSING' end
union all
select 'policy schedule_events staff',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='schedule_events'
                         and policyname='schedule_events: staff own or assigned')
            then 'PRESENT' else 'MISSING' end
union all
select 'policy schedule_events videographer',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='schedule_events'
                         and policyname='schedule_events: videographer read own')
            then 'PRESENT' else 'MISSING' end
union all
select 'policy resources management',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='resources'
                         and policyname='resources: management full access')
            then 'PRESENT' else 'MISSING' end
union all
select 'policy resources read own audience',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='resources'
                         and policyname='resources: read own audience')
            then 'PRESENT' else 'MISSING' end
union all
select 'policy tasks videographer read own',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='tasks'
                         and policyname='tasks: videographer read own')
            then 'PRESENT' else 'MISSING' end
union all
select 'trigger schedule_events_touch_updated_at',
       case when exists (select 1 from pg_trigger where tgname='schedule_events_touch_updated_at')
            then 'PRESENT' else 'MISSING' end
union all
select 'trigger resources_touch_updated_at',
       case when exists (select 1 from pg_trigger where tgname='resources_touch_updated_at')
            then 'PRESENT' else 'MISSING' end
order by thing;
