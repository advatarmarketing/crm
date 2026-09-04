import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlannerDocument } from "@/components/PlannerDocument";
import { DocumentsList } from "@/components/DocumentsList";

export default async function MyClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: client }, { data: documents }, { data: thread }] = await Promise.all([
    supabase.from("clients").select("id, name, service, next_action").eq("id", params.id).single(),
    supabase.from("documents").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
    supabase.from("message_threads").select("id").eq("client_id", params.id).maybeSingle(),
  ]);

  // Missing here means either the client doesn't exist, or (far more
  // likely) it exists but this videographer isn't in client_staff for
  // it — "clients: videographer read assigned" (Phase 3) simply
  // returns nothing for a client they're not assigned to. Both cases
  // look identical from here, which is the point: this route doesn't
  // leak which one it was.
  if (!client) {
    notFound();
  }

  const { data: messages } = thread
    ? await supabase
        .from("messages")
        .select("id, body, sender_role, created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
    : { data: null };

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "0 0 4px" }}>
        {client.name}
      </h1>
      {client.service && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", margin: "0 0 32px" }}>
          {client.service}
        </p>
      )}

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>
          90-Day Plan
        </h2>
        {/* Read-only per Phase 3's default RLS for videographers —
            select-only on planners, no status filter (unlike the
            client portal, a videographer can see a draft, just can't
            edit it yet). See PlannerDocument.tsx's requirePublished
            prop doc comment for why this differs from the client
            portal's usage. */}
        <PlannerDocument
          clientId={client.id}
          editable={false}
          emptyMessage="No plan has been started for this client yet."
        />
      </section>

      <section style={{ marginBottom: 40, maxWidth: 720 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>
          Documents
        </h2>
        {/* editable=false: Phase 3 gives videographers select-only
            access to documents — same reasoning as the planner above. */}
        <DocumentsList initialDocuments={documents ?? []} editable={false} />
      </section>

      <section style={{ maxWidth: 720 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>
          Messages
        </h2>
        {/* Still read-only here, deliberately, even though Phase 10
            gave videographers real send/mark-read RLS on messages
            (0007_messaging.sql) — this snippet is a preview embedded
            in the client's info tab, not a second chat interface.
            Adding a composer here too would mean two different pieces
            of UI writing to the same thread with their own local
            state, which is exactly the kind of drift this app's
            "one obvious way to read/write a table" convention avoids
            elsewhere (see ChatShell.tsx's own note on this). Full
            messaging for this client lives at /app/messages now. */}
        {!messages || messages.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
            No messages yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map((m) => (
              <li
                key={m.id}
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  {m.sender_role ?? "—"} · {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-1)" }}>{m.body}</div>
              </li>
            ))}
          </ul>
        )}
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 10 }}>
          <Link href="/app/messages" style={{ color: "var(--text-1)" }}>
            Reply from Messages →
          </Link>
        </p>
      </section>
    </main>
  );
}
