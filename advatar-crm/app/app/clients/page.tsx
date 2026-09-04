import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClientCard } from "@/components/ClientCard";

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
      .select("id, name, service, stage, next_action, avatar_url")
      .order("created_at", { ascending: false }),
    supabase.from("client_finance").select("client_id, monthly_value"),
  ]);

  const financeByClient = new Map((finance ?? []).map((f) => [f.client_id, f.monthly_value]));

  return (
    <main style={{ padding: "40px 32px", maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: 0 }}>Clients</h1>
        {canAddClient && (
          <Link
            href="/app/clients/new"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              textDecoration: "none",
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              background: "var(--text-1)",
              color: "var(--bg)",
            }}
          >
            + Add client
          </Link>
        )}
      </div>

      {!clients || clients.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          No clients to show.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {clients.map((c) => (
            <ClientCard
              key={c.id}
              id={c.id}
              name={c.name}
              service={c.service}
              stage={c.stage}
              nextAction={c.next_action}
              avatarUrl={c.avatar_url}
              // undefined (not null/0) when this client has no row in
              // client_finance visible to the caller — ClientCard only
              // renders the £ figure when this is actually a number.
              monthlyValue={financeByClient.has(c.id) ? financeByClient.get(c.id) : undefined}
            />
          ))}
        </div>
      )}
    </main>
  );
}
