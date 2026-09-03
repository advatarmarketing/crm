# Advatar CRM — Phase 1 + Phase 2

This repo was hand-authored in a sandboxed session that could not reach
`registry.npmjs.org` or Google Fonts (outbound network is restricted
there), so `npm install`, `next dev`, and font fetching have **not**
been run or verified here. Everything below is correct, idiomatic
Next.js 14 / Supabase code — it just needs to be run for the first
time in an environment with normal internet access (your machine, or
Claude Code connected to your GitHub repo, per the roadmap).

## To actually run this

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase project's URL + keys
npm run dev
```

## What's here

**Phase 1 — scaffold & design tokens**
- `app/layout.tsx` — loads Bebas Neue / DM Sans / Space Mono via `next/font/google`
- `app/globals.css` — the full light/dark CSS custom-property system
- `tailwind.config.ts` — maps those custom properties into Tailwind's theme

**Phase 2 — auth & roles**
- `supabase/migrations/0001_profiles.sql` — `profiles` table, RLS, and
  the `on_auth_user_created` trigger that provisions a `role='client'`
  profile for every new `auth.users` row. **Run this in the Supabase
  SQL editor (or `supabase db push`) before anything else.**
- `lib/supabase/{client,server,admin}.ts` — browser / server / admin
  Supabase clients. `admin.ts` uses the service role key and is
  marked `server-only` so it can never end up in a client bundle.
- `lib/supabase/types.ts` — hand-written stub `Database` type
  (profiles + a minimal `clients` stub). **Replace this in Phase 3**
  with `npx supabase gen types typescript --project-id <ref>` once
  the real schema exists.
- `app/login/page.tsx` — exactly two tabs, Client and Staff, both
  blank, no CEO tab, no account picker. Switching tabs only swaps a
  line of hint copy; it doesn't touch the form fields or set any role.
- `app/login/actions.ts` — signs in via Supabase, reads
  `profiles.role`, redirects: `ceo`/`staff` → `/app/dashboard`,
  `videographer` → `/app/my-clients`, `client` → `/app/portal`. Role
  comes from the database, never from which tab was active.
- `middleware.ts` — protects everything under `/app/*`: no session →
  `/login`; wrong role for the path → redirected to that role's own
  home. This is a UX convenience, not the real security boundary —
  Postgres RLS (built out fully in Phase 3) is what actually stops a
  role from reading data it shouldn't, and this file's
  `ALLOWED_PREFIXES` map should never be treated as a substitute.
- `app/app/settings/team/` — CEO-only invite flow. Checks
  `profiles.role === 'ceo'` both in the page (redirects non-CEOs to
  the dashboard) and again inside the server action itself (never
  trust a page-level check alone, since the action is a reachable
  endpoint on its own). Uses `auth.admin.inviteUserByEmail` via the
  service-role client, then immediately corrects the new user's
  `profiles.role` from the default `client`.
- `app/app/{dashboard,my-clients,portal}/page.tsx` — placeholder
  landing pages per role, just enough to prove the redirect chain
  works end to end. Real content for these arrives in Phases 4, 7,
  and 9 respectively.

## Known gap to close in Phase 3

`profiles.client_id` is nullable with no DB-level constraint tying it
to `role='client'` — deliberately, because the auto-provisioning
trigger inserts new signups as `role='client'` with `client_id` still
null (a staff member links the account to a real client afterward).
Phase 3's migration should decide how that linking step actually
happens and whether any additional constraint or default belongs
there.

## Phase 3 — schema & RLS

- `supabase/migrations/0002_schema_rls.sql` — every table (clients,
  client_staff, planners, fathom_calls, documents, tasks,
  message_threads, messages, invoices, payments), RLS enabled on all
  of them, and the full policy set from the spec. Run this after
  `0001_profiles.sql`. It's written to be safely re-run (`drop policy
  if exists` before every `create policy`, `create table if not
  exists`, `add column if not exists`), so re-running it after a
  partial apply won't error.
- Five `security definer` helper functions (`current_role`,
  `current_client_id`, `is_ceo`, `is_staff_or_ceo`,
  `is_assigned_staff`) so policies on one table can safely check
  `profiles`/`client_staff` — which themselves have RLS — without
  recursing into the calling user's own restricted view of those
  tables. Every policy in this migration is built from these
  functions rather than repeating raw subqueries, so the access model
  lives in one place.
- `lib/supabase/types.ts` was rewritten by hand to match this schema.
  **This is not the output of `supabase gen types`** — this sandbox
  has no live Supabase project and no network path to Supabase's API
  (same restriction noted in the Phase 1/2 section above), so there
  was nothing to introspect. Once the migrations are applied to a
  real project, regenerate this file for real:
  ```
  npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/types.ts
  ```
  Do this before Phase 4 — hand-maintained types will silently drift
  from the schema the moment either one changes.
- **Could not run `npm run build` / `tsc --noEmit` to confirm the
  project actually compiles against these new types** — same network
  restriction, no `node_modules` here at all. Treat "does this build"
  as the first thing to check once this is in an environment with
  real internet access.

### Three things this migration deliberately left as-is, flagged rather than decided silently

1. **Videographer write access to planners/tasks/documents** — every
   policy for those three tables is select-only for videographers
   right now. The spec asked me to confirm with you which planner
   sections (if any) they should be able to edit before opening that
   up; this migration doesn't guess.
2. **Videographer messaging** — `messages`/`message_threads` are also
   select-only for videographers here, meaning they can't send a
   message yet even though "client communication" was called out
   earlier as something they need. The spec for this migration only
   asked for select access on messaging; real send/receive is
   explicitly Phase 10's job. Comments in the SQL flag this at the
   relevant policy so it isn't forgotten.
3. **`tasks.client_id` is nullable** and the videographer read policy
   only matches tasks tied to an assigned client — a client-less task
   assigned directly to a videographer (e.g. an internal to-do) isn't
   visible to them under the literal spec as written. Flagged in the
   SQL rather than silently widening the grant to `or assigned_to =
   auth.uid()`.

## Phase 4 — CRM shell (dashboard, clients grid, client detail)

- `supabase/migrations/0003_clients_finance_notes.sql` — a
  fix-forward migration this phase required. Phase 4's dashboard/grid
  spec calls the £ value ceo-only, but Phase 3 put `monthly_value` on
  `clients`, a table staff has full RLS access to — RLS is row-level,
  not column-level, so there was no clean way to give staff full
  access to that row while blocking just one column. Split it into a
  new `client_finance` table (one row per client, ceo-only in both
  directions), the same pattern Phase 3 already used for `invoices`.
  Existing `monthly_value` data is backfilled into the new table
  before the old column is dropped. Also adds `clients.notes` (a
  freeform text field), needed for the "notes" part of the client
  detail panel and not covered by any existing table.
- `supabase/migrations/0004_storage_client_avatars.sql` — creates the
  public `client-avatars` Storage bucket and its policies: public
  read, ceo/staff-only write (mirrors the `clients` table's own RLS).
- `lib/supabase/types.ts` updated to match: `clients.monthly_value` is
  gone, `clients.notes` added, `client_finance` added as a new table.
  Same caveat as before — hand-written, not `supabase gen types`
  output, regenerate for real once this is against a live project.
- `components/DonutChart.tsx` — server-renderable conic-gradient donut
  with a legend, palette gold `#D4AF6A` / slate `#6B8AA6` / sage
  `#8FA37F` / coral `#C77B58` / plum `#9A6FA0` / gray `#9AA0A6`, same
  order the original portal used.
- `app/app/dashboard/page.tsx` — stat tiles + Clients-by-Stage donut
  (both ceo and staff see this; middleware already keeps
  videographer/client off this route entirely, so "all roles" here
  means "both roles that can reach this page"). The Monthly Revenue
  tile and Revenue-by-Service donut are wrapped in `financeRows.length
  > 0`, not a role check — a staff session's `client_finance` query
  comes back empty because of RLS, and the section simply has nothing
  to render. One honest tradeoff: a brand-new CEO account with zero
  `client_finance` rows yet would see the same empty state as staff,
  for a different reason. Acceptable at this stage; flagging it rather
  than pretending it isn't there.
- `app/app/clients/page.tsx` — the card grid, fetching `clients` and
  `client_finance` as two separate queries so it's visible in the code
  that the £ figure is a distinctly more-restricted fetch. Each
  `ClientCard` only shows a value when a real number was returned for
  that client id, via a `Map.has()` check against the finance
  results — never a role flag.
- `app/app/clients/[id]/page.tsx` — detail panel: avatar upload,
  editable info fields (name, stage, contact, service, next action,
  notes), a monthly-value field that only renders when the
  `client_finance` fetch for that one client actually returned a row,
  a task checklist, and a documents list with an editable status
  dropdown. Every field saves on blur/change via a Supabase client
  update — no Save button — and updates optimistically, reverting and
  showing an inline error if the write comes back rejected (which is
  what happens if RLS blocks it, rather than the UI having pre-empted
  the attempt).
- `components/AvatarUpload.tsx` — canvas-based center-crop to 160×160,
  encodes to JPEG at quality 0.85, uploads to the `client-avatars`
  bucket under `${clientId}.jpg` (`upsert: true`, so re-uploading
  replaces the same object), then writes the resulting public URL
  (cache-busted with a `?t=` query param) onto `clients.avatar_url`.

### Still to verify once this has real internet access

Same standing caveat as Phases 1–3: could not `npm install` or build
here, so this hasn't been run. Two things worth a specific look once
it can be:
1. The `client_finance` embed in `app/app/dashboard/page.tsx`
   (`.select("client_id, monthly_value, clients(service)")`) relies on
   PostgREST following the `client_finance.client_id → clients.id`
   foreign key — should work given that FK exists, but the hand-written
   `Database` type doesn't encode relationships, so this is cast rather
   than properly typed. Regenerating types for real (see Phase 3 note
   above) will surface if anything about that embed needs adjusting.
2. `params.id` in `app/app/clients/[id]/page.tsx` is typed as `string`
   per Next 14's App Router convention — fine, but worth confirming
   against whatever Next.js patch version actually gets installed.

## Phase 5 — the 90-day planner, ported and made live

- `lib/planner/content.ts` — the `PlannerContent` type (every editable
  piece of `planner.html`: hero, logo, thesis, and eleven sections each
  with their own arrays — pillars, brand rows, schedule acts/weeks,
  workflow steps, metrics, competitor/producing links, monthly slots,
  timeline items, guarantee terms) plus `DEFAULT_PLANNER_CONTENT`,
  which is `planner.html`'s own hardcoded example copy, verbatim —
  used as the starting template for a brand-new client.
- `lib/planner/css.ts` — the original file's entire `<style>` block,
  scoped: every selector prefixed with `.planner-doc` (the original
  targeted `html`/`body`/`:root` directly, since it was a standalone
  page — those become the `.planner-doc` wrapper here) so it can sit
  inside the app's own layout without leaking into or being
  overridden by the app's global CSS. Values, spacing, and colours are
  unchanged — this is a scoping transform, not a restyle, per the "do
  not restyle or simplify anything visually" instruction.
- `components/PlannerDocument.tsx` — the port itself. A few structural
  decisions worth knowing about:
  - **Fetch/provision on mount**: selects the `planners` row for
    `clientId`; if `editable=false` the query also adds
    `.eq('status', 'published')` — a second check on top of Phase 3's
    RLS policy (`planners: client read own published`), per this
    phase's explicit "double check it here too". If no row exists and
    `editable=true`, inserts one from `DEFAULT_PLANNER_CONTENT` with
    `status='draft'`. If no row exists and `editable=false`, nothing
    is created — a client session has no insert policy on `planners`
    anyway, and shouldn't be the trigger for provisioning a new one.
  - **Editing**: every field is a small `Editable` component — plain
    text when `editable=false`, `contentEditable` when `true`,
    committing on blur only (not on every keystroke), which is what
    keeps typing from fighting React's render cycle.
  - **Save**: one `update(path, value)` call per field, using a
    generic immutable `setDeep()` (no per-field boilerplate needed for
    ~15 different nested shapes), debounced 600ms, upserting the
    *entire* `content` object each time — matching the spec exactly.
    Worth knowing: this means two people editing two different fields
    of the same planner within the same 600ms window can have one
    save clobber the other (last upsert wins) — inherent to "debounce
    the whole content object," not a bug, but worth revisiting later
    if simultaneous multi-editor use turns out to be common.
  - **Realtime**: subscribes to `postgres_changes` on `planners`
    filtered to this `client_id`, and applies incoming updates to
    local state — except when the incoming payload's content matches
    the last thing *this* tab sent, which is skipped so a save doesn't
    visibly "echo" back a moment later. That match is a plain JSON
    string comparison, which is a simple heuristic, not a real
    conflict-resolution scheme — good enough for "two tabs, no
    refresh needed," not a CRDT.
  - **Draft/Published toggle**: renders only when `editable=true`,
    exactly as specified.
  - **Logo**: stored as a base64 data URI directly inside the jsonb
    `content` (same approach `planner.html` used client-side). Simple
    and requires no Storage bucket, but bloats the row for a large
    image — flagging this as a reasonable candidate to move to
    Supabase Storage in a later pass, the same way client avatars
    already were in Phase 4, rather than doing it silently here.
- `components/ClientDetailTabs.tsx` — new client component wrapping
  the Phase 4 detail panel: an "Info" tab (everything Phase 4 already
  built) and a "90-Day Plan" tab that mounts `<PlannerDocument
  clientId editable={true} />` only once selected, so a routine visit
  to a client's Info tab doesn't pay for the planner's fetch + Realtime
  subscription. `app/app/clients/[id]/page.tsx` was restructured to
  fetch the same data as before and hand it to this component instead
  of rendering the sections directly.
- `app/app/portal/plan/page.tsx` — new client-facing route. Resolves
  the signed-in user's `profiles.client_id` server-side, then renders
  `<PlannerDocument clientId editable={false} />`. If `client_id` is
  still null (the Phase 2/3 known gap — a brand-new client signup not
  yet linked to a real client record), shows a plain "not linked yet"
  message rather than erroring. `app/app/portal/page.tsx` now links to
  it.

Same standing network caveat as every phase before this — couldn't
`npm install` or run a real Next.js build. What I could and did do:
ran every `.ts`/`.tsx` file in the project (this phase's new ones
included) through esbuild in transpile-only mode as a syntax check —
it caught zero parse errors, meaning every JSX tag closes correctly,
every brace balances, etc. That is **not** the same as `tsc --noEmit`
or `next build` — it doesn't check types, doesn't resolve the `@/*`
import alias, and wouldn't catch e.g. a prop name that doesn't match a
component's actual interface. Real type-checking is still the first
thing to run once this is somewhere with internet access, especially
given how much of `PlannerDocument.tsx` is hand-written generic state
plumbing.

## Phase 6 — Fathom AI webhook → auto-created prospect

**The single biggest caveat in this whole repo lives here**: nobody
building this has ever seen a real Fathom AI webhook payload. No
sample, no fetched docs page, nothing — this was flagged as an open
risk back when the roadmap was first written, and it's still open.
Everything in `lib/planner/fathom-mapping.ts` and the signature check
in `app/api/fathom-webhook/route.ts` is written defensively (multiple
guessed field names per lookup, safe fallbacks everywhere) specifically
so a wrong guess about the payload shape degrades to "map nothing,
keep the template defaults" instead of crashing or mis-mapping data —
but it is still guesswork. **Before this goes live**: trigger one real
Fathom call, log `JSON.stringify(payload)` from the route handler
(a `console.info` is already sitting right where you'd add it), and
rewrite `readFathomPayload()` and `isValidSignature()` to match what
actually arrives.

- `app/api/fathom-webhook/route.ts` — the POST endpoint. Verifies a
  signature two ways (HMAC-SHA256 over the raw body via an
  `x-fathom-signature` header, Stripe/GitHub-style; or a plain shared
  secret via `x-webhook-secret`), rejecting with 401 if
  `FATHOM_WEBHOOK_SECRET` is set but neither header matches — and
  skipping verification entirely (accepting everything) if the env var
  isn't set at all. **Which of these two schemes, if either, Fathom
  actually uses is unconfirmed.** Idempotent by design: derives a
  `fathom_call_id` from the payload's own id fields where present, or
  a SHA-256 hash of the raw body otherwise, and short-circuits with
  `{status: "already processed"}` if that id was already fully
  applied — so a webhook retry (which most providers do) can't create
  a duplicate client. Uses the service-role admin client throughout,
  deliberately — there's no signed-in user on an external webhook
  call, so RLS has nothing to check against; this route is the trust
  boundary instead.
- `lib/planner/fathom-mapping.ts` — `mapFathomToPlanner()`. Maps
  exactly the three things the spec named, each at a different,
  explicitly-reasoned confidence level:
  - **Agreed next steps → `schedule.desc`**: highest confidence,
    because `action_items` (if Fathom sends something by that name) is
    the most structured field available — appended as a bulleted list
    to the existing schedule description, never overwriting it.
  - **Content ideas mentioned → a new pillar**: only created if at
    least one action item matches a content-keyword filter (reel,
    video, post, etc.), and always added at **0% allocation** so it
    can never silently steal budget from the four real pillars — it's
    a flagged suggestion, not a decision.
  - **Discussed goals → mission statement**: lowest confidence of the
    three, since there's no structured field for "goals" to read at
    all — only acts if the freeform call summary contains a sentence
    with an explicit "goal"/"objective"/"aiming" marker, and copies
    that literal sentence rather than paraphrasing it.
  Everything else in `PlannerContent` — hero, thesis, format, workflow,
  metrics, competitors, timeline, guarantee — is left at
  `DEFAULT_PLANNER_CONTENT`'s template wording untouched, per "leave
  anything uncertain at its default template text rather than
  guessing."
- **Schema fix-forward**: `supabase/migrations/0005_fathom_reviewed.sql`
  adds `fathom_calls.reviewed_at`. Phase 3's `applied` column already
  meant "has the auto-mapper run" — this phase's `/app/prospects`
  needs a *second*, different question answered ("has a human looked
  at this yet"), and reusing `applied` for both would make prospects
  disappear from the review list the instant the webhook fires, before
  anyone saw them. Kept as two separate columns instead.
- `app/app/prospects/page.tsx` — lists `fathom_calls` where
  `applied = true and reviewed_at is null`. No role check in the file;
  `fathom_calls` RLS is ceo/staff-only (Phase 3) and the route sits
  outside videographer/client's `ALLOWED_PREFIXES` in `middleware.ts`,
  so both layers already keep anyone else out. Each row's "Review &
  Open" button is a tiny server-action form (`app/app/prospects/actions.ts`)
  that marks `reviewed_at` and redirects straight to
  `/app/clients/[id]?tab=plan`.
- `app/app/clients/[id]/page.tsx` and `components/ClientDetailTabs.tsx`
  now read that `?tab=plan` query param to open directly on the 90-Day
  Plan tab, instead of always defaulting to Info.
- Added a "Prospects to review" tile to the dashboard (only rendered
  when the count is non-zero), linking to `/app/prospects`.

Same syntax-check-only verification as Phase 5 — ran clean across all
37 project files via esbuild transpile — same caveat that this is not
a type-check or a real build.

## Phase 7 — Assigned Team panel, videographer's own section, scoped nav

- `components/AssignedTeamPanel.tsx` + wiring in
  `app/app/clients/[id]/page.tsx`/`ClientDetailTabs.tsx` — lists
  `client_staff` rows for the client (joined with `profiles` for name
  and role), a picker limited to `role in ('staff','videographer')`
  profiles not already assigned, add/remove both going straight
  through `client_staff`'s existing RLS (ceo/staff full access,
  Phase 3). No role check gates this panel in the component itself —
  it doesn't need one, because `/app/clients/[id]` is already
  unreachable by anyone but ceo/staff (see the reachability trace
  below).
- `app/app/my-clients/page.tsx` — the videographer grid, deliberately
  the same shape as `app/app/clients/page.tsx`: same `ClientCard`
  component, same query pattern. It never queries `client_finance` at
  all (not "queries it and hides the result" — just never asks), so
  there's no £ column, ever, for anyone landing here. `ClientCard`
  gained an `hrefBase` prop so this grid can link into
  `/app/my-clients/[id]` instead of `/app/clients/[id]`, which is
  outside a videographer's `ALLOWED_PREFIXES`.
- `app/app/my-clients/[id]/page.tsx` — a client's 90-Day Plan
  (`<PlannerDocument editable={false} />`, no `requirePublished` — see
  the prop's doc comment in `PlannerDocument.tsx`: this had to be
  split apart from `editable` this phase, because a client-portal
  visitor and a videographer are both "read-only" but only the former
  is also status-gated — Phase 3's RLS lets an assigned videographer
  see a *draft* plan, just not edit it), Documents (`editable={false}`,
  new prop on `DocumentsList` that swaps the status dropdown for a
  plain badge — Phase 3 gives videographers select-only access there,
  so an editable-looking control would just silently revert on every
  attempt), and a minimal read-only Messages list. That last one is
  genuinely bare — no compose box, because Phase 3's RLS doesn't give
  videographers (or anyone but ceo/staff) insert access to messages
  yet, and real messaging UI is explicitly Phase 10's job. Said so on
  the page itself rather than pretending it's finished.
- **You asked me to confirm which planner sections, if any, should be
  editable by videographers — I haven't gotten an answer, so this
  phase keeps the Phase 3 default: fully read-only.** Nothing here
  changes that RLS policy. When you decide, it's a small, contained
  change: add an UPDATE policy to `planners` in a new migration scoped
  however you want (e.g. only the pillars/tags, only tasks, whatever),
  and flip `editable` to a role check where the plan is rendered.
- **First real shared nav in this app.** Nothing before this phase
  had a persistent nav — every page was a standalone `<main>`. Built
  `components/AppNav.tsx` (a small per-role link map — ceo gets
  Dashboard/Clients/Prospects/Team, staff the same minus Team,
  videographer exactly My Clients/Messages/My Payments, client just
  Your Project) plus `app/app/layout.tsx` to mount it once above every
  `/app/*` page, and a `signOutAction` (`app/app/actions.ts`) since a
  nav with no way to sign out was a gap on its own. The nav's per-role
  content is presentation only — see the reachability trace below for
  what's actually enforcing anything.
- Added placeholder pages for `/app/messages` and `/app/my-payments`
  (same pattern as Phase 2's original dashboard/my-clients/portal
  placeholders) so the new nav's links resolve to something instead of
  404ing before Phases 8 and 10 build them for real.

### Reachability trace (this is static code review, not a live test)

You asked me to confirm — as a real videographer test account — that
`/app/clients`, the dashboard's revenue tile, and other clients' data
are genuinely unreachable. **I can't do that literally**: this sandbox
has no network path to a real Supabase project (the same restriction
flagged in every phase since Phase 1), so there is no running app and
no test account to sign into. What I did instead is trace the actual
enforcement paths in the code, layer by layer, which is the closest
thing to a guarantee available without a live deploy:

1. **Route level** — `middleware.ts`'s `ALLOWED_PREFIXES.videographer`
   is exactly `["/app/my-clients", "/app/messages", "/app/my-payments"]`.
   `/app/clients` and `/app/dashboard` match neither prefix nor a
   `prefix + "/"` startsWith, so `isAllowed()` returns false and the
   request is redirected to `/app/my-clients` before either page's
   component ever runs. This isn't a menu omission — the route itself
   refuses to render.
2. **Data level, even hypothetically bypassing #1** — `clients` RLS
   (Phase 3) for videographer is `is_assigned_staff(id)`; `client_finance`
   and `invoices` have no videographer policy at all (zero rows,
   always, for that role — not filtered client-side, structurally
   absent). So even a direct API call to Supabase from a videographer
   session — bypassing this Next.js app entirely — gets the same
   result: their assigned clients only, no financial figures, ever.
3. **Another client's detail page specifically** —
   `/app/my-clients/[id]/page.tsx`'s query is
   `.eq("id", params.id).single()` against `clients`, which RLS
   already scopes to assigned clients. Requesting a client id the
   videographer isn't assigned to returns no row, and the page calls
   `notFound()` — a 404, not an error message that would confirm the
   client exists. Same non-disclosure pattern used everywhere else in
   this app.
4. **"Invoices"/"Pipeline" nav items"** — these don't exist as pages
   anywhere in this codebase yet (no `/app/invoices`, no
   `/app/pipeline`), so "no such nav item for this role" is trivially
   true today rather than something this phase specifically built.

This trace is only as good as the code it's reading — a real
videographer test account against a real deployed instance is still
the thing to actually run before trusting this, and I'd treat that as
the very first smoke test once Phase 11's audit environment exists.

## Phase 8 — Payments

- `app/app/payments/page.tsx` (ceo-only) — table of every `payments`
  row (staff name via `profiles!staff_id(full_name)`, amount, note,
  date), newest-first, plus `add-payment-form.tsx` (a
  `useFormState`/`useFormStatus` client form) and `actions.ts`'s
  `addPayment` server action. The staff picker is populated from
  `profiles` where `role in ('staff','videographer')`, per the brief.
  Middleware alone doesn't gate this route (ceo and staff share the
  `/app` catch-all prefix — same situation as `/app/settings/team`
  since Phase 2), so the page does its own `role !== 'ceo'` check and
  redirects a non-ceo visitor to `/app/my-payments`. This redirect
  isn't a security boundary — the query would already be safe under
  RLS even without it (see the trace below) — it exists so a staff
  member landing here by URL sees "My Payments," not a page titled
  "Payments" that silently only shows their own single row with a
  staff-picker they have no reason to use.
- `app/app/my-payments/page.tsx` (staff + videographer; replaces the
  Phase 2 placeholder) — the signed-in user's own `payments` rows,
  newest first, plus a running total for the current calendar year in
  a tile above the list (`new Date(p.paid_on).getFullYear() ===
  currentYear`, summed client-side after the query — there's no
  reporting requirement yet that would justify pushing this into SQL).
  The query adds an explicit `.eq("staff_id", user.id)` on top of what
  RLS would already enforce. That's deliberate, not redundant: RLS's
  `payments: ceo full access` policy has no row restriction, so if a
  ceo account ever opens `/app/my-payments` (nothing stops them —
  same shared `/app` prefix issue as above, just in the other
  direction), the query would otherwise return *every* payment in the
  system under a heading that says "My Payments." The explicit filter
  makes the page's promise hold regardless of who's viewing it,
  instead of depending on which role happens to be signed in.
- `components/AppNav.tsx` — added "Payments" to the ceo nav and "My
  Payments" to the staff nav. Videographer already had "My Payments"
  from Phase 7's forward-looking nav map; unchanged here.
- **Unprompted fix: missing `React` imports.** While writing
  `add-payment-form.tsx` I used `React.CSSProperties` as a bare type
  reference and noticed the same pattern already existed in earlier
  phases' files that only ever import specific named hooks (e.g.
  `import { useState } from "react"`) and never `React` itself. That
  passes esbuild's transpile-only syntax check (it doesn't resolve
  types or namespaces) but would fail a real `tsc`/`next build` with
  "Cannot find namespace 'React'." Found the full list with
  `grep -rl "React\." --include="*.tsx" .` cross-referenced against
  files with no `import React`: `components/EditableField.tsx`,
  `app/app/settings/team/invite-form.tsx`,
  `app/app/payments/add-payment-form.tsx`, `app/app/layout.tsx`, and
  `app/layout.tsx`. Fixed all five by importing the specific types
  needed (`import type { CSSProperties, ReactNode } from "react"`,
  as applicable per file) and replacing every `React.CSSProperties`/
  `React.ReactNode` with the bare imported name. Re-checked afterward
  with `grep -rn "React\." --include="*.tsx" --include="*.ts" .` —
  the only remaining hit is `components/PlannerDocument.tsx`, which
  is fine because it already does a full `import React, { ... } from
  "react"`. This is exactly the kind of gap the esbuild check can't
  catch on its own — flagging it again here as another reason a real
  `tsc` run needs to be the first thing done once this project has
  real internet access, not just `next build`'s bundler step.

### RLS enforcement trace (this is static code review, not a live test)

You asked me to confirm that Phase 3's `payments` RLS is actually
enforced — specifically that one staff member can't see another's
payments even via a direct API call, not just through this app's UI.
Same caveat as the Phase 7 reachability trace: this sandbox has no
network path to a real Supabase project, so I can't literally fire a
`curl` request at a live PostgREST endpoint and show you the response.
What I can do is trace exactly why the policies block it, and give you
the literal commands to run yourself once this is deployed.

**Why "direct API call" doesn't bypass anything here.** There's no
custom backend in front of `payments` — every read, whether it comes
from `supabase.from("payments").select(...)` in this app's server
components, or from a hand-rolled `fetch`/`curl` straight at
`https://<project>.supabase.co/rest/v1/payments`, ends up as the same
PostgREST request running against Postgres under the same Postgres
role, subject to the same RLS policies. There is no code path in
Supabase's REST layer that skips RLS for the anon key + a user's JWT —
the only thing that skips RLS is the **service-role key**, which never
appears in any client-reachable code here (`lib/supabase/admin.ts` is
server-only, imported by nothing that ships to the browser, and isn't
used anywhere in the Phase 8 payments code — both payments pages and
the server action use the regular `createClient()` from
`lib/supabase/server.ts`, which runs as the signed-in user, not as an
admin). So "the UI wouldn't show it" and "a raw API call can't get it"
are the same guarantee here, not two separate ones — there is nothing
lower-level than RLS to fall back on.

**The policies themselves** (from `0002_schema_rls.sql`, unchanged
since Phase 3):

```sql
alter table payments enable row level security;
create policy "payments: ceo full access" on payments for all
  using (public.is_ceo()) with check (public.is_ceo());
create policy "payments: read own" on payments for select
  using (staff_id = auth.uid());
```

Postgres RLS policies are OR'd together per operation — a row is
visible if *any* applicable policy's `USING` clause is true for the
current session. For a `select` as a non-ceo user, `"payments: ceo
full access"` evaluates false (`is_ceo()` is false), so the only
policy that can pass is `"payments: read own"`, which requires
`staff_id = auth.uid()`. `auth.uid()` is derived server-side from the
request's JWT — a staff member cannot pass someone else's `auth.uid()`
by editing the request body or a query parameter, because it's read
from the verified token, not from anything the client sends. This
means every possible query shape a staff member could construct —
`select *`, filtering by a different `staff_id`, no filter at all,
pagination tricks, a raw `curl` with a hand-written `Authorization:
Bearer <their JWT>` header — is silently rewritten by Postgres to only
ever return rows where `staff_id` equals that JWT's subject. There's
no "try to fetch someone else's row and get denied" error to see;
those rows simply aren't part of the result set, exactly like a `WHERE
staff_id = $1` clause you couldn't remove even if you wanted to.

**A real test to run once deployed** (this is the literal command —
run it with two different staff members' access tokens once you have
a live project and can sign in as each):

```bash
curl "https://<project-ref>.supabase.co/rest/v1/payments?select=*" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <staff-member-A's-access-token>"
```

Expect only rows where `staff_id` is A's own `profiles.id`. Re-run the
identical request swapping in staff member B's access token (same
anon key, same URL, nothing else changed) — expect only B's rows, with
zero overlap. Then try it once more with A's token but add
`&staff_id=eq.<B's-profile-id>` to the query string — expect an empty
array, not an error and not B's data, which is what confirms the
policy is filtering rows rather than merely being unreachable through
this app's own query-builder calls.

## Phase 9 — Client portal, reading real data + live updates

- `app/app/portal/layout.tsx` (NEW) — shared shell for every
  `/app/portal/*` page. Does the "is this account actually linked to
  a `clients` row via `profiles.client_id`" check exactly once (the
  known Phase 2 gap for a brand-new client signup), mounts the new
  portal sub-nav, and sets up the live-update subscription described
  below. Every page nested under it still re-fetches `client_id`
  itself before querying — that's the same "don't trust the layer
  above you" duplication `app/app/layout.tsx` already does for
  `role` versus `middleware.ts`, kept consistent rather than having
  pages implicitly depend on their parent layout having already
  fetched something for them.
- `components/PortalNav.tsx` (NEW) — the five-tab sub-nav (Overview /
  Content Hub / Documents / 90-Day Plan / Messages) for this section.
  A client component (unlike `AppNav`) only because it needs
  `usePathname` to highlight the active tab — nothing here is an
  access boundary; `middleware.ts`'s `/app/portal` prefix and each
  page's own RLS-backed query are what actually restrict this section
  to the client role, same as always.
- `app/app/portal/page.tsx` (REWRITTEN — was the Phase 2/7
  placeholder) — **Overview**: a welcome heading, three `StatTile`s
  (document count, plan status derived from whether a *published*
  planner row exists, and a message count), the client's
  `next_action` if staff have set one, and quick links to the other
  four tabs.
- `app/app/portal/content/page.tsx` (NEW) — **Content Hub**. There's
  no dedicated schema for "content hub" — it's a curated, read-only
  slice of the same `planners.content` jsonb the full 90-Day Plan
  renders. Interpreting the brief since nothing more specific was
  given: pulled out **content pillars** (the strategy) and the **slot
  planner's items** (the concrete videos currently in production) as
  the two sections a client checking in day-to-day would actually
  want here, rather than the full planner (branding details, internal
  workflow steps, competitor links, production timeline, etc.), which
  stays on the dedicated 90-Day Plan page. Same `status = 'published'`
  double-check as the plan page — say the word if you had a different
  shape in mind for this page and I'll adjust.
- `app/app/portal/documents/page.tsx` (NEW) — **Documents**. Reuses
  the same `DocumentsList` component from Phase 4/7 with
  `editable={false}`, identical reasoning to the videographer's
  read-only view: `documents: client read own` (Phase 3) is
  select-only for this role, so no status dropdown that would just
  fail and revert.
- `app/app/portal/messages/page.tsx` (NEW) — **Messages**. Same
  read-only list as the videographer's view in
  `/app/my-clients/[id]/page.tsx` (Phase 7) — `messages: client read
  own` is select-only, and compose UI for every role is explicitly
  Phase 10's job. What's new versus Phase 7's version is that this
  page sits under `PortalLayout`, which subscribes to this client's
  one message thread — see Realtime section below.
- `app/app/portal/plan/page.tsx` — **90-Day Plan**, unchanged from
  Phase 7 (`<PlannerDocument clientId editable={false} requirePublished
  />`). It now simply lives inside the new portal shell/nav instead
  of being the only real page in the section.

### Realtime: `postgres_changes` on `planners`, `documents`, `messages`

- `components/RealtimeRefresh.tsx` (NEW) — a small, renders-nothing
  client component that subscribes to one or more `postgres_changes`
  filters and calls Next's `router.refresh()` whenever any of them
  fire. Mounted once, in `PortalLayout`, with filters for:
  - `planners` where `client_id=eq.<this client>`
  - `documents` where `client_id=eq.<this client>`
  - `messages` where `thread_id=eq.<this client's one thread>` —
    `messages` has no `client_id` column of its own (Phase 3's
    schema only puts `client_id` on `message_threads`, which
    `messages.thread_id` points at), so "subscribe to messages for
    this client_id" concretely means "subscribe to this client's one
    thread." If that thread doesn't exist yet (no staff member has
    ever opened Messages for this client), the subscription is
    omitted entirely rather than passed an unfiltered `messages`
    filter, which would ask Realtime to evaluate RLS against every
    row in the table on every single change instead of none.
  - This intentionally does **not** poll — it's a single Realtime
    websocket subscription (via `lib/supabase/client.ts`'s browser
    client) sitting idle until Postgres actually emits a change, at
    which point `router.refresh()` re-runs the current route's server
    components against the database for a real up-to-date read. No
    interval timer anywhere in this component.
  - **Why `router.refresh()` instead of copying PlannerDocument's
    fetch-and-patch-state approach**: nearly every portal page is a
    plain server component reading Supabase directly, matching the
    rest of this app's convention (`/app/dashboard`, `/app/clients`,
    etc.). Reimplementing PlannerDocument's client-side fetch/patch
    machinery in four more places just to get live updates would mean
    two different ways of reading the same tables living side by
    side. `router.refresh()` re-runs the existing server components
    instead — no full page reload, no lost scroll position, no second
    data-fetching path to maintain.
  - `PlannerDocument` keeps its own separate, finer-grained
    subscription on `planners` for `/app/portal/plan` specifically —
    patching just the changed JSON in place is a better experience
    for a long document you might be mid-scroll on than a full
    server round-trip. Both it and this component being subscribed to
    `planners` for that one page is deliberate, minor redundancy, not
    a bug: this component's refresh also has to cover the *rest* of
    the portal (Overview's "Plan: Published" stat, the Content Hub)
    reacting to that same publish event, which `PlannerDocument`'s
    subscription has no way to do since it only mounts on the plan
    page.
- **New migration: `0006_enable_realtime.sql`.** Enabling row-level
  security on a table (Phase 3) does **not** also enable Realtime for
  it — those are two independent switches. Realtime's
  `postgres_changes` feature only fires for tables that are members of
  the `supabase_realtime` publication. Checked every migration written
  so far and found none of them had ever added `planners` (which
  Phase 5's `PlannerDocument` has been silently depending on since
  then), `documents`, or `messages` to that publication — a gap that
  went unflagged in Phase 5 and only became obvious now that a second
  feature depends on the same mechanism. Fixed forward with a new
  migration rather than patching it in from the dashboard by hand,
  guarded with an existence check against `pg_publication_tables` so
  it's safe to run even if a table was already added manually at some
  point. **If Realtime doesn't appear to be firing after deploying
  this, this migration not having been run — or a Realtime toggle
  being off in the project's dashboard settings — is the first thing
  to check.**
- **Worth flagging explicitly**: Realtime's `postgres_changes`
  payloads are filtered by the table's own RLS `select` policies for
  the subscribing user, exactly like any other read. A client
  session's subscription can never receive a row their RLS wouldn't
  already let them `select` — even if its filter were left wide open.
  The per-client filters above are belt-and-braces on top of that
  (this project's usual pattern, e.g. `/app/my-payments`'s explicit
  `.eq()` in Phase 8), not the only thing standing between one
  client's live feed and another's data.

## Phase 10 — Real-time chat over `message_threads`/`messages`

Phase 3 gave `messages` select-only RLS for videographer/client, with
its own comment flagging "message send/receive built out properly in
Phase 10." This is that phase: send, mark-as-read, a real thread-list
UI, and nav badges, all wired to Realtime.

### New migrations

- **`0007_messaging.sql`** — the RLS this phase actually needed:
  - `messages: videographer send in assigned` / `messages: client send
    own` (insert) — `sender_id = auth.uid()` plus "this thread belongs
    to a client I'm allowed to touch" (assigned via `client_staff` for
    videographer, `current_client_id()` for client). ceo/staff already
    had insert covered by their Phase 3 `for all` policy.
  - `messages: videographer update in assigned` / `messages: client
    update own` — same "is this thread mine" check, for the
    mark-as-read call.
  - **A column-lock trigger, `messages_restrict_update`.** RLS is
    row-level, not column-level — the same limitation flagged in
    Phase 8's README for `payments`. An "update this row" grant on
    `messages` technically lets a client rewrite the *body* of a
    message staff already sent, or reassign who it's from, by sending
    a different UPDATE payload than the UI's own `.update({ read:
    true })` ever would — not hypothetical once a real update policy
    exists for a non-staff role, which didn't happen anywhere else in
    this app before now. Added a `before update` trigger that, for
    anyone who isn't ceo/staff, rejects an UPDATE touching any column
    besides `read`. This is new to the project — worth knowing the
    pattern exists now if a future phase adds another table's
    mark-as-read-style update policy for a non-staff role.
  - Deliberately did **not** add an insert policy on `message_threads`
    for videographer or client — see "Why videographer/client can't
    start a new thread" below.
- **`0008_enable_realtime_threads.sql`** — two follow-ups to Phase 9's
  Realtime setup:
  - Adds `message_threads` to the `supabase_realtime` publication
    (Phase 9's `0006` migration added `planners`/`documents`/`messages`
    but not this one — nothing needed it yet at the time). ChatShell
    needs this to notice a thread being created where none existed.
  - `alter table messages replica identity full` — Realtime's UPDATE
    payload only includes a row's *primary key* columns in `old`
    unless the table's replica identity is `FULL`. ChatShell's unread
    bookkeeping needs `old.read` (to tell whether an update flipped a
    message from unread to read, and in which direction) — without
    this, `old.read` would simply be `undefined` on every update
    event. Trade-off noted in the migration: this makes every
    `messages` UPDATE write more to Postgres's WAL (the whole
    pre-update row, not just its id) — a non-issue at this app's
    volume (read-flag flips), worth reconsidering only if `messages`
    ever saw high-volume updates.

### `lib/messaging/actions.ts` — shared server actions

`sendMessage(threadId, body)`, `markThreadRead(threadId)`, and
`ensureThreadForClient(clientId)` (ceo/staff only, enforced by RLS —
see below). One file, used by both the staff/ceo/videographer chat
(`ChatShell`) and the client portal's message page — there's no
per-role branching in any of them; `0007_messaging.sql`'s policies are
what actually decide who can do what. `sendMessage` reads the caller's
`role` server-side from their own `profiles` row for `sender_role`,
never trusting a role the client might send.

### `components/ChatShell.tsx` — staff/ceo/videographer chat, `/app/messages`

- **One component for all three roles.** No `if (role === ...)`
  anywhere in it except a `canCreateThreads` prop (only ceo/staff may
  call `ensureThreadForClient`). What each role actually sees comes
  entirely from `app/app/messages/page.tsx`'s initial query, which is
  RLS-scoped by the same `clients`/`message_threads` policies used
  everywhere else — a videographer's `initialThreads` prop is already
  filtered to their assigned clients before this component ever runs.
- **"One per client," literally.** The thread list is built from a
  query against `clients`, not `message_threads` — a client with no
  conversation started yet still appears in the list (with an empty
  pane and, for ceo/staff, a composer that creates the thread on first
  send) rather than only showing up once someone's messaged them.
- **Realtime: one subscription, unfiltered**, on `messages`
  (insert + update) and `message_threads` (insert) — a deliberate
  departure from Phase 9's `RealtimeRefresh`, which filters by a
  single `client_id`. A busy ceo/staff account can have dozens of
  clients' threads open in this list at once; there's no single
  filter string that covers "any of these," and Realtime's payloads
  are filtered by the table's own RLS `select` policy for the
  subscribing user regardless of the channel's filter (Phase 9's
  README first flagged this) — so an unfiltered channel here still
  only ever receives events this role's RLS already allows it to
  read. The channel filter is a narrowing convenience on top of that
  everywhere else in this app, not the only thing enforcing anything;
  skipping it here is a case where it isn't practical to write at all.
- **No optimistic send.** `MessageComposer` only calls the
  `sendMessage` server action and clears itself — the message you
  just sent appears once the Realtime insert event for it round-trips
  back to your own subscription, same as anyone else's message. This
  avoids needing any de-dup logic between "the message I just
  optimistically rendered" and "the same message arriving via
  Realtime a moment later." In practice this is fast (sub-second) but
  it's a real, if small, round trip — flagging it rather than
  pretending this is zero-latency optimistic UI.
- **Unread bookkeeping** happens in three places, all consistent: an
  `INSERT` from someone else on an unselected thread bumps its count;
  an `UPDATE` that flips `read` (using `old.read`, see the replica
  identity note above) adjusts the count up or down; opening a thread
  zeroes it optimistically client-side (settled precisely a moment
  later by the real `markThreadRead` call's own Realtime echo). A new
  message arriving on a thread you already have *open* re-fires
  `markThreadRead` (via `MarkThreadRead`'s `tick` prop) so the count
  stays accurate while you're actively looking at the conversation,
  not just at the instant you opened it — a small enhancement past the
  literal "opening a thread marks it read," flagged here rather than
  silently added.

### `components/messaging/` — shared pieces

`MessageComposer` (textarea + send, Enter-to-send/Shift+Enter-for-
newline, no optimistic append — see above), `MessageBubbleList`
(presentational, own-message alignment via `sender_id ===
currentUserId`), and `MarkThreadRead` (renders nothing, fires
`markThreadRead` on mount and whenever `threadId`/`tick` changes).
All three are used by both `ChatShell` and the client portal's message
page — one implementation of "what a message list looks like" and
"how a thread gets marked read," not two.

### Nav badges

`components/MessagesNavBadge.tsx` — a small client component
(`AppNav` itself stays a server component; a server component can
render a client one) doing its own fetch + Realtime subscription for
`count(messages where read = false and sender_id != me)`, no filter —
scoped by RLS exactly like ChatShell's own subscription. Rendered next
to the "Messages" link for **ceo, staff, and videographer**. The brief
named staff/videographer explicitly; added it for ceo too since ceo
and staff have shared every other nav item and page in this app so
far — leaving ceo to reach the chat page only by typing the URL would
be an inconsistent exception, not a deliberate scoping choice. Also
added a plain "Messages" nav link for **staff**, who didn't have one
before this phase (only videographer did) despite `/app/messages`
having been reachable to them by URL since Phase 7's placeholder.

### The client portal's message page (`/app/portal/messages`)

Gained the same three shared pieces above — `MessageComposer`,
`MarkThreadRead`, and `MessageBubbleList` replacing its Phase 9
hand-rolled read-only list. No thread-creation here (see below); the
composer renders disabled with an explanatory message if no thread
exists yet. **No new Realtime subscription was added to this page** —
Phase 9's `PortalLayout` already subscribes to this client's thread
and calls `router.refresh()` on any change, which re-runs this page
entirely; that was already "live," it just couldn't send or mark
anything read until this phase's RLS existed.

### Why videographer/client can't start a new thread

`0007_messaging.sql` only grants `messages` insert/update to
videographer/client — `message_threads` insert stays ceo/staff-only,
exactly as it was after Phase 3. In this app's model, a conversation
with a client is something staff initiates (client onboarding,
assigning a videographer) rather than something a client or
videographer spins up unprompted. Practically: if a ceo/staff member
hasn't sent a client's first message yet, that client's
`/app/portal/messages` composer and a videographer's `/app/messages`
composer for that client both render disabled rather than silently
failing an insert. The moment ceo/staff does send that first message
(`ensureThreadForClient` creates the thread), everyone watching that
client's conversation — including a videographer or client who had
the page open at the time — picks it up live via the
`message_threads` insert subscription (`0008`'s publication addition)
and the composer becomes usable without a refresh.

### Known limitation: `read` is one shared column, not a per-viewer receipt

The brief says "opening a thread marks its unread messages
read=true," which is exactly what's built — but `messages.read` is a
single boolean per row, not a per-reader read receipt. For a thread
with more than one person on the "staff side" (e.g. a ceo, a staff
member, and an assigned videographer all able to see the same
client's conversation), whichever one of them opens the thread first
marks it read for **everyone** on that side, not just themselves — a
second staff member's nav badge count will drop for a message they
personally haven't looked at yet, because someone else on their team
has. This is the literal behavior asked for (there was no mention of
per-user read receipts), and matches the single shared `read` column
Phase 3's schema already had — flagging it here as the natural next
piece of schema (a `message_reads(message_id, user_id)` junction
table) if per-person read state ever turns out to matter.

## Phase 11 — RLS verification, a real gap found and fixed, and deployment

Two very different kinds of work were asked for in one message: (1)
verify every RLS policy this project has built up since Phase 3
actually holds, fixing anything broken, and (2) wire this project up
to a live Supabase project, GitHub, and Vercel, and smoke-test it in
production. **Only the first is something I could actually do from
this sandbox.** The second requires accounts, credentials, and network
access this sandboxed environment has never had at any point in this
build (every phase's README has flagged the same standing limitation:
no route to `registry.npmjs.org`, Google Fonts, or Supabase's API —
the same is true of `github.com` and `vercel.com`). Rather than
pretend to click through dashboards I have no access to, here's
exactly what I did, what I found and fixed, and exactly what's left
for you to run yourself, with the real commands.

### Part 1 — RLS verification (done)

**What "confirm" means without a live database.** I read every RLS
policy across all nine migrations (`0001` through `0009`, the last of
which this phase added) against every one of the request's bullets,
table by table, tracing exactly which policy would fire for which
role on which operation — the same kind of trace as Phase 7's
"reachability trace" and Phase 8's RLS confirmation, just exhaustive
across the whole schema instead of one feature. That static review is
what caught the real gap described below. It is **not** the same as
watching four real logins actually hit a real Postgres instance,
which this sandbox cannot do — that's what the two scripts below are
for, and I could not run them here either (same network restriction).
Both are real, ready-to-run deliverables, not a claim that they were
already run successfully.

- **`scripts/seed-test-accounts.ts`** (`npm run seed:test-accounts`) —
  creates the four requested test accounts (`test-ceo@advatar.test`,
  `test-staff@advatar.test`, `test-videographer@advatar.test`,
  `test-client@advatar.test`, all sharing one test password printed
  at the end of the run) via the Admin API
  (`auth.admin.createUser`/`listUsers`, service-role key), plus a
  fifth throwaway `test-staff-2@advatar.test` — not one of "the four,"
  but necessary: without a *second* real payments-owning staff
  account, "videographer/staff never receives another staff member's
  payments" would have nothing to actually fail against even if the
  policy were broken. Also seeds two clients (Acme Co, Beta LLC) with
  the videographer assigned to Acme only, a draft-only planner on
  Acme (the test client's *own* project) and a published one on Beta,
  one invoice, one document and one message thread per client, and a
  payment for both `test-staff` and `test-staff-2`. This specific
  shape is what makes every bullet in the request actually testable —
  a single client or a single staff member wouldn't expose a
  cross-tenant leak even if one existed.
- **`scripts/verify-rls.ts`** (`npm run verify:rls`) — signs in as
  each of the four accounts with the **anon key**, the same client
  library and the same credentials tier the deployed app itself uses
  (not a service-role bypass), and runs the request's own
  select/insert/update/delete matrix: every bullet named in the
  request is its own check, plus a few adjacent ones the audit below
  surfaced (the column-lock trigger from Phase 10, the new
  staff-role-check trigger from this phase), plus positive controls
  for ceo/staff (to catch RLS being *too* restrictive, which is a bug
  in the other direction). Prints a ✅/❌ line per check and exits
  non-zero if anything fails — wire it into CI once this project has
  one.
- **`supabase/RLS_TESTING.md`** — the Supabase-documented manual
  alternative (`set local role authenticated; set local
  request.jwt.claims = '...'` in the SQL editor) for a quick one-off
  check without running a script, including why the SQL editor's
  default connection (as Postgres superuser) proves nothing about RLS
  until you do this.

### The one real gap found: `payments.staff_id` had no role check

Tracing "videographer never receives another staff member's payments"
and "client never receives another client's row" against every table
surfaced a genuine, if narrow, integrity hole: `payments.staff_id`
(Phase 3) is a bare foreign key to `profiles(id)` — nothing constrains
*which role* that profile has. `payments: read own` (Phase 3) is
`using (staff_id = auth.uid())`, scoped purely by "does this row's
`staff_id` match my own id," not by `current_role()` at all. That's
safe today only because the payments UI's staff picker
(`app/app/payments/add-payment-form.tsx`) happens to only ever list
`role in ('staff', 'videographer')` — nothing in the database, and
nothing in `addPayment`'s server action before this phase, actually
stopped `staff_id` from being set to a **client's** profile id. If
that ever happened — a bug, a manipulated request replaying the form
with a different id, a future admin script with a typo — that
client's own account would then genuinely match `staff_id =
auth.uid()` and could read that payments row straight back through
the existing, otherwise-correct RLS policy. Not reachable through
today's UI, but not something the database was actually preventing
either, and exactly the class of thing this verification pass was
asked to rule out.

**Fixed with two changes**, the same two-layer pattern established in
Phase 10 for the messages column-lock:

- **`0009_payments_staff_role_check.sql`** — a `before insert or
  update of staff_id` trigger on `payments` that looks up the target
  profile's role and rejects anything outside `staff`/`videographer`,
  regardless of caller (including ceo). This is the layer that
  actually can't be bypassed.
- **`app/app/payments/actions.ts`** — `addPayment` now re-fetches the
  target profile's role and returns a clean error before ever
  attempting the insert, so a real ceo hitting this by accident gets
  "That person isn't a staff member or videographer," not a raw
  Postgres trigger exception. `scripts/verify-rls.ts` includes a
  direct regression test for this (attempts to insert a payment with
  `staff_id` set to the test client's profile id, as ceo, and asserts
  it's rejected).

**Everything else the request named checked out clean** on this
static pass — no other gaps found:

- `clients.monthly_value` doesn't exist anywhere a videographer/staff
  query could reach it at all — it was moved to the ceo-only
  `client_finance` table back in Phase 4, before this project ever had
  a videographer role. Structurally impossible, not just
  RLS-blocked.
- `invoices` has exactly one policy (`invoices: ceo full access`,
  Phase 3) — zero policies for staff, videographer, or client means
  zero rows for all three, confirmed by tracing the policy list itself
  (RLS is default-deny; no matching policy is not a special case to
  get right, it's just what "no policy" already does).
- Every "assigned client only" table (`clients`, `planners`,
  `documents`, `message_threads`, `messages` via its thread join) uses
  the same `is_assigned_staff(client_id)` helper (Phase 3) — traced
  each one individually rather than assuming they're all correct
  because one is.
- `planners: client read own published` (Phase 3) requires both
  `client_id = current_client_id()` **and** `status = 'published'` —
  confirmed a client can't see their own draft, not just other
  clients' plans, which the seed script's Acme-stays-draft setup
  exists specifically to exercise.

**One thing flagged but deliberately left alone**: `messages: ceo/staff
full access` (Phase 3) lets ceo/staff insert a message with any
`sender_id`, including spoofing another staff member's id — the
column-lock trigger from Phase 10 only restricts non-staff updates,
not ceo/staff's own inserts. This doesn't cross a confidentiality
boundary (it only affects who a message displays as being "from,"
never who can *read* what), so it's out of scope for a pass
specifically about cross-tenant data leaks — noting it here rather
than fixing it silently or ignoring it.

### Part 2 — deployment (needs you)

This sandbox cannot create a GitHub repository, cannot authenticate to
Vercel, and has no network path to either service's API — the same
restriction that's applied to every external service all eleven
phases (`npm install`, Google Fonts, Supabase's own API have all been
unreachable here from day one). There's also no git repository in this
project yet at all — every phase so far has been delivered as a
re-zipped folder, never pushed anywhere. Here's exactly what to run,
in order, once you have this unzipped locally:

**1. Push to GitHub:**
```bash
cd advatar-crm
git init
git add .
git commit -m "Initial commit — Advatar CRM through Phase 11"
gh repo create advatar-crm --private --source=. --push
# or, without the gh CLI: create the repo on github.com first, then
git remote add origin git@github.com:<you>/advatar-crm.git
git push -u origin main
```

**2. Run the migrations against your real Supabase project** (if you
haven't already been applying them phase-by-phase):
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**3. Generate real types** (every phase's `lib/supabase/types.ts` has
been hand-written specifically because this sandbox can't reach
Supabase's API to generate them — this is genuinely the first moment
that's possible):
```bash
npx supabase gen types typescript --project-id <your-project-ref> --schema public > lib/supabase/types.ts
```

**4. Import into Vercel and connect GitHub for auto-deploy:**
```bash
npx vercel login
npx vercel link
npx vercel git connect     # connects this Vercel project to the GitHub repo — pushes to main now auto-deploy
```
(Or via the dashboard: New Project → Import Git Repository → select
`advatar-crm` → Deploy. Vercel auto-detects Next.js, no config needed.)

**5. Set the four environment variables** (`.env.local.example` lists
all four):
```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add FATHOM_WEBHOOK_SECRET production
npx vercel deploy --prod    # or just push to main, now that step 4 is done
```
(Or Project Settings → Environment Variables in the dashboard — same
four names, values from your Supabase project's API settings page.)

**6. Run the seed + verification scripts against the real project**
(this is the point where Part 1's scripts stop being "ready to run"
and actually get run):
```bash
npm run seed:test-accounts
npm run verify:rls
```

**7. Production smoke test, logged in as each role** — the
`test-*@advatar.test` accounts step 6 just created are exactly the
four (well, five) accounts to use for this:
- **ceo** (`test-ceo@advatar.test`): dashboard revenue tile shows a
  number, `/app/payments` shows both seeded payments, `/app/messages`
  shows both clients' threads.
- **staff** (`test-staff@advatar.test`): same CRM access minus Team,
  `/app/my-payments` shows only the one seeded payment for this
  account (not `test-staff-2`'s).
- **videographer** (`test-videographer@advatar.test`): `/app/my-clients`
  shows Acme Co only (not Beta LLC), its plan is visible even in
  draft, Beta's isn't reachable by URL either.
- **client** (`test-client@advatar.test`): `/app/portal` shows Acme
  Co's info; the 90-Day Plan tab shows "isn't published yet" (it's
  seeded as draft on purpose); Messages/Documents show only Acme's.

Once that's confirmed, delete the five test accounts and their data
(`supabase.auth.admin.deleteUser` cascades to `profiles` via `on
delete cascade`, which cascades further to `client_staff`, `payments`,
etc.) — they're clearly labeled `@advatar.test` specifically so
they're easy to find and remove, but they're still real rows in a
production database and shouldn't be left there indefinitely.
