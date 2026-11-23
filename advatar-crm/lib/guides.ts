import { addDays, todayKey, videoLabel, type ContentVideo } from "@/lib/videos";

/**
 * "How to make this video" guides (0054): one Filming and one Editing
 * guide per client and content pillar, a starter template for each
 * section, and runs (one video worked through a guide).
 *
 * Every loader here is safe before 0054 runs: it reports `available:
 * false` rather than throwing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export type GuideStage = "filming" | "editing";
export const GUIDE_STAGES: { id: GuideStage; label: string; verb: string }[] = [
  { id: "filming", label: "Filming", verb: "film" },
  { id: "editing", label: "Editing", verb: "edit" },
];

export function isStage(v: unknown): v is GuideStage {
  return v === "filming" || v === "editing";
}

export interface GuideStep {
  id: string;
  text: string;
}

export interface Guide {
  id: string;
  client_id: string;
  pillar: string;
  stage: GuideStage;
  elements: string[];
  steps: GuideStep[];
  notes: string | null;
  updated_at: string;
}

export interface GuideTemplate {
  stage: GuideStage;
  elements: string[];
  steps: GuideStep[];
}

export interface GuideRun {
  id: string;
  guide_id: string;
  video_id: string | null;
  done_steps: string[];
  started_at: string;
  finished_at: string | null;
}

export interface SidebarClient {
  id: string;
  name: string;
  internal: boolean;
  pillars: { name: string; has: Record<GuideStage, boolean> }[];
}

const FALLBACK_TEMPLATES: Record<GuideStage, GuideTemplate> = {
  filming: {
    stage: "filming",
    elements: ["Shot list", "B-roll ideas", "Props", "Location", "Who is on camera"],
    steps: [
      { id: "f1", text: "Plan: read the script and the shot list" },
      { id: "f2", text: "Set up: light, sound and framing (9:16)" },
      { id: "f3", text: "Film the main shots, two good takes of each line" },
      { id: "f4", text: "Film the b-roll" },
      { id: "f5", text: "Check the footage before you leave" },
    ],
  },
  editing: {
    stage: "editing",
    elements: ["Captions style", "Music", "On-screen text", "Colour look", "End card"],
    steps: [
      { id: "e1", text: "Cut: strongest hook first, trim every pause" },
      { id: "e2", text: "Captions" },
      { id: "e3", text: "Music and sound effects" },
      { id: "e4", text: "Colour" },
      { id: "e5", text: "Export (9:16, 1080p)" },
      { id: "e6", text: "Upload for approval" },
    ],
  },
};

const norm = (s: string) => s.trim().toLowerCase();

/** Same pillar, ignoring case and spaces at the ends. */
export function samePillar(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && norm(a) === norm(b));
}

/** Where a pillar's guide lives on the Tools page. */
export function guideHref(clientId: string, pillar: string, stage: GuideStage, videoId?: string | null): string {
  const q = new URLSearchParams({ stage, client: clientId, pillar });
  if (videoId) q.set("video", videoId);
  return `/app/tools?${q.toString()}`;
}

/**
 * The side panel: the clients the caller works on (RLS decides; the
 * CEO sees every active client), each with its content pillars and
 * which of them have guides yet.
 */
export async function loadGuideSidebar(supabase: QueryableClient): Promise<{ available: boolean; clients: SidebarClient[] }> {
  const [clientsRes, plansRes, videosRes, guidesRes] = await Promise.all([
    supabase.from("clients").select("*"),
    supabase.from("planners").select("client_id, content"),
    supabase.from("content_videos").select("client_id, pillar").not("pillar", "is", null),
    supabase.from("pillar_guides").select("client_id, pillar, stage"),
  ]);
  const clients = ((clientsRes.data ?? []) as { id: string; name: string | null; stage?: string; internal_kind?: string | null }[]).filter(
    (c) => c.stage === "active" || c.internal_kind
  );
  const pillarsBy = new Map<string, string[]>();
  const add = (clientId: string, name: string | null | undefined) => {
    const n = name?.trim();
    if (!n) return;
    const list = pillarsBy.get(clientId) ?? [];
    if (!list.some((x) => norm(x) === norm(n))) list.push(n);
    pillarsBy.set(clientId, list);
  };
  for (const p of (plansRes.data ?? []) as { client_id: string; content?: { pillars?: { items?: { name?: string }[] } } }[]) {
    for (const item of p.content?.pillars?.items ?? []) add(p.client_id, item.name);
  }
  for (const v of (videosRes.data ?? []) as { client_id: string; pillar: string | null }[]) add(v.client_id, v.pillar);
  const guides = (guidesRes.error ? [] : guidesRes.data ?? []) as { client_id: string; pillar: string; stage: GuideStage }[];
  for (const g of guides) add(g.client_id, g.pillar);

  return {
    available: !guidesRes.error,
    clients: clients
      .map((c) => ({
        id: c.id,
        name: c.name?.trim() || "Untitled client",
        internal: Boolean(c.internal_kind),
        pillars: (pillarsBy.get(c.id) ?? []).map((name) => ({
          name,
          has: {
            filming: guides.some((g) => g.client_id === c.id && g.stage === "filming" && samePillar(g.pillar, name)),
            editing: guides.some((g) => g.client_id === c.id && g.stage === "editing" && samePillar(g.pillar, name)),
          },
        })),
      }))
      .sort((a, b) => Number(a.internal) - Number(b.internal) || a.name.localeCompare(b.name)),
  };
}

export async function loadTemplates(supabase: QueryableClient): Promise<Record<GuideStage, GuideTemplate>> {
  const { data, error } = await supabase.from("guide_templates").select("stage, elements, steps");
  const out = { ...FALLBACK_TEMPLATES };
  if (!error) for (const t of (data ?? []) as GuideTemplate[]) if (isStage(t.stage)) out[t.stage] = { stage: t.stage, elements: t.elements ?? [], steps: t.steps ?? [] };
  return out;
}

export interface GuideView {
  available: boolean;
  client: { id: string; name: string } | null;
  pillar: string;
  stage: GuideStage;
  guide: Guide | null;
  /** The other section's guide exists (for the Filming / Editing switch). */
  other: boolean;
  template: GuideTemplate;
  runs: GuideRun[];
  /** Videos a new run can be for: this client's, last week to two months ahead, this pillar first. */
  videos: { id: string; label: string; publish: string | null; samePillar: boolean }[];
}

export async function loadGuide(supabase: QueryableClient, clientId: string, pillar: string, stage: GuideStage): Promise<GuideView> {
  const today = todayKey();
  const [clientRes, guidesRes, templates, videosRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle(),
    supabase.from("pillar_guides").select("id, client_id, pillar, stage, elements, steps, notes, updated_at").eq("client_id", clientId),
    loadTemplates(supabase),
    supabase
      .from("content_videos")
      .select("id, title, pillar, publish_on")
      .eq("client_id", clientId)
      .gte("publish_on", addDays(today, -7))
      .lte("publish_on", addDays(today, 62))
      .order("publish_on", { ascending: true }),
  ]);
  const guides = (guidesRes.error ? [] : guidesRes.data ?? []) as Guide[];
  const guide = guides.find((g) => g.stage === stage && samePillar(g.pillar, pillar)) ?? null;
  const other = guides.some((g) => g.stage !== stage && samePillar(g.pillar, pillar));
  let runs: GuideRun[] = [];
  if (guide) {
    const { data } = await supabase
      .from("guide_runs")
      .select("id, guide_id, video_id, done_steps, started_at, finished_at")
      .eq("guide_id", guide.id)
      .order("started_at", { ascending: false })
      .limit(12);
    runs = (data ?? []) as GuideRun[];
  }
  const videos = ((videosRes.data ?? []) as Pick<ContentVideo, "id" | "title" | "pillar" | "publish_on">[])
    .map((v) => ({ id: v.id, label: videoLabel(v), publish: v.publish_on, samePillar: samePillar(v.pillar, pillar) }))
    .sort((a, b) => Number(b.samePillar) - Number(a.samePillar) || (a.publish ?? "").localeCompare(b.publish ?? ""));
  const c = clientRes.data as { id: string; name: string | null } | null;
  return {
    available: !guidesRes.error,
    client: c ? { id: c.id, name: c.name?.trim() || "Untitled client" } : null,
    pillar,
    stage,
    guide,
    other,
    template: templates[stage],
    runs,
    videos,
  };
}

/** Guide progress for each video (latest run per section), for the client dashboard. */
export async function guideProgress(
  supabase: QueryableClient,
  videoIds: string[]
): Promise<Map<string, Partial<Record<GuideStage, { done: number; total: number }>>>> {
  const out = new Map<string, Partial<Record<GuideStage, { done: number; total: number }>>>();
  if (!videoIds.length) return out;
  const { data, error } = await supabase
    .from("guide_runs")
    .select("video_id, done_steps, started_at, pillar_guides(stage, steps)")
    .in("video_id", videoIds)
    .order("started_at", { ascending: false });
  if (error) return out;
  for (const r of (data ?? []) as { video_id: string; done_steps: string[]; pillar_guides: { stage: GuideStage; steps: GuideStep[] } | null }[]) {
    const g = r.pillar_guides;
    if (!g) continue;
    const entry = out.get(r.video_id) ?? {};
    if (entry[g.stage]) continue; // latest run wins
    const ids = new Set(g.steps.map((s) => s.id));
    entry[g.stage] = { done: r.done_steps.filter((d) => ids.has(d)).length, total: g.steps.length };
    out.set(r.video_id, entry);
  }
  return out;
}

/** Lines of text to steps, keeping the id of any step whose wording didn't change. */
export function linesToSteps(text: string, existing: GuideStep[], newId: () => string): GuideStep[] {
  const pool = [...existing];
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 60)
    .map((line) => {
      const i = pool.findIndex((s) => s.text === line);
      if (i >= 0) return pool.splice(i, 1)[0];
      return { id: newId(), text: line.slice(0, 300) };
    });
}
