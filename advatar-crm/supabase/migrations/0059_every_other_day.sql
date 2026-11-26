-- 0059 - "Every other day" as a way of posting
--
-- Adds a fourth choice under "When we post" on a client's Package:
-- post one day, skip the next, counted from the first day of each
-- month (15 videos in a 30-day month, 16 in a 31-day one). The app
-- works out the dates; the database only needs to accept the word.
--
-- Safe to run twice. Needs 0041.

do $$
declare
  t text;
  c record;
begin
  foreach t in array array['client_packages', 'package_presets'] loop
    -- 0041 left the check on posting_mode unnamed, so find it by what
    -- it checks rather than by name.
    for c in
      select con.conname
      from pg_constraint con
      where con.conrelid = ('public.' || t)::regclass
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) like '%posting_mode%'
        and pg_get_constraintdef(con.oid) like '%per_week%'
        and pg_get_constraintdef(con.oid) not like '%videos_per_week%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I check (posting_mode in (''weekdays'', ''daily'', ''per_week'', ''alternate''))',
      t, t || '_posting_mode_check'
    );
  end loop;
end $$;
