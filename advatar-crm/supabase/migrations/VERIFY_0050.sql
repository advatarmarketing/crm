-- VERIFY 0050 - run this after 0050_managed_accounts.sql.

select '1. profile links and first posting date can be saved' as check,
       case when (select count(*) from information_schema.columns
                  where table_schema = 'public' and table_name = 'clients'
                    and column_name in ('social_urls', 'posting_started_on')) = 2
            then 'OK' else 'PROBLEM - 0050 did not run' end as result;
