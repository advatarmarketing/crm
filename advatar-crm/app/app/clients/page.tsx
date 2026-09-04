import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClientsBrowser, type BrowsableClient } from "@/components/ClientsBrowser";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: callerProfile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  const canAddClient = callerProfile?.role === "ceo" || callerProfile?.role === "operations_manager";

  // Two separate queries rather than one join: clients.* is readable
  // by management/assigned-staff/assigned-videographer/own-client
  // (0002 + 0010 RLS), but client_finance is ceo-only. A postgrest
  // embed (clients(*, ...)) works fine for embedding a restricted
  // child table — Supabase simply omits rows the caller's RLS can't
  // see — but keeping them as two plain queries here makes it obvious
  // in this file that the £ figure is a distinct, more-restricted
  // fetch, not a field that happens to be blank. This list also shows
  // leads (stage='lead') alongside everything else — /app/leads is a
  // filtered, more detailed view of the same rows, not a separate
  // table.
  const [{ data: clients }, { data: finance }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, contact_name, contact_email, service, stage, next_action, avatar_url, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("client_finance").select("client_id, monthly_value"),
  ]);

  const financeByClient = new Map((finance ?? []).map((f) => [f.client_id, f.monthly_value]));

  const rows: BrowsableClient[] = (clients ?? []).map((c) => ({
    ...c,
    // undefined (not null/0) when this client has no row in
    // client_finance visible to the caller — ClientCard only renders
    // the £ figure when this is actually a number.
    monthlyValue: financeByClient.has(c.id) ? financeByClient.get(c.id) : undefined,
  }));

  // Only offer services that actually exist, so the dropdown reflects
  // this agency rather than a guessed list.
  const services = Array.from(
    new Set((clients ?? []).map((c) => c.service).filter((s): s is string => !!s))
  ).sort();

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Clients</h1>
        {canAddClient && (
          <Link href="/app/clients/new" className="btn btn-primary">
            + Add client
          </Link>
        )}
      </div>

      <ClientsBrowser clients={rows} services={services} />
    </main>
  );
}
