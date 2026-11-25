-- VERIFY 0057 - run this after 0057_proposals.sql. Every line should say OK.

select '1. the proposal tables are there' as check,
       case when to_regclass('public.proposal_deals') is not null and to_regclass('public.proposals') is not null
             and to_regclass('public.proposal_templates') is not null and to_regclass('public.proposal_events') is not null
             and to_regclass('public.proposal_acceptances') is not null and to_regclass('public.proposal_payments') is not null
            then 'OK' else 'PROBLEM - 0057 did not run' end as result;

select '2. only the team can see proposals (rules switched on)' as check,
       case when (select bool_and(relrowsecurity) from pg_class where oid in (
                    'public.proposal_deals'::regclass, 'public.proposals'::regclass, 'public.proposal_templates'::regclass,
                    'public.proposal_events'::regclass, 'public.proposal_acceptances'::regclass, 'public.proposal_payments'::regclass))
            then 'OK' else 'PROBLEM - rules missing' end as result;

select '3. sales only see their own deals' as check,
       case when to_regprocedure('public.can_see_deal(uuid)') is not null
             and exists (select 1 from pg_policies where tablename = 'proposals' and policyname = 'proposals: read')
            then 'OK' else 'PROBLEM - deal rules missing' end as result;

select '4. accepted proposals can''t be edited' as check,
       case when exists (select 1 from pg_trigger where tgname = 'proposals_guard') then 'OK' else 'PROBLEM - guard missing' end as result;

select '5. cash payments and "Needs a team" work' as check,
       case when to_regprocedure('public.record_cash_payment(uuid,numeric,text)') is not null
             and to_regprocedure('public.clients_needing_team()') is not null
             and exists (select 1 from information_schema.columns where table_name = 'clients' and column_name = 'from_proposal_id')
            then 'OK' else 'PROBLEM - 0057 did not finish' end as result;
