select thing, case when ok then 'DONE' else 'NOT RUN' end as state from (
  select '0021 team messages + checklists' as thing, to_regclass('public.direct_messages') is not null as ok
  union all select '0022 names, phone, photos',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='phone')
  union all select '0023 shared SOP library', to_regclass('public.resources') is not null
  union all select '0024 ops manager scoping',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_see_client')
  union all select '0025 calendars + notifications', to_regclass('public.notifications') is not null
  union all select '0026 availability + role fix',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='availability')
  union all select '0027 ops manager assigns staff',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='may_assign_to_client')
  union all select '0028 uploads hub', to_regclass('public.client_assets') is not null
  union all select '0029 management means management',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_manage_client')
  union all select '0030 notification email',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='notify_email')
  union all select '0031 team directory (names)', to_regclass('public.team_directory') is not null
) rows order by thing;
