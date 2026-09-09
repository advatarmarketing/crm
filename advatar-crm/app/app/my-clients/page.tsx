import { createClient } from "@/lib/supabase/server";
import { ClientCard } from "@/components/ClientCard";
import { EmptyState } from "@/components/EmptyState";

// Every other page in this app declares this. Without it Next can try
// to render the route ahead of a request, which is not what a page
// built entirely from the caller's own session should ever do.
export const dynamic = "force-dynamic";

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

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, service, stage, next_action, avatar_url")
    .order("created_at", { ascending: false });

  // The error used to be discarded, which meant a failing query was
  // indistinguishable from "you have no clients" — the page just went
  // quiet. Anything that goes wrong here now says so.
  if (error) {
    console.error("[my-clients] client query failed", error);
    return (
      <main className="page">
        <h1 className="page-title page-title-accent">My Clients</h1>
        <div style={{ marginTop: 32 }}>
          <EmptyState
            title="Couldn't load your clients"
            body={`Something went wrong fetching them: ${error.message}. Tell your account manager what this says and they can sort it.`}
          />
        </div>
      </main>
    );
  }

  type Row = {
    id: string;
    name: string | null;
    service: string | null;
    stage: string | null;
    next_action: string | null;
    avatar_url: string | null;
  };

  // `name` and `stage` are declared not-null in 0002, but that
  // migration sets the constraint in a later statement than the one
  // that adds the column — and this project has had a migration stop
  // half way before now. A null name reaching ClientCard's
  // `name.trim()` is a server-side crash that takes the whole page
  // down, so the fallback happens here rather than being assumed away.
  const rows = ((clients ?? []) as unknown as Row[]).map((c) => ({
    ...c,
    name: c.name?.trim() || "Untitled client",
    stage: c.stage ?? "lead",
  }));

  return (
    <main className="page">
      <h1 className="page-title page-title-accent">My Clients</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 32px" }}>
        Everyone you&rsquo;re assigned to.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="No clients assigned to you yet"
          body="Once your account manager puts you on a client, they'll show up here with their brand kit, content plan and documents."
        />
      ) : (
        <div className="card-grid">
          {rows.map((c) => (
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
