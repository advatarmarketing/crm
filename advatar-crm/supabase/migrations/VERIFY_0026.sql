-- Run this after 0026_availability.sql. Every row should say true.

select 'profiles.availability exists' as check,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'availability'
       ) as pass

union all
select 'update-own policy exists',
       exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'profiles'
           and policyname = 'profiles: update own'
       )

-- The whole point of the migration's second half: the policy must now
-- carry a WITH CHECK, and that check must mention `role`. Without it,
-- any signed-in user can promote themselves to CEO.
union all
select 'update-own now has a WITH CHECK',
       coalesce(
         (select with_check is not null from pg_policies
          where schemaname = 'public' and tablename = 'profiles'
            and policyname = 'profiles: update own'),
         false
       )

union all
select 'that check pins the role column',
       coalesce(
         (select with_check like '%role%' from pg_policies
          where schemaname = 'public' and tablename = 'profiles'
            and policyname = 'profiles: update own'),
         false
       )

union all
select 'that check pins client_id too',
       coalesce(
         (select with_check like '%client_id%' from pg_policies
          where schemaname = 'public' and tablename = 'profiles'
            and policyname = 'profiles: update own'),
         false
       )

union all
select 'management can still update any profile',
       exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'profiles'
           and policyname = 'profiles: management update any'
       );
