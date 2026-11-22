import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { budgetUse } from "@/lib/ai-usage";
import { isSocialPlatform, type SocialPlatform } from "@/lib/social";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * What only the team sees on a client's Performance tab: readings the
 * safety checks held back (with the screenshot the AI read), the state
 * of the latest refresh, and how much of the month's AI budget is used
 * (as a percentage only; amounts are on the Finance tab).
 *
 * Call only for someone already allowed to see this client.
 */

export interface ReviewItem {
  id: string;
  platform: SocialPlatform;
  kind: "profile" | "post";
  status: "flagged" | "failed";
  takenAt: string;
  url: string;
  problem: string | null;
  followers: number | null;
  stats: { name: string; label: string; text: string; value: number | null; abbreviated: boolean; confidence: number }[];
  screenshot: string | null;
}

export interface RunInfo {
  id: string;
  trigger: "schedule" | "manual";
  status: "queued" | "running" | "done" | "failed" | "skipped";
  createdAt: string;
  finishedAt: string | null;
  reads: number;
  failures: number;
  note: string | null;
}

export interface TeamSide {
  review: ReviewItem[];
  failedPosts: number;
  lastRun: RunInfo | null;
  refreshReady: boolean;
  /** Share of this month's AI budget used (0.82 = 82%), or null. */
  budget: number | null;
}

export async function loadTeamSide(supabase: Db, clientId: string): Promise<TeamSide> {
  const [{ data: readings }, { data: runs }, budget] = await Promise.all([
    supabase
      .from("social_readings")
      .select("id, platform, kind, status, taken_at, url, problem, followers, stats, screenshot_path, run_id")
      .eq("client_id", clientId)
      .order("taken_at", { ascending: false })
      .limit(200),
    supabase
      .from("scrape_runs")
      .select("id, trigger, status, created_at, finished_at, reads, failures, note, client_id")
      .or(`client_id.eq.${clientId},client_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(1),
    budgetUse().catch(() => null),
  ]);

  type Row = { id: string; platform: string; kind: "profile" | "post"; status: string; taken_at: string; url: string; problem: string | null; followers: number | null; stats: ReviewItem["stats"]; screenshot_path: string | null; run_id: string | null };
  const rows = (readings ?? []) as Row[];

  // The latest profile reading per platform, if it's waiting for a decision or failed.
  const seen = new Set<string>();
  const held: Row[] = [];
  for (const r of rows) {
    if (r.kind !== "profile" || seen.has(r.platform)) continue;
    seen.add(r.platform);
    if (r.status === "flagged" || r.status === "failed") held.push(r);
  }
  // Older flagged readings nobody has decided on yet, too.
  for (const r of rows) if (r.status === "flagged" && !held.includes(r)) held.push(r);

  // Post reads that failed in the most recent run with any.
  const lastRunId = rows.find((r) => r.run_id)?.run_id ?? null;
  const failedPosts = rows.filter((r) => r.kind === "post" && r.status === "failed" && r.run_id === lastRunId).length;

  // Screenshots are private: a link that works for an hour.
  const paths = held.map((r) => r.screenshot_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    try {
      const { data } = await createAdminClient().storage.from("social-shots").createSignedUrls(paths, 3600);
      for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
    } catch {
      // No pictures; the readings still show.
    }
  }

  const run = (runs ?? [])[0] as { id: string; trigger: RunInfo["trigger"]; status: RunInfo["status"]; created_at: string; finished_at: string | null; reads: number; failures: number; note: string | null } | undefined;
  return {
    review: held
      .filter((r) => isSocialPlatform(r.platform))
      .map((r) => ({
        id: r.id,
        platform: r.platform as SocialPlatform,
        kind: r.kind,
        status: r.status as ReviewItem["status"],
        takenAt: r.taken_at,
        url: r.url,
        problem: r.problem,
        followers: r.followers,
        stats: Array.isArray(r.stats) ? r.stats : [],
        screenshot: r.screenshot_path ? signed.get(r.screenshot_path) ?? null : null,
      })),
    failedPosts,
    lastRun: run
      ? { id: run.id, trigger: run.trigger, status: run.status, createdAt: run.created_at, finishedAt: run.finished_at, reads: run.reads, failures: run.failures, note: run.note }
      : null,
    refreshReady: !!process.env.GITHUB_ACTIONS_TOKEN?.trim(),
    budget,
  };
}
