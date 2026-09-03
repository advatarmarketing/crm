/**
 * Phase 11 — the actual "attempt select/insert/update/delete as each
 * role and confirm the gaps named in the request don't exist" script.
 *
 * This is Supabase's documented "run as user" technique done through
 * the real client libraries rather than the SQL editor's `set local
 * request.jwt.claims` trick (see supabase/RLS_TESTING.md for that
 * version, useful for a one-off manual check) — it signs in as each
 * of the four real test accounts with the ANON key, exactly the way
 * the deployed app itself authenticates, and runs the same
 * `@supabase/supabase-js` calls the app's own code uses. That matters
 * here specifically because it exercises the actual RLS policies
 * under a real authenticated session, not a service-role bypass.
 *
 * Run with: `npm run verify:rls` (after `npm run seed:test-accounts`).
 * Exits non-zero if anything fails — safe to wire into CI once this
 * project has a CI pipeline and a real (ideally disposable/staging)
 * Supabase project to run against.
 */
import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";
import { TEST_EMAILS, TEST_PASSWORD } from "./seed-test-accounts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const ACME_CLIENT_ID = "00000000-0000-0000-0000-0000000000a1";
const BETA_CLIENT_ID = "00000000-0000-0000-0000-0000000000b2";

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];

function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

/** Asserts a select came back with exactly zero rows — "never receives". */
function expectEmpty(name: string, data: unknown[] | null, error: { message: string } | null) {
  if (error) {
    // An explicit error (rather than a silently empty result) is also
    // an acceptable way for "never receives" to hold — e.g. a
    // `.single()`/`.maybeSingle()` variant, or a table with no SELECT
    // policy at all sometimes surfacing as a permission error
    // depending on grants. Either shape counts as "got nothing."
    record(name, true, `denied with error: ${error.message}`);
    return;
  }
  record(name, (data?.length ?? 0) === 0, `${data?.length ?? 0} row(s) returned`);
}

/** Asserts a select's rows are exactly the expected id set — no more, no less. */
function expectExactIds(name: string, data: { id: string }[] | null, expectedIds: string[]) {
  const gotIds = (data ?? []).map((r) => r.id).sort();
  const wantIds = [...expectedIds].sort();
  const pass = JSON.stringify(gotIds) === JSON.stringify(wantIds);
  record(name, pass, pass ? undefined : `got [${gotIds.join(", ")}], wanted [${wantIds.join(", ")}]`);
}

function expectAtLeastOne(name: string, data: unknown[] | null) {
  record(name, (data?.length ?? 0) >= 1, `${data?.length ?? 0} row(s) returned`);
}

/** Asserts a write (insert/update/delete) was rejected — either an error, or 0 affected rows. */
function expectRejected(name: string, data: unknown[] | null, error: { message: string } | null) {
  if (error) {
    record(name, true, `rejected with error: ${error.message}`);
    return;
  }
  record(name, (data?.length ?? 0) === 0, (data?.length ?? 0) === 0 ? "0 rows affected" : `${data!.length} row(s) affected — should have been 0`);
}

async function signInAs(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}. Did you run "npm run seed:test-accounts" first?`);
  return client;
}

async function verifyVideographer() {
  console.log("\n--- videographer (assigned to Acme Co only) ---");
  const sb = await signInAs(TEST_EMAILS.videographer);

  const { data: allClients } = await sb.from("clients").select("id");
  expectExactIds("clients: sees only assigned client (Acme, not Beta)", allClients, [ACME_CLIENT_ID]);

  const { data: betaDirect } = await sb.from("clients").select("id").eq("id", BETA_CLIENT_ID);
  expectEmpty("clients: cannot fetch unassigned client by id (Beta)", betaDirect, null);

  const { data: invoices, error: invErr } = await sb.from("invoices").select("id");
  expectEmpty("invoices: never receives any invoices", invoices, invErr);

  const { data: payments, error: payErr } = await sb.from("payments").select("id, staff_id");
  expectEmpty("payments: never receives another staff member's payments (has none of their own)", payments, payErr);

  const { data: finance, error: finErr } = await sb.from("client_finance").select("client_id, monthly_value");
  expectEmpty("client_finance: never receives monthly_value on any client row", finance, finErr);

  const { data: betaPlanner } = await sb.from("planners").select("id").eq("client_id", BETA_CLIENT_ID);
  expectEmpty("planners: cannot see unassigned client's plan even though it's published", betaPlanner, null);

  const { data: betaDocs } = await sb.from("documents").select("id").eq("client_id", BETA_CLIENT_ID);
  expectEmpty("documents: cannot see unassigned client's documents", betaDocs, null);

  const { data: betaThreads } = await sb.from("message_threads").select("id").eq("client_id", BETA_CLIENT_ID);
  expectEmpty("message_threads: cannot see unassigned client's thread", betaThreads, null);

  // Positive controls — proves the above are real narrowing, not RLS
  // accidentally blocking everything for this role.
  const { data: acmeDocs } = await sb.from("documents").select("id").eq("client_id", ACME_CLIENT_ID);
  expectAtLeastOne("documents: DOES see assigned client's documents (positive control)", acmeDocs);
  const { data: acmePlanner } = await sb.from("planners").select("id").eq("client_id", ACME_CLIENT_ID);
  expectAtLeastOne("planners: DOES see assigned client's plan, even in draft (positive control)", acmePlanner);
}

async function verifyClient() {
  console.log("\n--- client (linked to Acme Co) ---");
  const sb = await signInAs(TEST_EMAILS.client);

  const { data: allClients } = await sb.from("clients").select("id");
  expectExactIds("clients: sees only their own client row (Acme, not Beta)", allClients, [ACME_CLIENT_ID]);

  const { data: betaDirect } = await sb.from("clients").select("id").eq("id", BETA_CLIENT_ID);
  expectEmpty("clients: cannot fetch another client's row by id (Beta)", betaDirect, null);

  const { data: ownDraft } = await sb.from("planners").select("id").eq("client_id", ACME_CLIENT_ID);
  expectEmpty("planners: never receives a draft planner, even their own", ownDraft, null);

  const { data: betaPlanner } = await sb.from("planners").select("id").eq("client_id", BETA_CLIENT_ID);
  expectEmpty("planners: cannot see another client's plan, even published", betaPlanner, null);

  const { data: invoices, error: invErr } = await sb.from("invoices").select("id");
  expectEmpty("invoices: never receives anything staff-only (invoices)", invoices, invErr);

  const { data: finance, error: finErr } = await sb.from("client_finance").select("client_id");
  expectEmpty("client_finance: never receives anything staff-only (client_finance)", finance, finErr);

  const { data: clientStaff, error: csErr } = await sb.from("client_staff").select("client_id");
  expectEmpty("client_staff: never receives anything staff-only (client_staff)", clientStaff, csErr);

  const { data: fathom, error: fathomErr } = await sb.from("fathom_calls").select("id");
  expectEmpty("fathom_calls: never receives anything staff-only (fathom_calls)", fathom, fathomErr);

  const { data: payments, error: payErr } = await sb.from("payments").select("id");
  expectEmpty("payments: never receives anything staff-only (payments)", payments, payErr);

  const { data: betaDocs } = await sb.from("documents").select("id").eq("client_id", BETA_CLIENT_ID);
  expectEmpty("documents: cannot see another client's documents", betaDocs, null);

  const { data: betaThreads } = await sb.from("message_threads").select("id").eq("client_id", BETA_CLIENT_ID);
  expectEmpty("message_threads: cannot see another client's thread", betaThreads, null);

  // Writes that must be rejected outright.
  const { data: insertClient, error: insertClientErr } = await sb
    .from("clients")
    .insert({ name: "Rogue client row" })
    .select("id");
  expectRejected("clients: cannot insert a new client row", insertClient, insertClientErr);

  const { data: insertInvoice, error: insertInvoiceErr } = await sb
    .from("invoices")
    .insert({ client_id: ACME_CLIENT_ID, amount: 1 })
    .select("id");
  expectRejected("invoices: cannot insert an invoice", insertInvoice, insertInvoiceErr);

  // Beta's messages must stay untouched by an Acme client's update.
  const { data: betaThread } = await sb.from("message_threads").select("id").eq("client_id", BETA_CLIENT_ID).maybeSingle();
  if (betaThread) {
    const { data: markRead, error: markReadErr } = await sb
      .from("messages")
      .update({ read: true })
      .eq("thread_id", betaThread.id)
      .select("id");
    expectRejected("messages: cannot mark another client's thread read (thread invisible to them anyway)", markRead, markReadErr);
  }

  // Column-lock trigger (0007_messaging.sql): even on THEIR OWN
  // thread, only `read` may change.
  const { data: ownThread } = await sb.from("message_threads").select("id").eq("client_id", ACME_CLIENT_ID).maybeSingle();
  if (ownThread) {
    const { data: ownMessages } = await sb.from("messages").select("id").eq("thread_id", ownThread.id).limit(1);
    if (ownMessages?.[0]) {
      const { data: tamper, error: tamperErr } = await sb
        .from("messages")
        .update({ body: "tampered by test-client" })
        .eq("id", ownMessages[0].id)
        .select("id");
      expectRejected("messages: cannot rewrite a message body, even in their own thread (column-lock trigger)", tamper, tamperErr);
    }
  }
}

async function verifyStaff() {
  console.log("\n--- staff ---");
  const sb = await signInAs(TEST_EMAILS.staff);

  const { data: invoices, error: invErr } = await sb.from("invoices").select("id");
  expectEmpty("invoices: staff never receives invoices", invoices, invErr);

  const { data: payments, error: payErr } = await sb.from("payments").select("id, staff_id");
  const { data: me } = await sb.auth.getUser();
  const onlyOwn = (payments ?? []).every((p) => p.staff_id === me.user?.id);
  record(
    "payments: staff never receives other staff's payments",
    onlyOwn,
    `${payments?.length ?? 0} row(s), all own: ${onlyOwn}${payErr ? `, error: ${payErr.message}` : ""}`
  );

  // Positive controls.
  const { data: allClients } = await sb.from("clients").select("id");
  expectExactIds("clients: DOES see every client (positive control)", allClients, [ACME_CLIENT_ID, BETA_CLIENT_ID]);
}

async function verifyCeo() {
  console.log("\n--- ceo (positive controls — should see everything) ---");
  const sb = await signInAs(TEST_EMAILS.ceo);

  const { data: allClients } = await sb.from("clients").select("id");
  expectExactIds("clients: ceo sees every client", allClients, [ACME_CLIENT_ID, BETA_CLIENT_ID]);

  const { data: finance } = await sb.from("client_finance").select("client_id");
  record("client_finance: ceo sees both clients' monthly_value", (finance?.length ?? 0) === 2, `${finance?.length ?? 0} row(s)`);

  const { data: invoices } = await sb.from("invoices").select("id");
  expectAtLeastOne("invoices: ceo sees invoices", invoices);

  const { data: payments } = await sb.from("payments").select("id");
  record("payments: ceo sees every staff member's payments", (payments?.length ?? 0) >= 2, `${payments?.length ?? 0} row(s)`);

  // Regression test for 0009_payments_staff_role_check.sql: a client
  // profile id must be rejected as a payments.staff_id, even for ceo.
  const { data: clientProfile } = await sb.from("profiles").select("id").eq("full_name", "Test Client").maybeSingle();
  if (clientProfile) {
    const { data: badPayment, error: badPaymentErr } = await sb
      .from("payments")
      .insert({ staff_id: clientProfile.id, amount: 1, paid_on: new Date().toISOString().slice(0, 10) })
      .select("id");
    expectRejected(
      "payments: staff_id must be a staff/videographer profile, even for ceo (0009 trigger)",
      badPayment,
      badPaymentErr
    );
  }
}

async function main() {
  await verifyVideographer();
  await verifyClient();
  await verifyStaff();
  await verifyCeo();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
