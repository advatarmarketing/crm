"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { METRICS, POST_COLUMNS, detectPlatform, loadPerformance, summarise, PLATFORMS, type Numbers, type PlatformId, type VideoPost } from "@/lib/performance";
import { youtubeId, youtubeNumbers, youtubeOn } from "@/lib/performance/youtube";
import { readScreenshot, readerOn, writeAnalysis, type ReportContent } from "@/lib/performance/read";
import { linkFromPaste } from "@/lib/video-links";

/**
 * Post links, their numbers, and reports (0046). Everything is written
 * as the signed-in person, so the database decides who may: management
 * and assigned staff. Videographers and clients can only read.
 */

export interface PerfResult {
  error: string | null;
}

function friendly(message: string, code?: string): string {
  if (code === "42P01" || code === "PGRST205" || /video_posts|performance_reports/.test(message) && /does not exist|could not find/i.test(message)) {
    return "Performance isn’t switched on yet: database update 0046 still needs running.";
  }
  if (code === "23505") return "This video already has a link for that platform. Remove it first to change it.";
  if (/row-level security/i.test(message)) return "You can’t change this client’s results.";
  return message;
}

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const wrote = (data: unknown) => (Array.isArray(data) ? data.length > 0 : Boolean(data));

/** What is connected, so the screen only offers what will work. */
export async function metricsSetupAction(): Promise<{ screenshots: boolean; youtube: boolean }> {
  return { screenshots: readerOn(), youtube: youtubeOn() };
}

export async function addPostAction(videoId: string, pasted: string, platform: PlatformId | null): Promise<PerfResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const url = linkFromPaste(pasted);
  if (!url) return { error: "That doesn’t look like a link. Paste the post’s link." };
  if (url.length > 1000) return { error: "That link is too long." };
  const where = platform && PLATFORMS.some((p) => p.id === platform) ? platform : detectPlatform(url);

  const { data: video } = await supabase.from("content_videos").select("client_id").eq("id", videoId).maybeSingle();
  const clientId = (video as { client_id: string } | null)?.client_id;
  if (!clientId) return { error: "That video isn’t there any more." };

  const { data, error } = await supabase
    .from("video_posts")
    .insert({ video_id: videoId, client_id: clientId, platform: where, url, created_by: user.id, updated_by: user.id } as never)
    .select("id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("row-level security") };
  revalidatePath(`/app/clients/${clientId}`);
  return { error: null };
}

export async function removePostAction(postId: string): Promise<PerfResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase.from("video_posts").delete().eq("id", postId).select("client_id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("row-level security") };
  return { error: null };
}

function clean(numbers: Partial<Numbers>): Partial<Numbers> | null {
  const out: Partial<Numbers> = {};
  for (const m of METRICS) {
    if (!(m in numbers)) continue;
    const v = numbers[m];
    if (v === null || v === undefined) out[m] = null;
    else if (!Number.isFinite(v) || v < 0 || v > 1e12) return null;
    else out[m] = Math.round(v);
  }
  return out;
}

async function saveNumbers(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  postId: string,
  numbers: Partial<Numbers>,
  source: "typed" | "screenshot" | "youtube"
): Promise<PerfResult & { post?: VideoPost }> {
  const row = clean(numbers);
  if (!row) return { error: "Numbers can’t be negative." };
  const { data, error } = await supabase
    .from("video_posts")
    .update({ ...row, metrics_at: new Date().toISOString(), metrics_source: source, updated_by: userId } as never)
    .eq("id", postId)
    .select(POST_COLUMNS);
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("row-level security") };
  return { error: null, post: (data as VideoPost[])[0] };
}

/** Typed by hand. Only the fields sent are changed. */
export async function savePostNumbersAction(postId: string, numbers: Partial<Numbers>): Promise<PerfResult & { post?: VideoPost }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  return saveNumbers(supabase, user.id, postId, numbers, "typed");
}

/**
 * Reads a screenshot of the post's numbers and saves what it shows.
 * Numbers that are not on the screenshot are left as they were.
 * `image` is base64 without a data: prefix; the browser shrinks it
 * first, so it is well under the request limit.
 */
export async function readPostScreenshotAction(
  postId: string,
  image: string,
  mediaType: string
): Promise<PerfResult & { post?: VideoPost; read?: Numbers; note?: string | null }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  if (!image || image.length > 3_500_000) return { error: "That image is too large. Crop it to the post’s numbers and try again." };

  // Read as the caller first: nobody gets a screenshot read against a
  // post they cannot see.
  const { data: post } = await supabase.from("video_posts").select("id, platform").eq("id", postId).maybeSingle();
  if (!post) return { error: "That post isn’t there any more." };

  const result = await readScreenshot(image, mediaType, (post as { platform: string }).platform);
  if (!result.ok) return { error: result.error };

  const found: Partial<Numbers> = {};
  for (const m of METRICS) if (result.numbers[m] !== null) found[m] = result.numbers[m];
  const saved = await saveNumbers(supabase, user.id, postId, found, "screenshot");
  if (saved.error) return { error: saved.error };
  return { error: null, post: saved.post, read: result.numbers, note: result.note };
}

async function refreshYoutube(supabase: ReturnType<typeof createClient>, userId: string, posts: { id: string; url: string }[]) {
  const withId = posts.map((p) => ({ ...p, yt: youtubeId(p.url) })).filter((p): p is { id: string; url: string; yt: string } => Boolean(p.yt));
  if (withId.length === 0) return { updated: 0, notFound: 0, error: null as string | null };
  const res = await youtubeNumbers(withId.map((p) => p.yt));
  if (!res.ok) return { updated: 0, notFound: 0, error: res.error };
  let updated = 0;
  let notFound = 0;
  for (const p of withId) {
    const n = res.byId.get(p.yt);
    if (!n) {
      notFound++;
      continue;
    }
    const numbers: Partial<Numbers> = {};
    if (n.views !== null) numbers.views = n.views;
    if (n.likes !== null) numbers.likes = n.likes;
    if (n.comments !== null) numbers.comments = n.comments;
    const saved = await saveNumbers(supabase, userId, p.id, numbers, "youtube");
    if (!saved.error) updated++;
  }
  return { updated, notFound, error: null as string | null };
}

export async function fetchYoutubePostAction(postId: string): Promise<PerfResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { data: post } = await supabase.from("video_posts").select("id, url").eq("id", postId).maybeSingle();
  if (!post) return { error: "That post isn’t there any more." };
  const res = await refreshYoutube(supabase, user.id, [post as { id: string; url: string }]);
  if (res.error) return { error: res.error };
  if (res.notFound) return { error: "YouTube has no public video at that link. Check it, or type the numbers in." };
  if (!res.updated) return { error: "That isn’t a YouTube video link." };
  return { error: null };
}

export interface GatherResult extends PerfResult {
  /** YouTube links refreshed just now. */
  youtubeUpdated: number;
  /** YouTube links there, but no key to fetch them with. */
  youtubeWaiting: number;
  youtubeProblem: string | null;
}

/**
 * "Gather all metrics": refreshes everything that can be fetched
 * (YouTube). What cannot be fetched is listed on the screen from the
 * saved data, so the team sees exactly which videos still need a link
 * or a screenshot.
 */
export async function gatherMetricsAction(clientId: string): Promise<GatherResult> {
  const { supabase, user } = await signedIn();
  const none = { youtubeUpdated: 0, youtubeWaiting: 0, youtubeProblem: null };
  if (!user) return { error: "Not signed in.", ...none };
  const { data, error } = await supabase.from("video_posts").select("id, url").eq("client_id", clientId).eq("platform", "youtube");
  if (error) return { error: friendly(error.message, error.code), ...none };
  const posts = (data ?? []) as { id: string; url: string }[];
  if (posts.length === 0) return { error: null, ...none };
  if (!youtubeOn()) return { error: null, ...none, youtubeWaiting: posts.length };
  const res = await refreshYoutube(supabase, user.id, posts);
  return { error: null, youtubeUpdated: res.updated, youtubeWaiting: 0, youtubeProblem: res.error ?? (res.notFound ? `${res.notFound} YouTube link${res.notFound === 1 ? " isn’t" : "s aren’t"} public videos, so ${res.notFound === 1 ? "it" : "they"} couldn’t be fetched.` : null) };
}

/** Works the numbers out again on the server, writes them up, and saves the report. */
export async function createReportAction(
  clientId: string,
  from: string | null,
  to: string | null,
  range: string
): Promise<PerfResult & { id?: string; problem?: string | null }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return { error: "Those dates aren’t valid." };
  const label = range.trim().slice(0, 80) || "All time";

  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
  const clientName = (client as { name: string } | null)?.name;
  if (!clientName) return { error: "That client isn’t there." };

  const perf = await loadPerformance(supabase, clientId);
  if (!perf.available) return { error: friendly("video_posts does not exist") };
  const summary = summarise(perf.videos, from, to);
  if (summary.totals.videos === 0) return { error: "No videos in that time have numbers yet, so there is nothing to report on." };

  const { analysis, written, problem } = await writeAnalysis({ clientName, range: label, summary });
  const content: ReportContent = { clientName, range: label, from, to, madeAt: new Date().toISOString(), summary, analysis, written };

  const { data, error } = await supabase
    .from("performance_reports")
    .insert({ client_id: clientId, title: `${clientName}: ${label}`.slice(0, 200), range_from: from, range_to: to, content: content as never, created_by: user.id } as never)
    .select("id")
    .single();
  if (error || !data) return { error: friendly(error?.message ?? "row-level security", error?.code) };

  await logActivity(supabase, { clientId, kind: "report_created", summary: `Performance report made: ${label}`, actorId: user.id });
  revalidatePath(`/app/clients/${clientId}`);
  return { error: null, id: (data as { id: string }).id, problem };
}

export async function deleteReportAction(reportId: string): Promise<PerfResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase.from("performance_reports").delete().eq("id", reportId).select("client_id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!wrote(data)) return { error: friendly("row-level security") };
  return { error: null };
}
