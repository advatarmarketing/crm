"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiSettings, spendReport } from "@/lib/ai-usage";
import { SOCIAL_PLATFORMS, handleFromUrl, isSocialPlatform, profileUrl, type SocialPlatform, type SocialUrls } from "@/lib/social";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refresh(clientId: string) {
  revalidatePath("/app/portal/content");
  revalidatePath(`/app/clients/${clientId}`);
}

/**
 * Anyone on the team who works on this client (CEO, operations manager,
 * or staff assigned to them), checked by the database. Clients and
 * videographers can't.
 */
async function teamOn(clientId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const [{ data: profile }, { data: sees }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.rpc("can_see_client", { target_client_id: clientId }),
  ]);
  if (!["ceo", "operations_manager", "staff"].includes(profile?.role) || sees !== true) {
    return { ok: false, error: "Only the team working on this client can change this." };
  }
  return { ok: true, userId: user.id };
}

export interface SetupInput {
  platforms: string[];
  urls: Record<string, string>;
  /** Per platform: the follower count on the day we started, and that day. */
  baselines: Record<string, { followers: string; startedOn: string }>;
}

/**
 * "Accounts we manage" on the Performance tab: each platform's profile
 * link, and its starting point (followers and the day we started).
 */
export async function saveSocialSetupAction(clientId: string, input: SetupInput): Promise<Result & { urls?: SocialUrls }> {
  const who = await teamOn(clientId);
  if (!who.ok) return who;

  const urls: SocialUrls = {};
  for (const p of SOCIAL_PLATFORMS) {
    const typed = (input.urls[p.id] ?? "").trim();
    if (!typed) continue;
    const clean = profileUrl(p.id, typed);
    if (!clean) return { ok: false, error: `That doesn't look like a ${p.label} profile link. Paste the address of their profile.` };
    urls[p.id] = clean;
  }

  const baselines: { platform: SocialPlatform; followers: number | null; started_on: string }[] = [];
  for (const p of SOCIAL_PLATFORMS) {
    const b = input.baselines[p.id];
    const followersText = (b?.followers ?? "").replace(/[,\s]/g, "");
    const started = (b?.startedOn ?? "").trim();
    if (!followersText && !started) continue;
    if (followersText && !/^\d{1,12}$/.test(followersText)) return { ok: false, error: `${p.label}: the starting follower count should be a whole number, e.g. 1204.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(started)) return { ok: false, error: `${p.label}: add the date we started, as well as the follower count.` };
    if (started > new Date().toISOString().slice(0, 10)) return { ok: false, error: `${p.label}: the start date can't be in the future.` };
    baselines.push({ platform: p.id, followers: followersText ? Number(followersText) : null, started_on: started });
  }

  // A profile link means we post there.
  const platforms = Array.from(new Set([...input.platforms.filter(isSocialPlatform), ...(Object.keys(urls) as SocialPlatform[])]));
  const earliest = baselines.map((b) => b.started_on).sort()[0] ?? null;

  const admin = createAdminClient();
  const { data: before } = await admin.from("clients").select("social_urls").eq("id", clientId).maybeSingle();
  const old = (before?.social_urls ?? {}) as SocialUrls;

  const { error } = await admin.from("clients").update({ social_platforms: platforms, social_urls: urls, posting_started_on: earliest }).eq("id", clientId);
  if (error) return { ok: false, error: /social_|posting_started_on|check constraint/.test(error.message) ? "Run database update 0052 in Supabase first." : error.message };

  const { error: baseError } = await admin.from("social_baselines").delete().eq("client_id", clientId);
  if (baseError) return { ok: false, error: /social_baselines/.test(baseError.message) ? "Run database update 0052 in Supabase first." : baseError.message };
  if (baselines.length) {
    const { error: e2 } = await admin.from("social_baselines").insert(baselines.map((b) => ({ ...b, client_id: clientId, updated_by: who.userId })));
    if (e2) return { ok: false, error: e2.message };
  }

  // A link taken away, or changed to another account: that platform
  // starts afresh. Old readings stay in the history but no longer count,
  // because the dashboard only uses readings of the current link.
  for (const p of SOCIAL_PLATFORMS) {
    const was = old[p.id];
    const now = urls[p.id];
    const same = (a?: string) => (a ? handleFromUrl(p.id, a) ?? a.toLowerCase() : null);
    if (!was || same(was) === same(now)) continue;
    await admin.from("social_connections").delete().eq("client_id", clientId).eq("platform", p.id);
    await admin.from("social_posts").delete().eq("client_id", clientId).eq("platform", p.id);
  }

  refresh(clientId);
  return { ok: true, urls, message: "Saved. New links are read at 5pm, or press Refresh now." };
}

/**
 * Refresh now: starts the scraper on GitHub for this one client. It
 * takes a few minutes; the page shows its progress from scrape_runs.
 */
export async function refreshNowAction(clientId: string): Promise<Result> {
  const who = await teamOn(clientId);
  if (!who.ok) return who;

  const token = process.env.GITHUB_ACTIONS_TOKEN?.trim();
  if (!token) return { ok: false, error: "Refresh now isn't set up yet: add GITHUB_ACTIONS_TOKEN in Vercel. The daily 5pm update still runs." };

  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("social_urls").eq("id", clientId).maybeSingle();
  if (!client || !Object.values((client.social_urls ?? {}) as SocialUrls).some(Boolean)) return { ok: false, error: "Add a profile link first." };

  const [s, spend] = await Promise.all([aiSettings(), spendReport()]);
  if (s.monthly_budget_usd > 0 && spend && spend.month >= s.monthly_budget_usd) {
    return { ok: false, error: "Paused: this month's AI budget is used up. The CEO can raise it on the Finance tab." };
  }

  const { data: busy } = await admin
    .from("scrape_runs")
    .select("id, created_at")
    .in("status", ["queued", "running"])
    .or(`client_id.eq.${clientId},client_id.is.null`)
    .gte("created_at", new Date(Date.now() - 20 * 60_000).toISOString())
    .limit(1);
  if (busy?.length) return { ok: false, error: "A refresh is already running. It usually takes 3–5 minutes." };

  const { data: run, error } = await admin.from("scrape_runs").insert({ trigger: "manual", client_id: clientId, requested_by: who.userId, status: "queued" }).select("id").single();
  if (error || !run) return { ok: false, error: /scrape_runs/.test(error?.message ?? "") ? "Run database update 0052 in Supabase first." : error?.message ?? "Couldn't start." };

  const repo = process.env.GITHUB_REPOSITORY?.trim() || "advatarmarketing/crm";
  const api = process.env.GITHUB_API_URL?.trim() || "https://api.github.com";
  let problem: string | null = null;
  try {
    const res = await fetch(`${api}/repos/${repo}/actions/workflows/social-scraper.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: process.env.GITHUB_REF_NAME?.trim() || "main", inputs: { client_id: clientId, run_id: run.id } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) problem = "GitHub turned down the token. Check GITHUB_ACTIONS_TOKEN in Vercel (it needs Actions: read and write on this repository).";
    else if (res.status === 404) problem = "GitHub couldn't find the scraper. Check the token has access to this repository and the workflow file is on main.";
    else if (!res.ok) problem = `GitHub said no (${res.status}).`;
  } catch {
    problem = "Couldn't reach GitHub just now. Try again in a minute.";
  }
  if (problem) {
    await admin.from("scrape_runs").update({ status: "failed", finished_at: new Date().toISOString(), note: problem }).eq("id", run.id);
    return { ok: false, error: problem };
  }
  refresh(clientId);
  return { ok: true, message: "Started. New numbers usually appear in 3–5 minutes." };
}

/** Staff decide on a reading the safety checks held back. */
export async function reviewReadingAction(readingId: string, decision: "accept" | "reject"): Promise<Result> {
  const admin = createAdminClient();
  const { data: reading } = await admin.from("social_readings").select("id, client_id, platform, kind, status, taken_at").eq("id", readingId).maybeSingle();
  if (!reading) return { ok: false, error: "That reading isn't there any more." };
  const who = await teamOn(reading.client_id);
  if (!who.ok) return who;
  if (reading.status !== "flagged") return { ok: false, error: "Only flagged readings can be accepted or rejected." };

  const { error } = await admin
    .from("social_readings")
    .update({ status: decision === "accept" ? "ok" : "rejected", reviewed_by: who.userId, reviewed_at: new Date().toISOString() })
    .eq("id", readingId);
  if (error) return { ok: false, error: error.message };
  if (decision === "accept" && reading.kind === "profile") {
    await admin.from("social_connections").update({ last_synced_at: reading.taken_at, last_error: null }).eq("client_id", reading.client_id).eq("platform", reading.platform);
  } else if (decision === "reject") {
    await admin.from("social_connections").update({ last_error: null }).eq("client_id", reading.client_id).eq("platform", reading.platform);
  }
  refresh(reading.client_id);
  return { ok: true };
}
