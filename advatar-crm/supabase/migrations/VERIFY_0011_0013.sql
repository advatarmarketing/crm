-- Run this AFTER 0011, 0012 and 0013, in its own tab.
-- It changes nothing. Every row it returns should say PRESENT.
-- If anything says MISSING, that migration didn't fully apply —
-- send the result back rather than carrying on.

select 'invoices.due_date' as thing,
       case when exists (select 1 from information_schema.columns
                         where table_name = 'invoices' and column_name = 'due_date')
            then 'PRESENT' else 'MISSING' end as state
union all
select 'invoices.paid_at',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'invoices' and column_name = 'paid_at')
            then 'PRESENT' else 'MISSING' end
union all
select 'documents.storage_path',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'documents' and column_name = 'storage_path')
            then 'PRESENT' else 'MISSING' end
union all
select 'fathom_calls.meeting_url',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'fathom_calls' and column_name = 'meeting_url')
            then 'PRESENT' else 'MISSING' end
union all
select 'clients.estimated_value',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'clients' and column_name = 'estimated_value')
            then 'PRESENT' else 'MISSING' end
union all
select 'clients.likelihood',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'clients' and column_name = 'likelihood')
            then 'PRESENT' else 'MISSING' end
union all
select 'clients.last_contacted_at',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'clients' and column_name = 'last_contacted_at')
            then 'PRESENT' else 'MISSING' end
union all
select 'table client_activity',
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'client_activity')
            then 'PRESENT' else 'MISSING' end
union all
select 'bucket client-documents',
       case when exists (select 1 from storage.buckets where id = 'client-documents')
            then 'PRESENT' else 'MISSING' end
union all
select 'policy invoices: management full access',
       case when exists (select 1 from pg_policies
                         where tablename = 'invoices' and policyname = 'invoices: management full access')
            then 'PRESENT' else 'MISSING' end
union all
select 'trigger log_client_stage_change',
       case when exists (select 1 from pg_trigger where tgname = 'log_client_stage_change')
            then 'PRESENT' else 'MISSING' end
order by thing;
