import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, loadVideos, prettyDay, todayKey, videoLabel, videoStage } from "@/lib/videos";

/**
 * The top of every team dashboard: what is due, from the video
 * schedule (0042), worst first. RLS decides whose — the CEO sees every
 * client, everyone else the clients they are on.
 *
 *   late       the day has passed and nothing was uploaded
 *   due soon   going out in the next three days, nothing uploaded
 *   not shared uploaded, going out within two days, client hasn't got it
 *   changes    the client asked for changes
 *
 * Draws nothing at all when nothing is due: an empty "all clear" box
 * every morning is a box people learn to skip.
 */

type Item = { key: string; tone: "danger" | "warn" | "info"; text: string; href: string; date: string | null };

function whenWord(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return prettyDay(date);
}

export async function DueFromYou({ role }: { role: string }) {
  const supabase = createClient();
  const today = todayKey();
  const { videos, uploads, available } = await loadVideos(supabase, { from: addDays(today, -21), to: addDays(today, 3) });
  if (!available || videos.length === 0) return null;

  const clientIds = Array.from(new Set(videos.map((v) => v.client_id)));
  const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
  const nameOf = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const isVideographer = role === "videographer";
  const hrefFor = (clientId: string) => (isVideographer ? `/app/uploads?client=${clientId}` : `/app/clients/${clientId}?tab=videos`);

  const items: Item[] = [];
  for (const v of videos) {
    if (!v.publish_on || v.posted_at) continue;
    const upload = v.submission_id ? uploads.get(v.submission_id) : null;
    const stage = videoStage(v, upload);
    const client = nameOf.get(v.client_id) ?? "A client";
    const what = videoLabel(v);

    if (stage === "planned" && v.publish_on < today) {
      items.push({
        key: v.id,
        tone: "danger",
        date: v.publish_on,
        text: `${client}: “${what}” was due ${prettyDay(v.publish_on)} and nothing has been uploaded.`,
        href: hrefFor(v.client_id),
      });
    } else if (stage === "planned") {
      items.push({
        key: v.id,
        tone: v.publish_on <= addDays(today, 1) ? "danger" : "warn",
        date: v.publish_on,
        text: `${client} needs “${what}” for ${whenWord(v.publish_on, today)}. It hasn’t been uploaded yet.`,
        href: hrefFor(v.client_id),
      });
    } else if (stage === "editing" && !isVideographer && v.publish_on <= addDays(today, 2)) {
      items.push({
        key: v.id,
        tone: "warn",
        date: v.publish_on,
        text: `${client}: “${what}” goes out ${whenWord(v.publish_on, today)} — uploaded but not shared with the client yet.`,
        href: `/app/uploads?client=${v.client_id}`,
      });
    } else if (stage === "changes") {
      items.push({
        key: v.id,
        tone: "info",
        date: v.publish_on,
        text: `${client} asked for changes on “${upload?.title ?? what}”.`,
        href: `/app/uploads?client=${v.client_id}`,
      });
    }
  }

  if (items.length === 0) return null;

  const rank = { danger: 0, warn: 1, info: 2 };
  items.sort((a, b) => rank[a.tone] - rank[b.tone] || (a.date ?? "").localeCompare(b.date ?? ""));
  const shown = items.slice(0, 8);
  const colour = { danger: "var(--danger-fg)", warn: "var(--warn-fg)", info: "var(--info-fg, var(--text-2))" };

  return (
    <section className="card card-pad" style={{ marginBottom: 28, borderLeft: "4px solid var(--danger-fg)" }} aria-label="Due from you">
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 12px" }}>
        Due from you <span className="pill pill-danger">{items.length}</span>
      </h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((it) => (
          <li key={it.key}>
            <Link
              href={it.href}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                textDecoration: "none",
                color: "var(--text-1)",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              <span aria-hidden style={{ color: colour[it.tone], fontSize: 12, marginTop: 3 }}>●</span>
              <span>{it.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "10px 0 0" }}>
          And {items.length - shown.length} more — see the calendar’s video schedule.
        </p>
      )}
    </section>
  );
}
