-- Phase 11 verification pass — a real gap found while auditing every
-- table against "videographer never receives another staff member's
-- payments" and "client never receives another client's row."
--
-- `payments.staff_id` is a bare FK to `profiles (id)` (Phase 3) with
-- no constraint on WHICH role that profile has. `payments: read own`
-- (Phase 3) is `using (staff_id = auth.uid())` — it isn't scoped by
-- `current_role()` at all, it's scoped purely by "does this row's
-- staff_id match my own id." That's fine as long as `staff_id` only
-- ever holds a staff/videographer profile's id, which the UI already
-- enforces (`app/app/payments/add-payment-form.tsx`'s picker only
-- lists `role in ('staff','videographer')`) — but nothing before this
-- migration stopped `addPayment` (`app/app/payments/actions.ts`), or a
-- direct API/curl call using a ceo's own valid session, from inserting
-- a payments row with `staff_id` set to a CLIENT's profile id instead.
-- If that ever happened — by a bug, a manipulated request, or a typo
-- in a future admin script — that client's own account would then
-- legitimately match `staff_id = auth.uid()` and could read that
-- payments row straight back through the existing RLS policy, exactly
-- the kind of cross-tenant leak this verification pass was asked to
-- rule out. Not something today's UI can trigger, but not something
-- the database was actually preventing either — fixing it at the
-- table level rather than trusting every future caller to be as
-- careful as today's form.
create or replace function public.payments_staff_must_be_staff_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
begin
  select role into target_role from public.profiles where id = new.staff_id;

  if target_role is null or target_role not in ('staff', 'videographer') then
    raise exception 'payments.staff_id must reference a staff or videographer profile (got role: %)', coalesce(target_role, 'no such profile');
  end if;

  return new;
end;
$$;

drop trigger if exists payments_staff_must_be_staff_role on payments;
create trigger payments_staff_must_be_staff_role
  before insert or update of staff_id on payments
  for each row
  execute procedure public.payments_staff_must_be_staff_role();
