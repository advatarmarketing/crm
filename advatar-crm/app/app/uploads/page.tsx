import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadUploads, loadAssets } from "@/lib/uploads";
import { UploadsWorkspace } from "@/components/uploads/UploadsWorkspace";
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
export default async function UploadsPage() {
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

  const clientChoices: ClientChoice[] = ((clients ?? []) as unknown as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const canReview = role === "ceo" || role === "operations_manager" || role === "staff";
  const awaiting = uploads.filter((u) => u.status === "submitted" || u.status === "in_review").length;
  const needsChanges = uploads.filter((u) => u.status === "changes_requested").length;
  const openItems = uploads.reduce((n, u) => n + u.checklist.filter((c) => !c.done).length, 0);
  const clientComments = uploads.reduce((n, u) => n + u.notes.filter((f) => f.audience === "client").length, 0);

  return (
    <main className="page">
      {/* Arriving here is what "I've seen these" means — otherwise the
          numbered circle beside the tab would only ever go up. */}
      <MarkSectionSeen prefix="/app/uploads" />

      <h1 className="page-title page-title-accent">Uploads</h1>
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
              tone={awaiting > 0 ? "accent" : "neutral"}
              hint={awaiting > 0 ? "waiting on you" : "all caught up"}
            />
            <StatTile label="With the videographer" value={String(needsChanges)} hint="changes requested" />
            <StatTile label="Client comments" value={String(clientComments)} hint="across all videos" />
            <StatTile label="Footage & assets" value={String(assets.length)} hint="links and files" />
          </>
        ) : (
          <>
            <StatTile label="Uploads" value={String(uploads.length)} hint="all time" />
            <StatTile label="Awaiting review" value={String(awaiting)} hint="with the reviewer" />
            <StatTile
              label="To fix"
              value={String(openItems)}
              tone={openItems > 0 ? "warn" : "neutral"}
              hint={openItems > 0 ? "on your checklists" : "nothing outstanding"}
            />
            <StatTile label="Footage & assets" value={String(assets.length)} hint="on your clients" />
          </>
        )}
      </div>

      <UploadsWorkspace
        role={role}
        currentUserId={user.id}
        uploads={uploads}
        assets={assets}
        clients={clientChoices}
        uploadsProblem={uploadsProblem}
        assetsProblem={assetsProblem}
      />
    </main>
  );
}
