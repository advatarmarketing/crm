"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { packageFromRow } from "@/lib/packages";
import { cycleDates, daysBetween, pillarSequence, type ContentVideo, type VideoCycle } from "@/lib/videos";
import { linkFromPaste } from "@/lib/video-links";

/**
 * Writes to the video schedule (0042). As everywhere else, the
 * caller's own session does the writing, so RLS decides: management on
 * their clients and assigned staff can change a schedule; videographers
 * and clients cannot, and get an error rather than a silent nothing.
 */

export interface VideoResult {
  error: string | null;
}

const TEXT_LIMITS: Record<string, number> = {
  title: 200,
  pillar: 80,
  video_type: 60,
  description: 4000,
  hook: 2000,
  body: 8000,
  cta: 2000,
  wms: 200,
  scenery: 200,
  video_set: 80,
};

export type VideoTextField = keyof typeof TEXT_LIMITS;

function friendly(message: string, code?: string): string {
  if (code === "42P01" || code === "PGRST205" || (/content_videos/.test(message) && /does not exist|could not find/i.test(message))) {
    return "The video schedule isn’t switched on yet — database update 0042 still needs running.";
  }
  if (/row-level security|violates row-level/i.test(message)) {
    return "You can’t change this client’s schedule.";
  }
  return message;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh(clientId?: string) {
  if (clientId) revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/calendar");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/my-dashboard");
}

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Rows written must come back, or RLS quietly filtered the write. */
function wrote(data: unknown): boolean {
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

function cyclesMissing(message: string, code?: string): boolean {
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204" || /content_cycles|cycle_id|position/.test(message);
}

const NEEDS_0045 = "Months aren’t switched on yet: database update 0045 still needs running.";

async function nextPosition(supabase: ReturnType<typeof createClient>, cycleId: string): Promise<number> {
  const { data } = await supabase
    .from("content_videos")
    .select("position")
    .eq("cycle_id", cycleId)
    .order("position", { ascending: false, nullsFirst: false })
    .limit(1);
  return (((data ?? []) as { position: number | null }[])[0]?.position ?? 0) + 1;
}

/**
 * Starts the client's next month: "Month N" with its own start and
 * expected end date, holding `count` videos numbered from 1. Dates
 * come from the package's posting days and pillars from the content
 * plan; both can be changed on each video afterwards.
 */
export async function createCycleAction(
  clientId: string,
  startsOn: string,
  endsOn: string,
  count: number
): Promise<VideoResult & { cycle?: VideoCycle }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  if (!DATE.test(startsOn) || !DATE.test(endsOn)) return { error: "Choose a start and an end date." };
  if (endsOn < startsOn) return { error: "The end date is before the start date." };
  if (daysBetween(startsOn, endsOn) > 366) return { error: "A month can’t be longer than a year." };
  const total = Math.floor(Number(count));
  if (!Number.isFinite(total) || total < 0 || total > 120) return { error: "Choose between 0 and 120 videos." };

  const { data: last, error: lastError } = await supabase
    .from("content_cycles")
    .select("number")
    .eq("client_id", clientId)
    .order("number", { ascending: false })
    .limit(1);
  if (lastError) return { error: cyclesMissing(lastError.message, lastError.code) ? NEEDS_0045 : lastError.message };
  const number = (((last ?? []) as { number: number }[])[0]?.number ?? 0) + 1;

  const { data: made, error } = await supabase
    .from("content_cycles")
    .insert({ client_id: clientId, number, starts_on: startsOn, ends_on: endsOn, created_by: user.id, updated_by: user.id } as never)
    .select("id, client_id, number, starts_on, ends_on")
    .single();
  if (error || !made) return { error: friendly(error?.message ?? "violates row-level security", error?.code) };
  const cycle = made as VideoCycle;

  if (total > 0) {
    const { data: pkgRow } = await supabase.from("client_packages").select("*").eq("client_id", clientId).maybeSingle();
    const pkg = pkgRow ? packageFromRow(pkgRow as Record<string, unknown>) : null;
    const { data: planner } = await supabase.from("planners").select("content").eq("client_id", clientId).maybeSingle();
    const items = ((planner as { content?: { pillars?: { items?: { name?: string; pct?: number }[] } } } | null)?.content
      ?.pillars?.items ?? []) as { name?: string; pct?: number }[];
    const pillars = pillarSequence(
      items.map((p) => ({ name: String(p.name ?? ""), pct: Number(p.pct ?? 0) })),
      total
    );
    const rows = cycleDates(pkg, startsOn, endsOn, total).map((d, i) => ({
      client_id: clientId,
      cycle_id: cycle.id,
      position: i + 1,
      publish_on: d.date,
      day_order: d.day_order,
      pillar: pillars[i],
      created_by: user.id,
      updated_by: user.id,
    }));
    const { error: vError } = await supabase.from("content_videos").insert(rows as never);
    if (vError) return { error: `Month ${number} was started, but its videos couldn’t be added: ${friendly(vError.message, vError.code)}`, cycle };
  }

  await logActivity(supabase, {
    clientId,
    kind: "videos_scheduled",
    summary: `Month ${number} started with ${total} video${total === 1 ? "" : "s"}`,
    actorId: user.id,
  });
  refresh(clientId);
  return { error: null, cycle };
}

export async function updateCycleAction(id: string, startsOn: string, endsOn: string): Promise<VideoResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  if (!DATE.test(startsOn) || !DATE.test(endsOn)) return { error: "That date isn’t valid." };
  if (endsOn < startsOn) return { error: "The end date is before the start date." };
  const { data, error } = await supabase
    .from("content_cycles")
    .update({ starts_on: startsOn, ends_on: endsOn, updated_by: user.id } as never)
    .eq("id", id)
    .select("client_id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("violates row-level security") };
  refresh((data as { client_id: string }[])[0]?.client_id);
  return { error: null };
}

/** Only an empty month can be removed; videos are removed one by one, on purpose. */
export async function deleteCycleAction(id: string): Promise<VideoResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { data: inside } = await supabase.from("content_videos").select("id").eq("cycle_id", id).limit(1);
  if (((inside ?? []) as unknown[]).length > 0) return { error: "Remove or move this month’s videos first." };
  const { data, error } = await supabase.from("content_cycles").delete().eq("id", id).select("client_id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("violates row-level security") };
  refresh((data as { client_id: string }[])[0]?.client_id);
  return { error: null };
}

export async function addVideoAction(
  clientId: string,
  publishOn: string | null,
  cycleId: string | null = null
): Promise<VideoResult & { video?: ContentVideo }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  if (publishOn && !/^\d{4}-\d{2}-\d{2}$/.test(publishOn)) return { error: "That date isn’t valid." };

  const row: Record<string, unknown> = { client_id: clientId, publish_on: publishOn, created_by: user.id, updated_by: user.id };
  if (cycleId) {
    row.cycle_id = cycleId;
    row.position = await nextPosition(supabase, cycleId);
  }

  const { data, error } = await supabase
    .from("content_videos")
    .insert(row as never)
    .select("*")
    .single();
  if (error || !data) return { error: friendly(error?.message ?? "Could not add a video.", error?.code) };

  refresh(clientId);
  return { error: null, video: data as ContentVideo };
}

export async function updateVideoAction(
  id: string,
  patch: Partial<Record<VideoTextField, string | null>> & {
    publish_on?: string | null;
    submission_id?: string | null;
    /** Moves the video to the end of another month. */
    cycle_id?: string | null;
  }
): Promise<VideoResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };

  const row: Record<string, unknown> = { updated_by: user.id };
  for (const [key, value] of Object.entries(patch)) {
    if (key in TEXT_LIMITS) {
      const text = (value ?? "").toString().trim();
      row[key] = text ? text.slice(0, TEXT_LIMITS[key]) : null;
    } else if (key === "publish_on") {
      if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return { error: "That date isn’t valid." };
      row.publish_on = value;
    } else if (key === "submission_id") {
      row.submission_id = value || null;
    } else if (key === "cycle_id") {
      row.cycle_id = value || null;
      row.position = value ? await nextPosition(supabase, String(value)) : null;
    }
  }

  const { data, error } = await supabase.from("content_videos").update(row as never).eq("id", id).select("client_id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("violates row-level security") };

  refresh((data as { client_id: string }[])[0]?.client_id);
  return { error: null };
}

/** Drag-and-drop on the calendar lands here. */
export async function moveVideoAction(id: string, publishOn: string): Promise<VideoResult> {
  return updateVideoAction(id, { publish_on: publishOn });
}

export async function setPostedAction(id: string, posted: boolean): Promise<VideoResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase
    .from("content_videos")
    .update({ posted_at: posted ? new Date().toISOString() : null, updated_by: user.id } as never)
    .eq("id", id)
    .select("client_id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("violates row-level security") };
  refresh((data as { client_id: string }[])[0]?.client_id);
  return { error: null };
}

export async function deleteVideoAction(id: string): Promise<VideoResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase.from("content_videos").delete().eq("id", id).select("client_id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("violates row-level security") };
  refresh((data as { client_id: string }[])[0]?.client_id);
  return { error: null };
}

/**
 * The calendar's drag-and-drop. Same write as moveVideoAction, shaped
 * the way MonthCalendar wants it: an error message, or null.
 */
export async function moveVideoOnCalendar(id: string, date: string): Promise<string | null> {
  const res = await updateVideoAction(id, { publish_on: date });
  return res.error;
}

/**
 * The "add the video link" button. The first link makes the upload
 * this video is delivered through; every later one is a new version of
 * it, which clears the client's last verdict and, if they can already
 * see it, tells them a new cut is ready (0042's trigger).
 *
 * Takes a plain link or a pasted embed code.
 */
export async function setVideoLinkAction(videoId: string, pasted: string, label: string): Promise<VideoResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const url = linkFromPaste(pasted);
  if (!url) return { error: "That doesn’t look like a link. Paste the video’s link, or its embed code." };
  if (url.length > 1000) return { error: "That link is too long." };

  const { data: video, error: vError } = await supabase
    .from("content_videos")
    .select("id, client_id, title, submission_id")
    .eq("id", videoId)
    .maybeSingle();
  if (vError) return { error: friendly(vError.message, vError.code) };
  if (!video) return { error: "That video isn’t there any more." };
  const v = video as { id: string; client_id: string; title: string | null; submission_id: string | null };

  let submissionId = v.submission_id;
  let version = 1;
  if (submissionId) {
    const { data: sub } = await supabase.from("submissions").select("current_version").eq("id", submissionId).maybeSingle();
    if (!sub) submissionId = null;
    else version = ((sub as { current_version: number }).current_version ?? 0) + 1;
  }

  if (!submissionId) {
    const title = (v.title?.trim() || label.trim() || "Video").slice(0, 200);
    const { data: created, error } = await supabase
      .from("submissions")
      .insert({ title, client_id: v.client_id, created_by: user.id, status: "submitted", visibility: "team_only" } as never)
      .select("id")
      .single();
    if (error || !created) return { error: friendly(error?.message ?? "violates row-level security", error?.code) };
    submissionId = (created as { id: string }).id;
  }

  const { error: versionError } = await supabase
    .from("submission_versions")
    .insert({ submission_id: submissionId, version, url, submitted_by: user.id } as never);
  if (versionError) return { error: `The link didn’t save: ${friendly(versionError.message, versionError.code)}` };

  if (submissionId !== v.submission_id) {
    const { data: linked, error } = await supabase
      .from("content_videos")
      .update({ submission_id: submissionId, updated_by: user.id } as never)
      .eq("id", v.id)
      .select("id");
    if (error || !wrote(linked)) return { error: friendly(error?.message ?? "violates row-level security", error?.code) };
  }

  refresh(v.client_id);
  revalidatePath("/app/uploads");
  revalidatePath("/app/portal/videos");
  return { error: null };
}

/**
 * Lets the client watch it (and approve or ask for changes, if their
 * package has a review step). The database tells them it is ready.
 */
export async function sendVideoToClientAction(submissionId: string, share: boolean): Promise<VideoResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase
    .from("submissions")
    .update({ visibility: share ? "team_and_client" : "team_only" } as never)
    .eq("id", submissionId)
    .select("client_id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: "You can’t share this video." };
  refresh((data as { client_id: string }[])[0]?.client_id);
  revalidatePath("/app/portal/videos");
  revalidatePath("/app/portal");
  return { error: null };
}
