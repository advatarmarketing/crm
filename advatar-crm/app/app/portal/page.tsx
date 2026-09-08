import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";

// Same order as PortalNav — Documents after Content Plan.
const JUMP_LINKS = [
  { href: "/app/portal/content", label: "Content Hub" },
  { href: "/app/portal/plan", label: "Content Plan" },
  { href: "/app/portal/documents", label: "Documents" },
  { href: "/app/portal/messages", label: "Messages" },
];

// Phase 9: Overview. Everything here re-derives from tables this
// client session already has read access to under Phase 3's RLS
// (clients, documents, planners, message_threads/messages) — no new
// policies needed for this page.
export default async function PortalOverviewPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("full_name, client_id").eq("id", user.id).single();

  if (!profile?.client_id) {
    // PortalLayout already renders the "not linked yet" message and
    // never mounts this page in that case — this return is only a
    // defensive fallback, never expected to actually render.
    return null;
  }

  const clientId = profile.client_id;

  const [{ data: client }, { count: documentCount }, { data: publishedPlanner }, { data: thread }] = await Promise.all([
    supabase.from("clients").select("name, service, next_action").eq("id", clientId).single(),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("planners").select("updated_at").eq("client_id", clientId).eq("status", "published").maybeSingle(),
    supabase.from("message_threads").select("id").eq("client_id", clientId).maybeSingle(),
  ]);

  let messageCount = 0;
  if (thread) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id);
    messageCount = count ?? 0;
  }

  const displayName = profile.full_name || client?.name || "there";

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 4px" }}>
        Welcome back, {displayName}
      </h1>
      {client?.service && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", margin: "0 0 28px" }}>
          {client.service}
        </p>
      )}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 36 }}>
        <StatTile label="Content Plan" value={publishedPlanner ? "Published" : "In progress"} />
        <StatTile label="Documents" value={String(documentCount ?? 0)} />
        <StatTile label="Messages" value={String(messageCount)} />
      </div>

      {client?.next_action && (
        <section
          style={{
            marginBottom: 36,
            padding: "18px 20px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            maxWidth: 560,
          }}
        >
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-3)",
              marginBottom: 6,
            }}
          >
            Next up
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-1)" }}>{client.next_action}</span>
        </section>
      )}

      <section>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Jump to</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {JUMP_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.03em",
                color: "var(--text-1)",
                textDecoration: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 14px",
                background: "var(--surface)",
              }}
            >
              {link.label} →
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
