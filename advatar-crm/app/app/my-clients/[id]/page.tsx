import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlannerDocument } from "@/components/PlannerDocument";
import { DocumentsList } from "@/components/DocumentsList";
import { BrandKitPanel, emptyBrandKit, type BrandKit } from "@/components/BrandKitPanel";
import { ClientTeamThread, type TeamMessage } from "@/components/ClientTeamThread";

export default async function MyClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: client }, { data: documents }, { data: thread }, { data: brandKit }, { data: teamMessages }, { data: people }] =
    await Promise.all([
      supabase.from("clients").select("id, name, service, next_action").eq("id", params.id).single(),
      supabase.from("documents").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
      supabase.from("message_threads").select("id").eq("client_id", params.id).maybeSingle(),
      supabase.from("client_brand_kits").select("*").eq("client_id", params.id).maybeSingle(),
      supabase
        .from("client_team_messages")
        .select("id, body, created_at, author_id")
        .eq("client_id", params.id)
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("id, full_name"),
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

  const nameById = new Map(
    ((people ?? []) as unknown as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name?.trim() || null,
    ])
  );

  const teamThread: TeamMessage[] = ((teamMessages ?? []) as unknown as TeamMessage[]).map((m) => ({
    ...m,
    authorName: m.author_id ? nameById.get(m.author_id) ?? null : null,
  }));

  return (
    <main className="page">
      <h1 className="page-title page-title-accent" style={{ margin: "0 0 4px" }}>
        {client.name}
      </h1>
      {client.service && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", margin: "0 0 32px" }}>
          {client.service}
        </p>
      )}

      {/* Brand kit first: it is what you check before shooting, not
          after. Read-only here — client_brand_kits (0020) gives a
          videographer select access only. */}
      <section className="section" style={{ maxWidth: 760 }}>
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          Brand kit
        </h2>
        <BrandKitPanel
          initialKit={(brandKit as BrandKit | null) ?? emptyBrandKit(params.id)}
          editable={false}
        />
      </section>

      <section className="section" style={{ maxWidth: 760 }}>
        <h2 className="section-title">
          Team thread
        </h2>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 14px" }}>
          Internal — the client cannot see this
        </p>
        <ClientTeamThread
          clientId={params.id}
          initialMessages={teamThread}
          currentUserId={user?.id ?? null}
        />
      </section>

      <section className="section">
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          Content Plan
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

      <section className="section" style={{ maxWidth: 760 }}>
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          Documents
        </h2>
        {/* editable=false: Phase 3 gives videographers select-only
            access to documents — same reasoning as the planner above. */}
        <DocumentsList initialDocuments={documents ?? []} editable={false} />
      </section>

      <section className="section" style={{ maxWidth: 760 }}>
        <h2 className="section-title" style={{ marginBottom: 16 }}>
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
