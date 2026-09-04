-- Phase 10: a real chat UI needs videographer/client to actually be
-- able to send messages and mark a thread's messages read — Phase 3
-- deliberately only gave them `select` on `messages`, with its own
-- comment flagging this as "message send/receive built out properly
-- in Phase 10." This is that migration.
--
-- Deliberately NOT touching `message_threads`' policies: only
-- ceo/staff can create a new thread (their existing Phase 3 "for all"
-- policy already covers that). A videographer or client can only ever
-- send into a thread that already exists — see README for why this
-- app doesn't let either of them spontaneously create one.

-- =================================================================
-- messages: insert (send)
-- =================================================================

drop policy if exists "messages: videographer send in assigned" on messages;
create policy "messages: videographer send in assigned"
  on messages for insert
  with check (
    public.current_role() = 'videographer'
    and sender_id = auth.uid()
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and public.is_assigned_staff(mt.client_id)
    )
  );

drop policy if exists "messages: client send own" on messages;
create policy "messages: client send own"
  on messages for insert
  with check (
    public.current_role() = 'client'
    and sender_id = auth.uid()
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and mt.client_id = public.current_client_id()
    )
  );

-- =================================================================
-- messages: update (mark read) — row-level only, see the trigger
-- below for why that isn't the whole story.
-- =================================================================

drop policy if exists "messages: videographer update in assigned" on messages;
create policy "messages: videographer update in assigned"
  on messages for update
  using (
    public.current_role() = 'videographer'
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and public.is_assigned_staff(mt.client_id)
    )
  )
  with check (
    public.current_role() = 'videographer'
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and public.is_assigned_staff(mt.client_id)
    )
  );

drop policy if exists "messages: client update own" on messages;
create policy "messages: client update own"
  on messages for update
  using (
    public.current_role() = 'client'
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and mt.client_id = public.current_client_id()
    )
  )
  with check (
    public.current_role() = 'client'
    and exists (
      select 1 from message_threads mt
      where mt.id = messages.thread_id
        and mt.client_id = public.current_client_id()
    )
  );

-- =================================================================
-- Column lock: the two update policies above are row-level, the same
-- limitation flagged in Phase 8's README for `payments` — a
-- videographer/client with an "update this row" grant can technically
-- update ANY column PostgREST sends, not just `read`. For a payments
-- ledger that gap didn't matter (no update policy existed for
-- non-ceo roles at all); here it very much does, since "mark as read"
-- is now genuinely writable by a client — without this, a client
-- could rewrite the body of a message staff already sent, or
-- reassign who it's from, just by sending a different UPDATE payload
-- than the UI's own `.update({ read: true })` ever would.
--
-- RLS can't express "this role may change column X but not column Y"
-- on its own, so this is enforced with a trigger instead: for anyone
-- who isn't ceo/staff, reject an UPDATE that touches any column other
-- than `read`.
-- =================================================================

create or replace function public.messages_restrict_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff_or_ceo() then
    return new;
  end if;

  if new.thread_id is distinct from old.thread_id
    or new.sender_id is distinct from old.sender_id
    or new.sender_role is distinct from old.sender_role
    or new.body is distinct from old.body
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only ceo/staff may change a message beyond its read state.';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_restrict_update on messages;
create trigger messages_restrict_update
  before update on messages
  for each row
  execute procedure public.messages_restrict_update();
