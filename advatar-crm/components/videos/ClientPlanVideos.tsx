import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABEL, loadVideos, monthBounds, prettyDay, todayKey, videoLabel, videoStage } from "@/lib/videos";

/**
 * The Videos tab inside the client's content plan: this month's
 * videos at a glance, and the way through to watching them.
 *
 * Only what exists is drawn — a date, what it is, where it has got to.
 * No hook/body/CTA boxes for videos that never had a script.
 */
export async function ClientPlanVideos({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const today = todayKey();
  const { from, to } = monthBounds(today);
  const { videos, uploads, available } = await loadVideos(supabase, { clientId, from, to });

  const monthName = new Date(`${from}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const ready = videos.filter((v) => ["ready", "changes", "approved", "posted"].includes(videoStage(v, v.submission_id ? uploads.get(v.submission_id) : null))).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--display, var(--font-display))", fontSize: 30, margin: 0 }}>
          {available && videos.length > 0 ? `${videos.length} videos in ${monthName}` : "Your videos"}
        </h2>
        <Link href="/app/portal/videos" className="btn btn-primary" style={{ textDecoration: "none" }}>
          ▶ Watch &amp; review{ready ? ` (${ready})` : ""}
        </Link>
      </div>

      {available && videos.length > 0 ? (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {videos.map((v) => {
            const stage = videoStage(v, v.submission_id ? uploads.get(v.submission_id) : null);
            const past = v.publish_on! < today;
            return (
              <li
                key={v.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "96px minmax(0,1fr) auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 14px",
                  border: "1px solid var(--line, var(--border))",
                  borderRadius: 10,
                  opacity: past && stage === "posted" ? 0.7 : 1,
                }}
              >
                <span style={{ fontFamily: "var(--mono, var(--font-mono))", fontSize: 12 }}>{prettyDay(v.publish_on!)}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{videoLabel(v)}</strong>
                  {v.title && v.pillar ? <span style={{ opacity: 0.6 }}> · {v.pillar}</span> : null}
                  {v.hook?.trim() ? (
                    <span style={{ display: "block", fontSize: 13, opacity: 0.75, marginTop: 2 }}>“{v.hook.trim()}”</span>
                  ) : null}
                </span>
                <span style={{ fontFamily: "var(--mono, var(--font-mono))", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  {STAGE_LABEL[stage].client}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p style={{ margin: 0, opacity: 0.75 }}>This month’s schedule is being put together. It’ll show here as soon as it’s set.</p>
      )}
    </div>
  );
}
