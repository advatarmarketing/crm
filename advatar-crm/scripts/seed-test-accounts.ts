/**
 * Phase 11 — creates the four test accounts (one per role) the
 * verification pass needs, plus the cross-tenant data required to
 * actually exercise every isolation rule in the request: two clients
 * (only one of which the test videographer is assigned to), a
 * second, throwaway "other staff" account whose payments the real
 * test-staff/test-videographer accounts must never see, a draft-only
 * planner and a published one, an invoice, and a document/message
 * pair per client.
 *
 * Run with: `npm run seed:test-accounts`
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * .env.local (or the shell environment) — this uses the service-role
 * client (lib/supabase/admin.ts's counterpart for scripts, since that
 * file is server-only Next.js code and can't be imported from a
 * standalone script) to bypass RLS entirely while seeding, the same
 * way `auth.admin.inviteUserByEmail` already does in
 * app/app/settings/team/actions.ts.
 *
 * Idempotent: safe to re-run. Existing test users are found by email
 * and reused rather than duplicated; existing rows are upserted.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database, ProfileRole } from "../lib/supabase/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  console.error("Set them in .env.local (see .env.local.example) before running this script.");
  process.exit(1);
}

const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Test-only password, deliberately not secret — every account this
// script creates only ever exists to be logged into by the
// verification script or by you doing a manual "log in as each role"
// smoke test. Never reuse this pattern for real user accounts.
export const TEST_PASSWORD = "Advatar-Test-Account-1!";

export const TEST_EMAILS = {
  ceo: "test-ceo@advatar.test",
  staff: "test-staff@advatar.test",
  videographer: "test-videographer@advatar.test",
  client: "test-client@advatar.test",
  // Not one of "the four" the request asked for — exists purely so
  // there's a SECOND staff-role payments owner to test "videographer
  // never receives another staff member's payments" / "staff never
  // receives ... other staff's payments" against. Without a second
  // real payments owner, that check would have nothing to fail
  // against even if the RLS policy were broken.
  otherStaff: "test-staff-2@advatar.test",
} as const;

async function findUserByEmail(email: string) {
  // supabase-js's admin API has no getUserByEmail — list and filter.
  // Fine at this scale (a handful of test accounts); would need
  // pagination if this project ever had thousands of real users and
  // reused this helper, which it doesn't.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function getOrCreateUser(email: string) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function setProfile(userId: string, patch: { role: ProfileRole; full_name: string; client_id?: string | null }) {
  const { error } = await admin
    .from("profiles")
    .update({ role: patch.role, full_name: patch.full_name, client_id: patch.client_id ?? null })
    .eq("id", userId);
  if (error) throw error;
}

async function upsertClient(id: string, name: string, service: string) {
  const { error } = await admin.from("clients").upsert({ id, name, service, stage: "active" });
  if (error) throw error;
}

// Fixed UUIDs for the two test clients so this script is idempotent
// without needing to look anything up first — re-running it just
// upserts the same rows.
const ACME_CLIENT_ID = "00000000-0000-0000-0000-0000000000a1";
const BETA_CLIENT_ID = "00000000-0000-0000-0000-0000000000b2";

async function main() {
  console.log("Creating/finding test accounts…");
  const [ceo, staff, videographer, client, otherStaff] = await Promise.all([
    getOrCreateUser(TEST_EMAILS.ceo),
    getOrCreateUser(TEST_EMAILS.staff),
    getOrCreateUser(TEST_EMAILS.videographer),
    getOrCreateUser(TEST_EMAILS.client),
    getOrCreateUser(TEST_EMAILS.otherStaff),
  ]);

  console.log("Seeding clients (Acme Co, Beta LLC)…");
  await upsertClient(ACME_CLIENT_ID, "Acme Co", "Video production");
  await upsertClient(BETA_CLIENT_ID, "Beta LLC", "Social media");

  console.log("Assigning roles/profiles…");
  await setProfile(ceo.id, { role: "ceo", full_name: "Test CEO" });
  await setProfile(staff.id, { role: "staff", full_name: "Test Staff" });
  await setProfile(otherStaff.id, { role: "staff", full_name: "Test Other Staff" });
  // Assigned to Acme Co ONLY, not Beta LLC — this is the pairing that
  // "never receives rows for a client they're not assigned to" tests
  // against.
  await setProfile(videographer.id, { role: "videographer", full_name: "Test Videographer" });
  // Linked to Acme Co — Beta LLC is then "another client's row" from
  // this account's point of view.
  await setProfile(client.id, { role: "client", full_name: "Test Client", client_id: ACME_CLIENT_ID });

  console.log("Assigning videographer to Acme Co only…");
  await admin
    .from("client_staff")
    .upsert({ client_id: ACME_CLIENT_ID, staff_id: videographer.id, role_on_client: "Videographer" });

  console.log("Seeding client_finance (ceo-only monthly value)…");
  await admin.from("client_finance").upsert({ client_id: ACME_CLIENT_ID, monthly_value: 4500 });
  await admin.from("client_finance").upsert({ client_id: BETA_CLIENT_ID, monthly_value: 6200 });

  console.log("Seeding planners — Acme Co stays DRAFT, Beta LLC is PUBLISHED…");
  // Acme is the test client's OWN client_id — leaving it in draft is
  // what proves "client never receives a draft planner" even for
  // their own project, not just for someone else's.
  await admin.from("planners").upsert({ client_id: ACME_CLIENT_ID, status: "draft" }, { onConflict: "client_id" });
  // Beta is published, but belongs to a client the test client isn't
  // linked to, and to a client the test videographer isn't assigned
  // to — proves "another client's row"/"not assigned" hold even when
  // the row would otherwise be readable (published) to someone else.
  await admin.from("planners").upsert({ client_id: BETA_CLIENT_ID, status: "published" }, { onConflict: "client_id" });

  console.log("Seeding one invoice on Acme Co (ceo-only)…");
  await admin.from("invoices").insert({
    client_id: ACME_CLIENT_ID,
    number: "INV-TEST-0001",
    service: "Video production",
    amount: 4500,
    invoice_date: new Date().toISOString().slice(0, 10),
    status: "paid",
  });

  console.log("Seeding one document per client…");
  await admin.from("documents").insert([
    { client_id: ACME_CLIENT_ID, name: "Acme brand guide", type: "pdf", status: "approved" },
    { client_id: BETA_CLIENT_ID, name: "Beta brand guide", type: "pdf", status: "approved" },
  ]);

  console.log("Seeding one message thread + message per client…");
  for (const [clientId, label] of [
    [ACME_CLIENT_ID, "Acme"],
    [BETA_CLIENT_ID, "Beta"],
  ] as const) {
    const { data: thread } = await admin
      .from("message_threads")
      .upsert({ client_id: clientId }, { onConflict: "client_id" })
      .select("id")
      .single();
    if (thread) {
      await admin.from("messages").insert({
        thread_id: thread.id,
        sender_id: staff.id,
        sender_role: "staff",
        body: `Welcome to ${label}'s project thread (seeded by scripts/seed-test-accounts.ts).`,
      });
    }
  }

  console.log("Seeding payments — one for test-staff, one for test-staff-2…");
  await admin.from("payments").insert([
    { staff_id: staff.id, amount: 500, note: "Seeded test payment (test-staff)", paid_on: new Date().toISOString().slice(0, 10), created_by: ceo.id },
    { staff_id: otherStaff.id, amount: 750, note: "Seeded test payment (test-staff-2)", paid_on: new Date().toISOString().slice(0, 10), created_by: ceo.id },
  ]);

  console.log("\nDone. Test accounts (all share the same password):");
  console.log(`  Password: ${TEST_PASSWORD}`);
  for (const [role, email] of Object.entries(TEST_EMAILS)) {
    console.log(`  ${role.padEnd(13)} ${email}`);
  }
  console.log("\nRun `npm run verify:rls` next.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
