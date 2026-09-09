import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";
import { Greeting } from "@/components/Greeting";
import { firstName as firstNameOf } from "@/lib/names";

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

  // Videos the team has deliberately shared (0025). A team-only
  // submission never appears here — RLS won't return it, so there is
  // no filter to forget.
  const { data: sharedVideos } = await supabase
    .from("submissions")
    .select("id, title, status, current_version, created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  const videoRows = (sharedVideos ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
    current_version: number;
    created_at: string;
  }[];

  const { data: videoVersions } = videoRows.length
    ? await supabase
        .from("submission_versions")
        .select("submission_id, version, url")
        .in(
          "submission_id",
          videoRows.map((v) => v.id)
        )
        .order("version", { ascending: false })
    : { data: null };

  const latestUrlBySubmission = new Map<string, string>();
  for (const v of (videoVersions ?? []) as unknown as {
    submission_id: string;
    version: number;
    url: string | null;
  }[]) {
    if (v.url && !latestUrlBySubmission.has(v.submission_id)) {
      latestUrlBySubmission.set(v.submission_id, v.url);
    }
  }

  let messageCount = 0;
  if (thread) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id);
    messageCount = count ?? 0;
  }

  const who = firstNameOf(profile.full_name, client?.name ?? "there");
  const serverHour = new Date().getHours();

  return (
    <main className="page">
      <header style={{ marginBottom: 40 }}>
        <h1 className="page-title page-title-accent">
          <Greeting name={who} serverHour={serverHour} />
        </h1>
        {client?.service && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", margin: "14px 0 0" }}>
            {client.service}
          </p>
        )}
      </header>

      <div className="stat-row">
        {/* Published is the state the client is waiting for, so it is
            the one that gets colour here. */}
        <StatTile
          label="Content Plan"
          value={publishedPlanner ? "Published" : "In progress"}
          tone={publishedPlanner ? "ok" : "warn"}
          hint={publishedPlanner ? "ready to read" : "your team is working on it"}
        />
        <StatTile label="Documents" value={String(documentCount ?? 0)} hint="shared with you" />
        <StatTile label="Messages" value={String(messageCount)} hint="in your thread" />
      </div>

      {client?.next_action && (
        /* The one thing on this page the client is meant to act on,
           so it is the only tinted panel here. */
        <section
          className="section"
          style={{
            padding: "20px 22px",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-ring)",
            borderRadius: "var(--radius-md)",
            maxWidth: 600,
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--accent)",
              marginBottom: 10,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            Next up
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 15.5, color: "var(--text-1)", lineHeight: 1.55 }}>
            {client.next_action}
          </span>
        </section>
      )}

      {videoRows.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Your videos</h2>
            <p className="section-sub">Newest first</p>
          </div>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {videoRows.map((v) => {
              const url = latestUrlBySubmission.get(v.id);
              return (
                <li
                  key={v.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    flexWrap: "wrap",
                    padding: "14px 16px",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${v.status === "approved" ? "var(--ok-fg)" : "var(--border-2)"}`,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 14.5, color: "var(--text-1)" }}>
                      {v.title}
                    </span>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>
                      {v.status === "approved" ? "signed off" : "with your team"} ·{" "}
                      {new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </span>

                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn" style={{ textDecoration: "none", flexShrink: 0 }}>
                      Watch ↗
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Jump to</h2>
          <p className="section-sub">Everything in your project</p>
        </div>

        <div className="card-grid">
          {JUMP_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card card-link card-pad-sm"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 62 }}
            >
              <span style={{ fontFamily: "var(--font-body)", fontSize: 14.5, fontWeight: 600, color: "var(--text-1)" }}>
                {link.label}
              </span>
              <span aria-hidden="true" style={{ color: "var(--accent)", lineHeight: 0, flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
