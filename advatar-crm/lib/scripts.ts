import { addDays, loadVideos, todayKey, videoLabel } from "@/lib/videos";
import type { ScriptRow, ScriptVideo } from "@/components/clientwork/ScriptsPanel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

/**
 * A client's content pillars: the ones named in their content plan,
 * then any others their videos use. In plan order, no repeats.
 */
export async function clientPillars(supabase: QueryableClient, clientId: string): Promise<string[]> {
  const [{ data: plan }, { data: vids }] = await Promise.all([
    supabase.from("planners").select("content").eq("client_id", clientId).maybeSingle(),
    supabase.from("content_videos").select("pillar").eq("client_id", clientId).not("pillar", "is", null),
  ]);
  const fromPlan = (((plan as { content?: { pillars?: { items?: { name?: string }[] } } } | null)?.content?.pillars?.items ?? []) as { name?: string }[]).map(
    (p) => p.name?.trim() ?? ""
  );
  const fromVideos = ((vids ?? []) as { pillar: string | null }[]).map((v) => v.pillar?.trim() ?? "");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...fromPlan, ...fromVideos]) {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** The Scripts tab: the library, the videos a script can go on (last week to two months ahead), and the pillars. */
export async function loadScripts(
  supabase: QueryableClient,
  clientId: string
): Promise<{ available: boolean; scripts: ScriptRow[]; videos: ScriptVideo[]; pillars: string[] }> {
  const today = todayKey();
  const [res, { videos }, pillars] = await Promise.all([
    supabase.from("scripts").select("id, title, pillar, hook, body, cta, notes, video_id, updated_at").eq("client_id", clientId).order("updated_at", { ascending: false }),
    loadVideos(supabase, { clientId, from: addDays(today, -7), to: addDays(today, 62), undated: true }),
    clientPillars(supabase, clientId).catch(() => [] as string[]),
  ]);
  return {
    available: !res.error,
    scripts: (res.error ? [] : res.data ?? []) as ScriptRow[],
    videos: videos.map((v) => ({ id: v.id, label: videoLabel(v), publish: v.publish_on })),
    pillars,
  };
}
