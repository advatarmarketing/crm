-- Run AFTER 0019, on its own. Changes nothing.
-- Every row in the first table should say OK.

select 'table event_categories' as thing,
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='event_categories')
            then 'OK' else 'MISSING' end as state
union all
select 'RLS on event_categories',
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relname='event_categories' and c.relrowsecurity)
            then 'OK' else 'MISSING' end
union all
select 'policy event_categories read',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='event_categories'
                         and policyname='event_categories: read all')
            then 'OK' else 'MISSING' end
union all
select 'policy event_categories manage',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='event_categories'
                         and policyname='event_categories: staff and up manage')
            then 'OK' else 'MISSING' end
union all
select 'the 8 starter categories seeded',
       case when (select count(*) from public.event_categories) >= 8
            then 'OK' else 'MISSING' end
union all
select 'schedule_events.category_id exists',
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='schedule_events'
                           and column_name='category_id')
            then 'OK' else 'MISSING' end
union all
select 'old schedule_events.kind column removed',
       case when not exists (select 1 from information_schema.columns
                             where table_schema='public' and table_name='schedule_events'
                               and column_name='kind')
            then 'OK' else 'STILL THERE' end
union all
select 'no events left without a category',
       case when not exists (select 1 from public.schedule_events where category_id is null)
            then 'OK' else 'SOME MISSING' end
union all
select 'policy tasks videographer update own',
       case when exists (select 1 from pg_policies where schemaname='public'
                         and tablename='tasks'
                         and policyname='tasks: videographer update own')
            then 'OK' else 'MISSING' end
union all
select 'trigger event_categories_touch_updated_at',
       case when exists (select 1 from pg_trigger where tgname='event_categories_touch_updated_at')
            then 'OK' else 'MISSING' end
order by thing;

-- The categories as they now stand, in the order they'll appear in
-- the app. Rename, recolour or delete any of these from
-- Settings → Event categories — they are a starting point.
select position, name, colour
from public.event_categories
order by position, name;
