import { addDays, loadVideos, todayKey, videoLabel, videoStage, type ContentVideo } from "@/lib/videos";
import { meter, mondayOf, stepDue, targetDate, latestDate, videoHealth, type Health, type Meter, type StepId } from "@/lib/deadlines";
import { loadNamesById } from "@/lib/people";
import { withTaskPriorities } from "@/lib/tasks";
import type { TodoEntry } from "@/components/TodoPanel";
import { guideProgress, type GuideStage } from "@/lib/guides";

/**
 * Everything the client's Dashboard tab shows (0053): the video steps
 * and hand-added to-dos for this client, when each video must be ready,
 * and the "weeks ahead" meter. Also the per-client meters on the front
 * dashboards.
 *
 * Never throws. Before 0053 runs the steps don't exist: the to-dos and
 * the meter still work, worked out from the videos' own stages.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export interface StepState {
  taskId: string | null;
  done: boolean;
  due: string;
}

export interface WorkVideo {
  id: string;
  publish: string;
  label: string;
  pillar: string | null;
  steps: Record<StepId, StepState>;
  finished: boolean;
  health: Health | "done";
  target: string;
  latest: string;
  hasScript: boolean;
  /** 0054: how far through its Filming / Editing guide the latest checklist is. */
  guide: Partial<Record<GuideStage, { done: number; total: number }>>;
}

export interface ClientWork {
  /** False before 0053: no automatic video steps yet. */
  stepsAvailable: boolean;
  meter: Meter;
  /** Unfinished videos already past, then the next five weeks. */
  videos: WorkVideo[];
  /** Overdue, due this week, or no date. */
  now: TodoEntry[];
  /** Due in the four weeks after this one. */
  upcoming: TodoEntry[];
  priorityAvailable: boolean;
}

type TaskRow = TodoEntry & { video_id?: string | null; step?: StepId | null };

const AHEAD_DAYS = 35;
const LOOK_BACK_DAYS = 30;

export async function loadClientWork(supabase: QueryableClient, clientId: string, today = todayKey()): Promise<ClientWork> {
  const [{ videos, uploads }, taskRes, names] = await Promise.all([
    loadVideos(supabase, { clientId, from: addDays(today, -LOOK_BACK_DAYS), to: addDays(today, AHEAD_DAYS + 7) }),
    loadTasks(supabase, clientId),
    loadNamesById(supabase).catch(() => new Map<string, string | null>()),
  ]);

  const rows = taskRes.rows.map((t) => ({ ...t, personName: t.assigned_to ? names.get(t.assigned_to) ?? null : null }));
  const byVideo = new Map<string, Map<StepId, TaskRow>>();
  for (const t of rows) {
    if (!t.video_id || !t.step) continue;
    if (!byVideo.has(t.video_id)) byVideo.set(t.video_id, new Map());
    byVideo.get(t.video_id)!.set(t.step, t);
  }

  const work: WorkVideo[] = (videos as ContentVideo[])
    .filter((v) => v.publish_on)
    .map((v) => {
      const publish = v.publish_on!;
      const stage = videoStage(v, v.submission_id ? uploads.get(v.submission_id) : null);
      const made = stage !== "planned";
      const shared = stage === "ready" || stage === "approved" || stage === "changes" || stage === "posted";
      const tasks = byVideo.get(v.id);
      const step = (id: StepId, derived: boolean): StepState => {
        const t = tasks?.get(id);
        return { taskId: t?.id ?? null, done: Boolean(t?.done) || derived, due: t?.due_date ?? stepDue(publish, id) };
      };
      const steps: Record<StepId, StepState> = {
        film: step("film", made),
        edit: step("edit", made),
        submit: step("submit", shared),
        post: step("post", stage === "posted"),
      };
      const finished = steps.submit.done || steps.post.done;
      return {
        id: v.id,
        publish,
        label: videoLabel(v),
        pillar: v.pillar,
        steps,
        finished,
        health: videoHealth(publish, finished, today),
        target: targetDate(publish),
        latest: latestDate(publish),
        hasScript: Boolean(v.hook?.trim() || v.body?.trim()),
        guide: {},
      };
    });

  const shown = work.filter((v) => (v.publish >= today && v.publish <= addDays(today, AHEAD_DAYS)) || (v.publish < today && !v.steps.post.done));
  const progress = await guideProgress(supabase, shown.map((v) => v.id)).catch(() => new Map());
  for (const v of shown) v.guide = progress.get(v.id) ?? {};

  // Sunday of this week: "this week" ends there.
  const weekEnd = addDays(mondayOf(today), 6);
  const horizon = addDays(weekEnd, 28);
  const open = rows.filter((t) => !t.done);
  const { tasks: prioritised, priorityAvailable } = await withTaskPriorities<TodoEntry>(supabase, open);
  const now = prioritised.filter((t) => !t.due_date || t.due_date <= weekEnd);
  const upcoming = prioritised.filter((t) => t.due_date && t.due_date > weekEnd && t.due_date <= horizon);

  return {
    stepsAvailable: taskRes.stepsAvailable,
    meter: meter(work.map((v) => ({ publish: v.publish, finished: v.finished })), today),
    videos: shown,
    now,
    upcoming,
    priorityAvailable,
  };
}

async function loadTasks(supabase: QueryableClient, clientId: string): Promise<{ rows: TaskRow[]; stepsAvailable: boolean }> {
  const base = "id, text, due_date, done, client_id, assigned_to";
  const res = await supabase.from("tasks").select(`${base}, video_id, step`).eq("client_id", clientId).order("due_date", { ascending: true, nullsFirst: false });
  if (!res.error) return { rows: (res.data ?? []) as TaskRow[], stepsAvailable: true };
  const old = await supabase.from("tasks").select(base).eq("client_id", clientId).order("due_date", { ascending: true, nullsFirst: false });
  return { rows: (old.data ?? []) as TaskRow[], stepsAvailable: false };
}

export interface ClientMeterRow {
  clientId: string;
  name: string;
  internal: boolean;
  meter: Meter;
}

/**
 * The meter for each of the caller's clients, for the front dashboards.
 * RLS decides which clients come back (a videographer gets theirs).
 */
export async function loadClientMeters(supabase: QueryableClient, today = todayKey()): Promise<ClientMeterRow[]> {
  const [{ videos, uploads, available }, clientsRes] = await Promise.all([
    loadVideos(supabase, { from: today, to: addDays(today, AHEAD_DAYS + 7) }),
    supabase.from("clients").select("*"),
  ]);
  if (!available) return [];
  const steps = await supabase.from("tasks").select("video_id, step, done").not("video_id", "is", null).in("step", ["submit", "post"]).eq("done", true);
  const doneVideos = new Set<string>(((steps.error ? [] : steps.data) ?? []).map((s: { video_id: string }) => s.video_id));

  const clients = ((clientsRes.data ?? []) as { id: string; name: string | null; stage?: string | null; internal_kind?: string | null }[]).filter(
    (c) => c.stage === "active" || c.internal_kind
  );
  const perClient = new Map<string, { publish: string; finished: boolean }[]>();
  for (const v of videos) {
    if (!v.publish_on) continue;
    const stage = videoStage(v, v.submission_id ? uploads.get(v.submission_id) : null);
    const finished = doneVideos.has(v.id) || ["ready", "approved", "changes", "posted"].includes(stage);
    if (!perClient.has(v.client_id)) perClient.set(v.client_id, []);
    perClient.get(v.client_id)!.push({ publish: v.publish_on, finished });
  }
  return clients
    .filter((c) => perClient.has(c.id))
    .map((c) => ({ clientId: c.id, name: c.name?.trim() || "Untitled client", internal: Boolean(c.internal_kind), meter: meter(perClient.get(c.id)!, today) }))
    .sort((a, b) => rank(a.meter.health) - rank(b.meter.health) || a.meter.weeksAhead - b.meter.weeksAhead);
}

function rank(h: Health): number {
  return h === "late" ? 0 : h === "behind" ? 1 : h === "on-target" ? 2 : 3;
}
