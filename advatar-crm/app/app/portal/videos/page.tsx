import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadUploads } from "@/lib/uploads";
import { STAGE_LABEL, loadVideos, prettyDay, todayKey, videoLabel, videoStage, type ContentVideo } from "@/lib/videos";
import { ClientVideoReview, type ReviewMode, type ReviewNote } from "@/components/videos/ClientVideoReview";
import { MarkSectionSeen } from "@/components/NavBadge";

export const dynamic = "force-dynamic";

/**
 * The client's Videos page: the thing they are paying for, front and
 * centre. Three parts, each drawn only when it has something in it:
 *
 *   Needs you      — delivered, waiting on their tick (only for a
 *                    package with a review step).
 *   Your videos    — everything delivered, newest first, each with the
 *                    player and the feedback beside it.
 *   Coming up      — what is scheduled to go out, even before anything
 *                    is filmed: a date and a pillar, never empty boxes.
 *   Thumbnails / graphics — only for a package that includes them.
 *
 * Everything is narrowed by RLS: only uploads deliberately shared with
 * this client, only the client side of each conversation (0025/0028),
 * only their own schedule (0042).
 */
export default async function PortalVideosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).maybeSingle();
  const clientId = (profile as { client_id?: string | null } | null)?.client_id ?? null;
  if (!clientId) return null; // see PortalLayout

  const [{ uploads }, schedule, { data: pkgRow, error: pkgError }] = await Promise.all([
    loadUploads(supabase, { clientId, audience: "client" }),
    loadVideos(supabase, { clientId, undated: true }),
    supabase.from("client_packages").select("revisions, revision_rounds, thumbnails, graphics").eq("client_id", clientId).maybeSingle(),
  ]);

  const pkg = (pkgError ? null : pkgRow) as {
    revisions: "none" | "approve" | "full";
    revision_rounds: number | null;
    thumbnails: boolean;
    graphics: boolean;
  } | null;
  const mode: ReviewMode = pkg ? pkg.revisions : "unset";

  // 0042's columns, read on their own so a missing migration costs the
  // verdict and the player link, not the page.
  const ids = uploads.map((u) => u.id);
  const extra = new Map<string, { kind: string; client_decision: string | null; client_change_rounds: number }>();
  const streams = new Map<string, string>();
  if (ids.length > 0) {
    const [{ data: subs }, { data: versions }] = await Promise.all([
      supabase.from("submissions").select("id, kind, client_decision, client_change_rounds").in("id", ids),
      supabase.from("submission_versions").select("submission_id, version, stream_url").in("submission_id", ids),
    ]);
    for (const s of (subs ?? []) as { id: string; kind: string; client_decision: string | null; client_change_rounds: number }[]) {
      extra.set(s.id, s);
    }
    for (const v of (versions ?? []) as { submission_id: string; version: number; stream_url: string | null }[]) {
      if (v.stream_url) streams.set(`${v.submission_id}:${v.version}`, v.stream_url);
    }
  }

  const videoBySubmission = new Map<string, ContentVideo>();
  for (const v of schedule.videos) if (v.submission_id) videoBySubmission.set(v.submission_id, v);

  // 0046's shape, on its own so a missing update costs nothing.
  const { data: shapes } = await supabase.from("content_videos").select("id, aspect").eq("client_id", clientId);
  const aspectById = new Map(((shapes ?? []) as { id: string; aspect: string | null }[]).map((a) => [a.id, a.aspect]));

  const today = todayKey();

  const delivered = uploads
    .filter((u) => u.current_version > 0)
    .map((u) => {
      const ex = extra.get(u.id);
      const kind = (ex?.kind ?? "video") as "video" | "thumbnail" | "graphic";
      const latest = u.versions.find((v) => v.version === u.current_version) ?? u.versions[u.versions.length - 1];
      const scheduled = videoBySubmission.get(u.id) ?? null;
      const decision = (ex?.client_decision ?? null) as "approved" | "changes_requested" | null;
      const used = ex?.client_change_rounds ?? 0;
      const roundsLeft = pkg?.revisions === "full" && pkg.revision_rounds ? Math.max(0, pkg.revision_rounds - used) : null;
      const notes: ReviewNote[] = u.notes
        .filter((n) => n.audience === "client")
        .map((n) => ({
          id: n.id,
          body: n.body,
          timecode: n.timecode_seconds,
          authorName: n.authorName,
          mine: n.authorId === user.id,
          createdAt: n.created_at,
        }));
      const meta = [
        scheduled?.posted_at
          ? "Posted"
          : scheduled?.publish_on
            ? `${scheduled.publish_on < today ? "Went out" : "Goes out"} ${prettyDay(scheduled.publish_on)}`
            : null,
        scheduled?.pillar ?? null,
        u.current_version > 1 ? `Version ${u.current_version}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        u,
        kind,
        url: latest?.url ?? null,
        streamUrl: latest ? streams.get(`${u.id}:${latest.version}`) ?? null : null,
        scheduled,
        decision,
        roundsLeft,
        notes,
        meta: meta || null,
        title: scheduled?.title?.trim() || u.title,
      };
    });

  const videos = delivered.filter((d) => d.kind === "video");
  const extras = delivered.filter((d) => d.kind !== "video");
  const waiting = mode === "none" ? [] : videos.filter((d) => !d.decision);
  const rest = videos.filter((d) => !waiting.includes(d));

  const comingUp = schedule.videos
    .filter((v) => v.publish_on && v.publish_on >= today && !v.posted_at)
    .filter((v) => !v.submission_id || !uploads.some((u) => u.id === v.submission_id))
    .slice(0, 14);

  // Extras appear for a package that includes them, or when something
  // was delivered anyway (an older client with no package chosen).
  const showThumbs = pkg ? pkg.thumbnails : extras.some((d) => d.kind === "thumbnail");
  const showGraphics = pkg ? pkg.graphics : extras.some((d) => d.kind === "graphic");
  const extrasShown = extras.filter((d) => (d.kind === "thumbnail" ? showThumbs : showGraphics));

  const intro =
    mode === "none"
      ? "Every video we’ve made for you, and what’s going out next. Nothing for you to do — we post them for you."
      : mode === "approve"
        ? "Watch each video and tick it off when you’re happy. Here’s what’s going out next, too."
        : "Watch each video, then approve it or tell us what to change — pause at the exact moment and leave a note.";

  const card = (d: (typeof delivered)[number]) => (
    <ClientVideoReview
      key={d.u.id}
      anchorId={d.scheduled ? `video-${d.scheduled.id}` : `upload-${d.u.id}`}
      title={d.title}
      kind={d.kind}
      meta={d.meta}
      url={d.url}
      streamUrl={d.streamUrl}
      aspect={d.scheduled ? aspectById.get(d.scheduled.id) ?? null : null}
      submissionId={d.u.id}
      version={d.u.current_version}
      decision={d.decision}
      mode={mode}
      roundsLeft={d.roundsLeft}
      notes={d.notes}
    />
  );

  const h2: CSSProperties = { fontFamily: "var(--font-display)", fontSize: 24, margin: "0 0 14px" };

  return (
    <main className="page page-md">
      <MarkSectionSeen prefix="/app/portal/videos" />
      <h1 className="page-title page-title-accent">Your videos</h1>
      <p style={{ fontSize: 14, color: "var(--text-2)", margin: "0 0 28px", maxWidth: "62ch", lineHeight: 1.6 }}>{intro}</p>

      {delivered.length === 0 && comingUp.length === 0 && (
        <div className="card card-pad" style={{ color: "var(--text-2)" }}>
          Your first videos are in production. They’ll appear here the moment they’re ready, and you’ll get a notification.
        </div>
      )}

      {waiting.length > 0 && (
        <section className="section" style={{ marginBottom: 36 }}>
          <h2 style={h2}>
            Needs you <span className="pill pill-accent">{waiting.length}</span>
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{waiting.map(card)}</div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="section" style={{ marginBottom: 36 }}>
          <h2 style={h2}>{waiting.length > 0 ? "Already seen" : "Delivered"}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{rest.map(card)}</div>
        </section>
      )}

      {comingUp.length > 0 && (
        <section className="section" style={{ marginBottom: 36 }}>
          <h2 style={h2}>Coming up</h2>
          <ul className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {comingUp.map((v, i) => {
              const stage = videoStage(v, v.submission_id ? schedule.uploads.get(v.submission_id) : null);
              return (
                <li
                  key={v.id}
                  id={`video-${v.id}`}
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "center",
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 92, color: "var(--text-2)" }}>
                    {prettyDay(v.publish_on!)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                    {videoLabel(v)}
                    {v.title && v.pillar ? <span style={{ color: "var(--text-3)" }}> · {v.pillar}</span> : null}
                  </span>
                  <span className="pill">{STAGE_LABEL[stage].client}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {extrasShown.length > 0 && (
        <section className="section">
          <h2 style={h2}>
            {showThumbs && showGraphics ? "Thumbnails & graphics" : showThumbs ? "Thumbnails" : "Graphics & posters"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{extrasShown.map(card)}</div>
        </section>
      )}
    </main>
  );
}
