import { createClient } from "@/lib/supabase/server";
import { ClientCard } from "@/components/ClientCard";

// Videographer's home. Identical card grid to /app/clients, but this
// page never queries client_finance at all — not because of a role
// check, but because there's nothing to show: ClientCard only renders
// a £ value when a monthlyValue prop is actually passed, and this
// page never fetches or passes one. The clients themselves are scoped
// by RLS ("clients: videographer read assigned", Phase 3) — this
// query is the exact same shape as /app/clients/page.tsx's, and it
// naturally comes back with only this videographer's assigned
// clients, not because of anything in this file.
export default async function MyClientsPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, service, stage, next_action, avatar_url")
    .order("created_at", { ascending: false });

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 24px" }}>
        My Clients
      </h1>

      {!clients || clients.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          No clients assigned to you yet.
        </p>
      ) : (
        <div
          className="card-grid"
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
              hrefBase="/app/my-clients"
              // no monthlyValue passed — see the file note above
            />
          ))}
        </div>
      )}
    </main>
  );
}
