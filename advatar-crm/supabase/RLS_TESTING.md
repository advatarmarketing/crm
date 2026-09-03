# Testing RLS as a specific user

Two ways to do this, both real and both actually exercise the RLS
policies (neither is a substitute for the other — the script is what
you'd wire into CI; this file is for a quick one-off check without
leaving the Supabase dashboard).

## Option A — the verification scripts (recommended)

```bash
npm run seed:test-accounts   # creates 4 test accounts + cross-tenant data
npm run verify:rls           # signs in as each and checks the isolation rules
```

See `scripts/seed-test-accounts.ts` and `scripts/verify-rls.ts` — read
those files for exactly what they create and check before running
them against any project you care about (they insert real rows and
create real auth users, deliberately prefixed `test-*@advatar.test`
and idempotent, but still real writes).

## Option B — Supabase SQL editor's "run as user"

The SQL editor runs as the Postgres superuser (`postgres`) by default,
which **bypasses RLS entirely** — a query that "works" there proves
nothing about what an actual signed-in user can see. To make it
actually respect RLS, switch to the `authenticated` role and set the
JWT claim RLS policies read (`auth.uid()` is Postgres reading
`request.jwt.claim.sub` under the hood):

```sql
-- Run this first, in the SAME sql editor "run" — session settings set
-- with `set local` only last for the current transaction/statement
-- batch, so paste this together with the query you want to test, not
-- as two separate "run" clicks.
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-uuid-here>", "role": "authenticated"}';

select * from clients;             -- should only return rows this user's RLS allows
select * from planners;            -- e.g. a client's own draft plan should NOT appear
```

Get `<user-uuid-here>` from `select id, email from auth.users;` (or
from `scripts/seed-test-accounts.ts`'s console output after running
it). Reset with `reset role;` before running anything as yourself
again in the same editor tab.

This is genuinely equivalent to a real request from that user — same
`auth.uid()`, same policies — it's just manual, one query at a time,
which is why `verify:rls` exists for anything beyond a quick spot
check.
