import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadUploads, loadAssets } from "@/lib/uploads";
import { UploadsWorkspace } from "@/components/uploads/UploadsWorkspace";
import { loadVideographerShare } from "@/lib/team-access";
import { MarkSectionSeen } from "@/components/NavBadge";
import { StatTile } from "@/components/StatTile";
import type { ProfileRole } from "@/lib/supabase/types";
import type { ClientChoice } from "@/components/SchedulePanel";

export const dynamic = "force-dynamic";

/**
 * The team's Uploads tab.
 *
 * The same page for four roles, showing different amounts of the same
 * thing, because RLS has already decided what each of them can see:
 *
 *   videographer        their own uploads (0020 scopes `submissions`
 *                       to created_by = auth.uid())
 *   staff               uploads on the clients they're assigned
 *   operations manager  uploads on the clients they run (0024)
 *   CEO                 everything
 *
 * There is deliberately no role branch on the query. A page that
 * filtered by role in TypeScript would be a second, weaker copy of
 * the rules already in Postgres, and the two would eventually
 * disagree — the kind of disagreement that shows somebody another
 * client's work.
 *
 * What the role does decide is what may be DONE here, which the
 * workspace turns into a handful of booleans.
 */
export default async function UploadsPage({ searchParams }: { searchParams?: { client?: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  const role = ((profile as { role?: ProfileRole } | null)?.role ?? "staff") as ProfileRole;

  // A client reaching this URL is bounced by middleware long before
  // here; this covers the case where it isn't, and sends them to the
  // version of this page built for them.
  if (role === "client") redirect("/app/portal/uploads");

  const [{ uploads, problem: uploadsProblem }, { assets, problem: assetsProblem }, { data: clients }] =
    await Promise.all([
      loadUploads(supabase),
      loadAssets(supabase),
      supabase.from("clients").select("id, name").order("name"),
    ]);

  const allClientChoices: ClientChoice[] = ((clients ?? []) as unknown as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  // First screen: who has uploads. Then one client's. Management can
  // also open everything at once. A videographer only ever sees their
  // own uploads anyway, so they skip the client screen when they work
  // for one client.
  const isManagement = role === "ceo" || role === "operations_manager";
  const picked = searchParams?.client ?? "";
  const showAll = picked === "all" && isManagement;
  const pickedClient = !showAll && picked ? allClientChoices.find((c) => c.id === picked) ?? null : null;
  const singleClient = allClientChoices.length === 1 ? allClientChoices[0] : null;
  const focus = pickedClient ?? (picked ? null : singleClient);

  if (!showAll && !focus) {
    return <ClientPicker role={role} uploads={uploads} assets={assets} clients={allClientChoices} isManagement={isManagement} />;
  }

  const clientChoices = focus ? [focus] : allClientChoices;
  const shownUploads = focus ? uploads.filter((u) => u.client_id === focus.id) : uploads;
  const shownAssets = focus ? assets.filter((a) => a.client_id === focus.id) : assets;

  const canReview = role === "ceo" || role === "operations_manager" || role === "staff";
  const awaiting = shownUploads.filter((u) => u.status === "submitted" || u.status === "in_review").length;
  const needsChanges = shownUploads.filter((u) => u.status === "changes_requested").length;
  const openItems = shownUploads.reduce((n, u) => n + u.checklist.filter((c) => !c.done).length, 0);
  const clientComments = shownUploads.reduce((n, u) => n + u.notes.filter((f) => f.audience === "client").length, 0);

  return (
    <main className="page">
      {/* Arriving here is what "I've seen these" means — otherwise the
          numbered circle beside the tab would only ever go up. */}
      <MarkSectionSeen prefix="/app/uploads" />

      {allClientChoices.length > 1 && (
        <Link href="/app/uploads" className="back-link">
          ← All clients
        </Link>
      )}
      <h1 className="page-title page-title-accent">{focus ? `Uploads — ${focus.name}` : "All uploads"}</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px", maxWidth: "64ch" }}>
        {canReview
          ? "Every cut handed in, the conversation about it, and the footage it was made from. Comments you leave here become the videographer's checklist."
          : "Your cuts, what the team and the client said about them, and what's left to fix. Approved work goes to your Portfolio on its own."}
      </p>

      <div className="stat-row">
        {canReview ? (
          <>
            <StatTile
              label="Awaiting review"
              value={String(awaiting)}
              tone={awaiting > 0 ? "warn" : "ok"}
              hint={awaiting > 0 ? "waiting on you" : "all caught up"}
            />
            <StatTile label="With the videographer" value={String(needsChanges)} tone="info" hint="changes requested" />
            <StatTile label="Client comments" value={String(clientComments)} tone="accent" hint="across all videos" />
            <StatTile label="Footage & assets" value={String(shownAssets.length)} tone="violet" hint="links and files" />
          </>
        ) : (
          <>
            <StatTile label="Uploads" value={String(shownUploads.length)} tone="violet" hint="all time" />
            <StatTile label="Awaiting review" value={String(awaiting)} tone="info" hint="with the reviewer" />
            <StatTile
              label="To fix"
              value={String(openItems)}
              tone={openItems > 0 ? "warn" : "neutral"}
              hint={openItems > 0 ? "on your checklists" : "nothing outstanding"}
            />
            <StatTile label="Footage & assets" value={String(shownAssets.length)} tone="accent" hint="on your clients" />
          </>
        )}
      </div>

      <UploadsWorkspace
        canShareWithClient={role !== "videographer" || (await loadVideographerShare(supabase, user.id)).canShare}
        role={role}
        currentUserId={user.id}
        uploads={shownUploads}
        assets={shownAssets}
        clients={clientChoices}
        uploadsProblem={uploadsProblem}
        assetsProblem={assetsProblem}
      />
    </main>
  );
}

/**
 * The first thing the Uploads tab shows: a card per client with
 * something waiting, and how much. Clients with nothing uploaded yet
 * are listed underneath, so a first upload is one click away too.
 */
function ClientPicker({
  role,
  uploads,
  assets,
  clients,
  isManagement,
}: {
  role: ProfileRole;
  uploads: Awaited<ReturnType<typeof loadUploads>>["uploads"];
  assets: Awaited<ReturnType<typeof loadAssets>>["assets"];
  clients: ClientChoice[];
  isManagement: boolean;
}) {
  const rows = clients.map((c) => {
    const mine = uploads.filter((u) => u.client_id === c.id);
    return {
      client: c,
      total: mine.length,
      waiting: mine.filter((u) => u.status === "submitted" || u.status === "in_review").length,
      changes: mine.filter((u) => u.status === "changes_requested").length,
      clientNotes: mine.reduce((n, u) => n + u.notes.filter((f) => f.audience === "client").length, 0),
      assets: assets.filter((a) => a.client_id === c.id).length,
      latest: mine[0]?.created_at ?? null,
    };
  });
  const withUploads = rows.filter((r) => r.total > 0 || r.assets > 0).sort((a, b) => (b.latest ?? "").localeCompare(a.latest ?? ""));
  const without = rows.filter((r) => r.total === 0 && r.assets === 0);

  return (
    <main className="page">
      <MarkSectionSeen prefix="/app/uploads" />
      <div className="page-head">
        <h1 className="page-title page-title-accent">Uploads</h1>
        {isManagement && uploads.length > 0 && (
          <Link href="/app/uploads?client=all" className="btn" style={{ textDecoration: "none" }}>
            ▶ All videos ({uploads.length})
          </Link>
        )}
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 24px", maxWidth: "64ch" }}>
        {role === "videographer"
          ? "Pick a client to hand a cut in or see what was said about yours."
          : "Pick a client to see their uploads, review them and share them."}
      </p>

      {withUploads.length > 0 ? (
        <div className="card-grid">
          {withUploads.map((r) => (
            <Link key={r.client.id} href={`/app/uploads?client=${r.client.id}`} className="card card-pad card-link" style={{ textDecoration: "none" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 8px" }}>{r.client.name}</h2>
              <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 10px" }}>
                {r.total} upload{r.total === 1 ? "" : "s"}
                {r.assets ? ` · ${r.assets} file${r.assets === 1 ? "" : "s"}` : ""}
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {r.waiting > 0 && <span className="pill pill-accent">{r.waiting} to review</span>}
                {r.changes > 0 && <span className="pill pill-warn">{r.changes} being changed</span>}
                {r.clientNotes > 0 && <span className="pill pill-info">{r.clientNotes} client note{r.clientNotes === 1 ? "" : "s"}</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="card card-pad-sm" style={{ color: "var(--text-3)" }}>Nothing has been uploaded yet.</p>
      )}

      {without.length > 0 && (
        <section className="section" style={{ marginTop: 28 }}>
          <h2 className="section-title" style={{ fontSize: 16 }}>No uploads yet</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {without.map((r) => (
              <Link key={r.client.id} href={`/app/uploads?client=${r.client.id}`} className="btn" style={{ textDecoration: "none" }}>
                {r.client.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
