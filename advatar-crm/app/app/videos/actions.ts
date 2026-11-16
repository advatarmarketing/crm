"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { packageFromRow } from "@/lib/packages";
import { monthBounds, pillarSequence, todayKey, videosToAdd, type ContentVideo } from "@/lib/videos";

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

/**
 * Fills one month with the videos the client's package implies, each
 * given a pillar from the content plan. Days already scheduled are
 * left alone; nothing is removed.
 */
export async function generateMonthAction(
  clientId: string,
  monthKey: string
): Promise<VideoResult & { added?: number }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(monthKey)) return { error: "Pick a month." };

  const { data: pkgRow, error: pkgError } = await supabase
    .from("client_packages")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (pkgError) {
    return {
      error: /client_packages/.test(pkgError.message)
        ? "Packages aren’t switched on yet — database update 0041 still needs running."
        : pkgError.message,
    };
  }
  if (!pkgRow) return { error: "Choose this client’s package first — the schedule is made from its posting days." };
  const pkg = packageFromRow(pkgRow as Record<string, unknown>);

  const bounds = monthBounds(monthKey.length === 7 ? `${monthKey}-01` : monthKey);
  // Never schedule into the past: filling the current month part-way
  // through starts from today, or every earlier posting day would
  // arrive already "late" for something nobody was ever asked to make.
  const today = todayKey();
  if (bounds.to < today) return { error: "That month has already gone — pick this month or a later one." };
  const from = bounds.from < today ? today : bounds.from;
  const to = bounds.to;

  const { data: existing, error: exError } = await supabase
    .from("content_videos")
    .select("publish_on")
    .eq("client_id", clientId)
    .gte("publish_on", from)
    .lte("publish_on", to);
  if (exError) return { error: friendly(exError.message, exError.code) };

  const adds = videosToAdd(pkg, from, to, (existing ?? []) as { publish_on: string | null }[]);
  if (adds.length === 0) return { error: null, added: 0 };

  // Pillars from the content plan, if there is one.
  const { data: planner } = await supabase.from("planners").select("content").eq("client_id", clientId).maybeSingle();
  const items = ((planner as { content?: { pillars?: { items?: { name?: string; pct?: number }[] } } } | null)?.content
    ?.pillars?.items ?? []) as { name?: string; pct?: number }[];
  const pillars = pillarSequence(
    items.map((p) => ({ name: String(p.name ?? ""), pct: Number(p.pct ?? 0) })),
    adds.length
  );

  const rows = adds.map((a, i) => ({
    client_id: clientId,
    publish_on: a.date,
    day_order: a.day_order,
    pillar: pillars[i],
    created_by: user.id,
    updated_by: user.id,
  }));

  const { data, error } = await supabase.from("content_videos").insert(rows as never).select("id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("violates row-level security") };

  await logActivity(supabase, {
    clientId,
    kind: "videos_scheduled",
    summary: `${rows.length} video${rows.length === 1 ? "" : "s"} scheduled for ${new Date(`${from}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`,
    actorId: user.id,
  });

  refresh(clientId);
  return { error: null, added: rows.length };
}

export async function addVideoAction(
  clientId: string,
  publishOn: string | null
): Promise<VideoResult & { video?: ContentVideo }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  if (publishOn && !/^\d{4}-\d{2}-\d{2}$/.test(publishOn)) return { error: "That date isn’t valid." };

  const { data, error } = await supabase
    .from("content_videos")
    .insert({ client_id: clientId, publish_on: publishOn, created_by: user.id, updated_by: user.id } as never)
    .select("*")
    .single();
  if (error || !data) return { error: friendly(error?.message ?? "Could not add a video.", error?.code) };

  refresh(clientId);
  return { error: null, video: data as ContentVideo };
}

export async function updateVideoAction(
  id: string,
  patch: Partial<Record<VideoTextField, string | null>> & { publish_on?: string | null; submission_id?: string | null }
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
