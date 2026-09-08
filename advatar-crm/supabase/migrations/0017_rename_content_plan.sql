-- 0017: rename "90 Day Plan" to "Content Plan".
--
-- The rename is almost entirely a UI-label change, done in the app
-- code. Two things live in the database instead, and this migration
-- handles both:
--
--   1. The onboarding checklist step seeded by the trigger added in
--      0014_onboarding_templates.sql, which reads "90-day plan
--      approved". The trigger seeds the label as literal text, so
--      changing the app alone would leave every future client getting
--      the old wording.
--   2. The rows already created from that trigger for existing
--      clients, which need updating in place.
--
-- The /app/portal/plan route keeps its path deliberately — renaming
-- the URL would break links already sent to clients, and the path
-- isn't visible anywhere in the UI.

-- =================================================================
-- 1. Re-seed the trigger with the new wording
-- =================================================================
-- Same function as 0014, with one string changed. Redefined in full
-- rather than patched, so this file shows exactly what the trigger
-- ends up being.

create or replace function public.create_onboarding_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  steps text[] := array[
    'Kick-off call booked',
    'Brand assets collected',
    'Contract signed',
    'Content plan approved',
    'First shoot scheduled',
    'Portal access sent to client',
    'First invoice raised'
  ];
  step text;
  idx integer := 0;
begin
  -- Only on the transition into active, and only once: re-activating
  -- a paused client should not wipe or duplicate a checklist someone
  -- has already been working through.
  if new.stage = 'active'
     and (old.stage is distinct from 'active')
     and not exists (select 1 from public.client_checklist_items where client_id = new.id)
  then
    foreach step in array steps loop
      insert into public.client_checklist_items (client_id, label, position)
      values (new.id, step, idx);
      idx := idx + 1;
    end loop;
  end if;

  return new;
end;
$$;

-- =================================================================
-- 2. Update checklist items that already exist
-- =================================================================
-- Only touches the exact old label, so a step someone has renamed by
-- hand is left alone.

update public.client_checklist_items
set label = 'Content plan approved'
where label = '90-day plan approved';
