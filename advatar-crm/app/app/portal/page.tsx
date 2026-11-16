import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";
import { Greeting } from "@/components/Greeting";
import { firstName as firstNameOf } from "@/lib/names";
import { addDays, loadVideos, monthBounds, prettyDay, todayKey, videoLabel, videoStage } from "@/lib/videos";
import { loadClientAccount, money } from "@/lib/account";

// Same order as PortalNav — Documents after Content Plan.
const JUMP_LINKS = [
  { href: "/app/portal/videos", label: "Your videos" },
  { href: "/app/portal/calendar", label: "Calendar" },
  { href: "/app/portal/plan", label: "Content Plan" },
  { href: "/app/portal/account", label: "Account" },
  { href: "/app/portal/messages", label: "Messages" },
  { href: "/app/portal/documents", label: "Documents" },
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
    .limit(6);

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

  // 0041-0043: what needs them, what goes out next, where they stand.
  // Each read is allowed to come back empty before its migration runs.
  const today = todayKey();
  const { from: monthFrom, to: monthTo } = monthBounds(today);
  const [schedule, account, pkgRes, decisions] = await Promise.all([
    loadVideos(supabase, { clientId, from: addDays(today, -40), to: addDays(today, 45) }),
    loadClientAccount(supabase, clientId),
    supabase.from("client_packages").select("revisions").eq("client_id", clientId).maybeSingle(),
    videoRows.length
      ? supabase.from("submissions").select("id, kind, client_decision").in("id", videoRows.map((v) => v.id))
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const revisions = ((pkgRes as { data: { revisions?: string } | null }).data?.revisions ?? "unset") as string;
  const decisionById = new Map(
    (((decisions as { data: unknown }).data ?? []) as { id: string; kind?: string; client_decision: string | null }[]).map((d) => [d.id, d])
  );
  const toReview =
    revisions === "none"
      ? []
      : videoRows.filter(
          (v) =>
            v.current_version > 0 &&
            decisionById.has(v.id) &&
            (decisionById.get(v.id)!.kind ?? "video") === "video" &&
            !decisionById.get(v.id)!.client_decision
        );
  const goingOut = schedule.videos.filter((v) => v.publish_on && v.publish_on >= today && !v.posted_at).slice(0, 5);
  const thisMonth = schedule.videos.filter((v) => v.publish_on && v.publish_on >= monthFrom && v.publish_on <= monthTo).length;
  const paymentSoon = account.next && account.next.date <= addDays(today, 7) ? account.next : null;

  const needs: { key: string; text: string; href: string; tone: "accent" | "danger" | "warn" }[] = [];
  if (toReview.length > 0) {
    needs.push({
      key: "review",
      tone: "accent",
      text:
        toReview.length === 1
          ? `“${toReview[0].title}” is ready — watch it and ${revisions === "approve" ? "tick it off" : "approve it or ask for changes"}.`
          : `${toReview.length} videos are ready for you to watch and ${revisions === "approve" ? "tick off" : "approve"}.`,
      href: "/app/portal/videos",
    });
  }
  for (const inv of account.overdue) {
    needs.push({
      key: `inv-${inv.id}`,
      tone: "danger",
      text: `${inv.number ? `Invoice ${inv.number}` : "A payment"} (${money(inv.amount)}) was due ${inv.due_date ? prettyDay(inv.due_date) : ""} and hasn’t been marked received.`,
      href: "/app/portal/account",
    });
  }
  if (paymentSoon) {
    needs.push({
      key: "pay",
      tone: "warn",
      text: `${paymentSoon.label}${paymentSoon.amount !== null ? ` of ${money(paymentSoon.amount)}` : ""} is due ${prettyDay(paymentSoon.date)}.`,
      href: "/app/portal/account",
    });
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

      {/* The first thing on the page, so it cannot be missed. Drawn
          only when there is something to do. */}
      {needs.length > 0 && (
        <section
          className="section"
          aria-label="What needs you"
          style={{ padding: "18px 20px", border: "1px solid var(--accent-ring)", background: "var(--accent-soft)", borderRadius: "var(--radius-md)" }}
        >
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 10px" }}>What needs you</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {needs.map((n) => (
              <li key={n.key}>
                <Link href={n.href} style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "var(--text-1)", textDecoration: "none", fontSize: 15, lineHeight: 1.5 }}>
                  <span aria-hidden style={{ color: n.tone === "danger" ? "var(--danger-fg)" : n.tone === "warn" ? "var(--warn-fg)" : "var(--accent)" }}>●</span>
                  <span>
                    {n.text} <span style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>Open →</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="stat-row">
        {schedule.available && (
          <StatTile
            label="Next video out"
            value={goingOut[0] ? prettyDay(goingOut[0].publish_on!, false) : "—"}
            tone={goingOut[0] ? "accent" : "neutral"}
            hint={goingOut[0] ? videoLabel(goingOut[0]) : "being scheduled"}
          />
        )}
        {schedule.available && thisMonth > 0 && <StatTile label="Videos this month" value={String(thisMonth)} hint="on your calendar" />}
        {account.available && (account.next || account.paid.length > 0 || account.overdue.length > 0) && (
          <StatTile
            label="Account"
            value={account.upToDate ? "Up to date" : "Overdue"}
            tone={account.upToDate ? "ok" : "danger"}
            hint={account.next ? `next due ${prettyDay(account.next.date, false)}` : "nothing due"}
          />
        )}
        {/* Published is the state the client is waiting for, so it is
            the one that gets colour here. */}
        <StatTile
          label="Content Plan"
          value={publishedPlanner ? "Published" : "In progress"}
          tone={publishedPlanner ? "ok" : "warn"}
          hint={publishedPlanner ? "ready to read" : "your team is working on it"}
        />
        {!schedule.available && <StatTile label="Documents" value={String(documentCount ?? 0)} hint="shared with you" />}
        {!schedule.available && <StatTile label="Messages" value={String(messageCount)} hint="in your thread" />}
      </div>

      {goingOut.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Going out next</h2>
            <Link href="/app/portal/calendar" className="section-sub">
              See the calendar →
            </Link>
          </div>
          <ul className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {goingOut.map((v, i) => {
              const stage = videoStage(v, v.submission_id ? schedule.uploads.get(v.submission_id) : null);
              return (
                <li key={v.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "11px 16px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 92, color: "var(--text-2)" }}>{prettyDay(v.publish_on!)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{videoLabel(v)}</span>
                  {stage !== "planned" && stage !== "editing" && <span className="pill pill-accent">Ready to watch</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
            <h2 className="section-title">Latest videos</h2>
            <Link href="/app/portal/videos" className="section-sub">
              All videos →
            </Link>
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
                      {decisionById.get(v.id)?.client_decision === "approved"
                        ? "approved"
                        : decisionById.get(v.id)?.client_decision === "changes_requested"
                          ? "changes on the way"
                          : "ready to watch"}{" "}
                      ·{" "}
                      {new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </span>

                  {url && (
                    <Link href={`/app/portal/videos#upload-${v.id}`} className="btn" style={{ textDecoration: "none", flexShrink: 0 }}>
                      ▶ Watch
                    </Link>
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
