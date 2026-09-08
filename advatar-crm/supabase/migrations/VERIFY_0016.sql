-- Run AFTER 0016, on its own. Changes nothing.
-- Every row should say PRESENT. If any row says MISSING, 0016 did not
-- fully apply — run it again and re-run this.

select 'bucket client-documents' as thing,
       case when exists (select 1 from storage.buckets where id='client-documents')
            then 'PRESENT' else 'MISSING' end as state
union all
select 'bucket is private (not public)',
       case when exists (select 1 from storage.buckets
                         where id='client-documents' and public = false)
            then 'PRESENT' else 'MISSING' end
union all
select 'fn current_role',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='current_role')
            then 'PRESENT' else 'MISSING' end
union all
select 'fn current_client_id',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='current_client_id')
            then 'PRESENT' else 'MISSING' end
union all
select 'fn is_management',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='is_management')
            then 'PRESENT' else 'MISSING' end
union all
select 'fn is_assigned_staff',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='is_assigned_staff')
            then 'PRESENT' else 'MISSING' end
union all
select 'fn storage_path_client_id',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='storage_path_client_id')
            then 'PRESENT' else 'MISSING' end
union all
select 'storage policy: client read own',
       case when exists (select 1 from pg_policies
                         where schemaname='storage' and tablename='objects'
                           and policyname='client-documents: client read own')
            then 'PRESENT' else 'MISSING' end
union all
select 'storage policy: management all',
       case when exists (select 1 from pg_policies
                         where schemaname='storage' and tablename='objects'
                           and policyname='client-documents: management all')
            then 'PRESENT' else 'MISSING' end
union all
select 'storage policy: staff assigned',
       case when exists (select 1 from pg_policies
                         where schemaname='storage' and tablename='objects'
                           and policyname='client-documents: staff assigned')
            then 'PRESENT' else 'MISSING' end
union all
select 'storage policy: videographer read assigned',
       case when exists (select 1 from pg_policies
                         where schemaname='storage' and tablename='objects'
                           and policyname='client-documents: videographer read assigned')
            then 'PRESENT' else 'MISSING' end
union all
select 'table policy: documents client read own',
       case when exists (select 1 from pg_policies
                         where schemaname='public' and tablename='documents'
                           and policyname='documents: client read own')
            then 'PRESENT' else 'MISSING' end
order by thing;

-- -----------------------------------------------------------------
-- Second check: do the stored files actually sit under a client id?
--
-- Every storage policy above finds the client by reading the first
-- folder of the file's path. Any row below that says BAD PATH can
-- never be opened by that client, no matter what the policies say —
-- the file would need re-uploading through the app.
-- -----------------------------------------------------------------

select d.name as document_name,
       d.storage_path,
       case
         when d.storage_path is null then 'no file (link-only row)'
         when public.storage_path_client_id(d.storage_path) is null then 'BAD PATH'
         when public.storage_path_client_id(d.storage_path) = d.client_id then 'OK'
         else 'BAD PATH'
       end as path_state
from public.documents d
order by path_state, d.name;
