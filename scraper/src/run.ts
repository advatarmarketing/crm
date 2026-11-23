import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bodyText, clearPopups, gridViews, instagramLoggedIn, links, load, meta, newContext, nudge, openBrowser, pageState, shot } from "./browser.js";
import { LABEL, PLATFORMS, POSTS_READY, PROFILE_READY, countsFromSummary, embedPost, embedProfile, plausible, postFromLink, postedFromKey, postsPage, tiktokStats, xHandle, type Platform } from "./platforms.js";
import { parseCount } from "./numbers.js";
import { clean, pick, readScreenshot, type Clean } from "./read.js";
import { cost, db, londonMarks, money, monthSpend, settings, type Settings } from "./store.js";

/**
 * The social stats scraper. Run by GitHub Actions (.github/workflows/
 * social-scraper.yml):
 *   - every day, at 16:00 and 17:00 UTC; it only does anything when it's
 *     5pm (or a little after) in London, once a day, so it's right in
 *     both summer and winter time;
 *   - when someone presses Refresh now on a client (CLIENT_ID, RUN_ID).
 *
 * For each linked profile: open it logged out, screenshot it, Claude
 * reads the numbers, save a dated reading. Then the latest few posts the
 * same way. Every failure is recorded and the run moves on.
 */

const DAY = 86_400_000;
const CONCURRENT_CLIENTS = 3;
const LINKED_POSTS_PER_PLATFORM = 5;
const SHOTS_KEPT_DAYS = 14;
const BIG_JUMP = 0.2;
const LOW_CONFIDENCE = 0.6;

type Ctx = {
  sb: SupabaseClient;
  ai: Anthropic;
  s: Settings;
  runId: string;
  reads: number;
  failures: number;
  stopped: string | null;
};

interface ClientRow {
  id: string;
  name: string;
  social_urls: Partial<Record<Platform, string>> | null;
  social_platforms: string[] | null;
}

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const trigger = process.env.TRIGGER === "schedule" ? "schedule" : "manual";
  const onlyClient = process.env.CLIENT_ID?.trim() || null;
  const givenRun = process.env.RUN_ID?.trim() || null;
  const sb = db();
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY must be set (GitHub → Settings → Secrets and variables → Actions).");

  if (instagramLoggedIn()) log("Instagram: using the saved login.");
  const k = londonMarks();
  if (trigger === "schedule") {
    // Two daily triggers, one of which lands at 5pm London depending on
    // summer time; GitHub can start them a little late.
    if (k.hour < 17 || k.hour >= 23) return log(`It's ${k.hour}:00 in London, not 5pm. Nothing to do.`);
    const { data: today } = await sb
      .from("scrape_runs")
      .select("id")
      .eq("trigger", "schedule")
      .in("status", ["running", "done"])
      .gte("created_at", k.dayStart.toISOString())
      .limit(1);
    if (today?.length) return log("Today's 5pm run has already happened.");
  }

  let runId = givenRun;
  if (runId) {
    await sb.from("scrape_runs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", runId);
  } else {
    const { data, error } = await sb
      .from("scrape_runs")
      .insert({ trigger, client_id: onlyClient, status: "running", started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(`Couldn't record the run: ${error.message}`);
    runId = data.id as string;
  }

  const ctx: Ctx = { sb, ai: new Anthropic(), s: await settings(sb), runId: runId!, reads: 0, failures: 0, stopped: null };
  const finish = async (status: "done" | "failed" | "skipped", note: string | null) => {
    await sb.from("scrape_runs").update({ status, finished_at: new Date().toISOString(), reads: ctx.reads, failures: ctx.failures, note }).eq("id", ctx.runId);
    log(`Run ${status}: ${ctx.reads} reads, ${ctx.failures} failed.${note ? " " + note : ""}`);
    // What this run cost, from the same log the Finance tab uses.
    const { data: calls } = await sb.from("ai_usage").select("input_tokens, output_tokens, cost_usd").eq("run_id", ctx.runId);
    const rows = (calls ?? []) as { input_tokens: number; output_tokens: number; cost_usd: number }[];
    const sum = (k: "input_tokens" | "output_tokens" | "cost_usd") => rows.reduce((n, r) => n + Number(r[k] ?? 0), 0);
    log(`AI cost this run: ${money(ctx.s, sum("cost_usd"), 6)} for ${rows.length} call(s), ${sum("input_tokens")} input + ${sum("output_tokens")} output tokens.`);
  };

  if (await overBudget(ctx)) return finish("skipped", ctx.stopped);

  let q = sb.from("clients").select("id, name, social_urls, social_platforms");
  if (onlyClient) q = q.eq("id", onlyClient);
  const { data: rows, error } = await q;
  if (error) return finish("failed", `Couldn't load clients: ${error.message}`);
  const clients = ((rows ?? []) as ClientRow[]).filter((c) => targets(c).length > 0);
  log(`${clients.length} client(s) with profile links.`);

  const browser = await openBrowser();
  try {
    const queue = [...clients];
    const worker = async () => {
      const context = await newContext(browser);
      try {
        while (queue.length && !ctx.stopped) {
          const c = queue.shift()!;
          await doClient(ctx, context, c).catch((e) => log(`! ${c.name}: ${e instanceof Error ? e.message : e}`));
          if (await overBudget(ctx)) break;
        }
      } finally {
        await context.close().catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENT_CLIENTS, Math.max(1, clients.length)) }, worker));
  } finally {
    await browser.close().catch(() => {});
  }

  await cleanupShots(sb).catch((e) => log("! clean-up:", e instanceof Error ? e.message : e));
  await finish(ctx.stopped ? "skipped" : "done", ctx.stopped);
}

/** Pause for the month once the budget is used up (0 means no limit). */
async function overBudget(ctx: Ctx): Promise<boolean> {
  if (ctx.stopped) return true;
  const budget = ctx.s.monthly_budget_usd;
  if (!budget || budget <= 0) return false;
  const spent = await monthSpend(ctx.sb);
  if (spent >= budget) {
    ctx.stopped = `Paused: this month's AI budget (${money(ctx.s, budget, 2)}) is used up (${money(ctx.s, spent)} spent).`;
    log(ctx.stopped);
    return true;
  }
  return false;
}

function targets(c: ClientRow): { platform: Platform; url: string }[] {
  const urls = c.social_urls ?? {};
  const chosen = c.social_platforms ?? [];
  return PLATFORMS.filter((p) => urls[p] && (chosen.length === 0 || chosen.includes(p))).map((p) => ({ platform: p, url: urls[p]! }));
}

async function doClient(ctx: Ctx, context: BrowserContext, c: ClientRow) {
  log(`— ${c.name}`);
  const page = await context.newPage();
  try {
    for (const t of targets(c)) {
      if (ctx.stopped) break;
      await doPlatform(ctx, context, page, c, t.platform, t.url).catch(async (e) => {
        ctx.failures++;
        const problem = e instanceof Error ? e.message.slice(0, 300) : "Something went wrong.";
        log(`  ! ${LABEL[t.platform]}: ${problem}`);
        await ctx.sb.from("social_readings").insert({ run_id: ctx.runId, client_id: c.id, platform: t.platform, kind: "profile", url: t.url, status: "failed", problem });
      });
    }
  } finally {
    await page.close().catch(() => {});
  }
}

/** Save a screenshot for staff to check; deleted after 14 days. */
async function keepShot(ctx: Ctx, clientId: string, platform: Platform, kind: string, img: Buffer): Promise<string | null> {
  const path = `${clientId}/${new Date().toISOString().slice(0, 10)}/${platform}-${kind}-${randomUUID().slice(0, 8)}.jpg`;
  const { error } = await ctx.sb.storage.from("social-shots").upload(path, img, { contentType: "image/jpeg", upsert: false });
  return error ? null : path;
}

/** One screenshot read by Claude, logged with its real token counts and cost. */
async function readAndLog(ctx: Ctx, img: Buffer, clientId: string, platform: Platform, kind: "profile" | "post") {
  const model = ctx.s.scraper_model;
  const r = await readScreenshot(ctx.ai, model, img, platform, kind);
  const usage = r.usage;
  await ctx.sb.from("ai_usage").insert({
    feature: kind === "profile" ? "scraper_profile" : "scraper_post",
    client_id: clientId,
    platform,
    read_kind: kind,
    model: usage?.model ?? model,
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    cost_usd: usage ? cost(ctx.s, usage.model, usage.inputTokens, usage.outputTokens) : 0,
    ok: r.ok,
    error: r.ok ? null : r.error,
    run_id: ctx.runId,
  });
  ctx.reads++;
  if (!r.ok && /API key was refused/.test(r.error)) ctx.stopped = r.error;
  return r;
}

async function doPlatform(ctx: Ctx, context: BrowserContext, firstPage: Page, c: ClientRow, platform: Platform, url: string) {
  // A fresh browser is opened (and used for the rest of this platform)
  // when the first visit is sent to a login page.
  let page = firstPage;
  let cx = context;
  const extra: BrowserContext[] = [];
  try {
    await profileAndPosts();
  } finally {
    for (const x of extra) await x.close().catch(() => {});
  }

  async function profileAndPosts() {
  // ------------------------------------------------------------ profile
  let img: Buffer | null = null;
  let stats: Clean[] = [];
  let problem: string | null = null;
  let wall = false;
  let usedEmbed = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // 1: the profile, with its pop-up closed. 2: after a login page,
      // the same in a fresh browser (no cookies); otherwise the embed
      // page. 3: the embed page, if 2 was the fresh browser.
      let target = url;
      if (attempt > 1) {
        if (attempt === 2 && wall && cx === context) {
          log(`  ${LABEL[platform]}: login page; trying again in a fresh browser`);
          cx = await newContext(context.browser()!);
          extra.push(cx);
          page = await cx.newPage();
        } else {
          const e = usedEmbed ? null : embedProfile(platform, url);
          if (e) {
            target = e;
            usedEmbed = true;
            log(`  ${LABEL[platform]}: trying the embed page`);
          } else if (attempt === 3) break;
        }
      }
      wall = false;
      const status = await load(page, target, target === url ? PROFILE_READY[platform] : undefined);
      img = await shot(page);
      if (status >= 400 && status !== 429) {
        problem = `The page answered with an error (${status}).`;
        if (status === 404) break;
        continue;
      }
      // Don't pay for a read of an empty page or a login screen.
      const seen = await pageState(page);
      if (seen.loginWall) {
        wall = true;
        problem =
          platform === "instagram" && instagramLoggedIn()
            ? "Instagram's saved login has expired or was logged out. Update INSTAGRAM_SESSIONID in GitHub."
            : `${LABEL[platform]} sent us to a login page instead of the profile.`;
        log(`  ${LABEL[platform]}: login page (${seen.url})`);
        continue;
      }
      if (seen.text < 20) {
        problem = `The page came back empty (${LABEL[platform]} may be blocking logged-out visits).`;
        log(`  ${LABEL[platform]}: empty page (${seen.url}, ${seen.text} characters)`);
        continue;
      }
      const r = await readAndLog(ctx, img, c.id, platform, "profile");
      if (!r.ok) {
        problem = r.error;
        continue;
      }
      stats = clean(r.reading.stats);
      const followers = pick(stats, "followers", "subscribers");
      if (r.reading.page_shows !== "profile" || !followers) {
        problem = r.reading.problem || `The page showed ${r.reading.page_shows.replace("_", " ")}, not the profile's numbers.`;
        continue;
      }
      problem = null;
      break;
    } catch (e) {
      problem = e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : "The page didn't load.";
    }
  }

  // The screenshot couldn't be read: use the numbers the page states in
  // its own summary for search engines, if it has them.
  if (problem && !/\(404\)|API key/.test(problem)) {
    const summary = countsFromSummary((await meta(page)).description);
    const fromSummary: Clean[] = summary.map((x) => {
      const n = parseCount(x.text);
      return { name: x.name, label: `${x.name[0].toUpperCase()}${x.name.slice(1)} (from the page summary)`, text: x.text, value: n.value, abbreviated: n.abbreviated, confidence: 0.9 };
    });
    if (pick(fromSummary, "followers", "subscribers")) {
      log(`  ${LABEL[platform]}: screenshot unreadable (${problem}); used the page's own summary instead.`);
      stats = fromSummary;
      problem = null;
    }
  }

  const shotPath = img ? await keepShot(ctx, c.id, platform, "profile", img) : null;
  const followers = pick(stats, "followers", "subscribers");
  const following = pick(stats, "following");
  const posts = pick(stats, "posts", "videos");

  let status: "ok" | "flagged" | "failed" = problem ? "failed" : "ok";
  if (!problem && followers) {
    const { data: prev } = await ctx.sb
      .from("social_readings")
      .select("followers")
      .eq("client_id", c.id)
      .eq("platform", platform)
      .eq("kind", "profile")
      .eq("status", "ok")
      .not("followers", "is", null)
      .order("taken_at", { ascending: false })
      .limit(1);
    const before = Number(prev?.[0]?.followers ?? 0);
    if (before > 0 && Math.abs(followers.value! - before) / before > BIG_JUMP) {
      status = "flagged";
      problem = `Followers went from ${before.toLocaleString("en-GB")} to ${followers.value!.toLocaleString("en-GB")} (${Math.round(((followers.value! - before) / before) * 100)}%) since the last good reading. Check the screenshot.`;
    } else if (followers.confidence < LOW_CONFIDENCE) {
      status = "flagged";
      problem = `Not sure the follower count was read correctly ("${followers.text}"). Check the screenshot.`;
    }
  }

  await ctx.sb.from("social_readings").insert({
    run_id: ctx.runId,
    client_id: c.id,
    platform,
    kind: "profile",
    url,
    status,
    followers: status === "failed" ? null : followers?.value ?? null,
    following: status === "failed" ? null : following?.value ?? null,
    posts_count: status === "failed" ? null : posts?.value ?? null,
    stats,
    problem,
    screenshot_path: shotPath,
  });
  const handle = handleOf(platform, url);
  await ctx.sb.from("social_connections").upsert(
    {
      client_id: c.id,
      platform,
      status: "lookup",
      account_handle: handle,
      ...(status === "ok" ? { last_synced_at: new Date().toISOString(), last_error: null } : { last_error: problem }),
    },
    { onConflict: "client_id,platform" }
  );
  if (status === "failed") ctx.failures++;
  log(`  ${LABEL[platform]}: ${status}${followers ? ` · followers ${followers.text}` : ""}${problem ? ` · ${problem}` : ""}`);

  // ------------------------------------------------------------ posts (best effort)
  const n = ctx.s.posts_per_profile;
  if (ctx.stopped) return;
  let found: { key: string; url: string }[] = [];
  // TikTok's grid shows each video's plays ("26K"): kept as a backup.
  const grid = new Map<string, string>();
  if (n > 0 && status !== "failed") {
    try {
      const listUrl = postsPage(platform, url);
      if (listUrl !== url || page.url() !== url) await load(page, listUrl, POSTS_READY[platform]);
      await nudge(page, POSTS_READY[platform]);
      // Scrolling can bring the "log in to see more" box back.
      await clearPopups(page);
      const seen = new Set<string>();
      const handleX = platform === "x" ? xHandle(url) : null;
      if (platform === "tiktok") {
        for (const g of await gridViews(page)) {
          const p = postFromLink(platform, g.href, page.url());
          if (p && g.text) grid.set(p.key, g.text);
        }
        if (grid.size) log(`  ${LABEL[platform]}: ${grid.size} view count(s) on the profile grid`);
      }
      for (const href of await links(page)) {
        const p = postFromLink(platform, href, page.url(), handleX);
        if (p && !seen.has(p.key)) {
          seen.add(p.key);
          found.push(p);
        }
      }
      // Newest first where the id tells us the date (pinned posts are often old).
      found = found
        .map((p, i) => ({ ...p, i, t: plausible(postedFromKey(p.key))?.getTime() ?? null }))
        .sort((a, b) => (a.t != null && b.t != null ? b.t - a.t : a.i - b.i))
        .slice(0, n);
      // Nothing on the normal page (login wall, or a grid that never
      // drew): the embed page lists the latest posts too.
      const embed = found.length === 0 ? embedProfile(platform, url) : null;
      if (embed) {
        if (page.url() !== embed) await load(page, embed);
        const hrefs = await links(page);
        // Instagram's embed page can keep the latest posts in the page's
        // data rather than as links: look for their codes there too.
        const html = platform === "instagram" ? await page.content().catch(() => "") : "";
        const fromData = Array.from(html.matchAll(/(?:\\?\/(?:p|reel)\\?\/|"shortcode"\s*:\s*"|shortcode\\":\\")([A-Za-z0-9_-]{8,14})/g)).map(
          (m) => `https://www.instagram.com/p/${m[1]}/`
        );
        log(`  ${LABEL[platform]}: embed page has ${hrefs.length} link(s)${platform === "instagram" ? ` and ${new Set(fromData).size} post code(s) in its data` : ""}`);
        for (const href of [...hrefs, ...fromData]) {
          const p = postFromLink(platform, href, page.url(), handleX);
          if (p && !seen.has(p.key)) {
            seen.add(p.key);
            found.push(p);
          }
        }
        found = found
          .map((p, i) => ({ ...p, i, t: plausible(postedFromKey(p.key))?.getTime() ?? null }))
          .sort((a, b) => (a.t != null && b.t != null ? b.t - a.t : a.i - b.i))
          .slice(0, n);
      }
      log(`  ${LABEL[platform]}: ${found.length} latest post(s) found${embed ? " (from the embed page)" : ""}`);
    } catch (e) {
      log(`  ${LABEL[platform]}: couldn't list posts (${e instanceof Error ? e.message.split("\n")[0] : e})`);
    }
  }
  const linked = platform === "youtube" ? [] : await linkedDue(ctx, c.id, platform, new Set(found.map((f) => f.key)));
  for (const p of [...found, ...linked]) {
    if (ctx.stopped) break;
    await doPost(ctx, cx, c, platform, p, grid.get(p.key) ?? null);
  }
  }
}

function handleOf(platform: Platform, url: string): string | null {
  try {
    const first = new URL(url).pathname.split("/").filter(Boolean);
    if (platform === "youtube") return first[0]?.startsWith("@") ? first[0] : first.join("/") || null;
    if (platform === "linkedin") return first.slice(0, 2).join("/") || null;
    const name = (first[0] ?? "").replace(/^@/, "");
    return name ? `@${name}` : null;
  } catch {
    return null;
  }
}

/** Post links on this client's videos worth reading today (new ones daily, older ones weekly). */
async function linkedDue(ctx: Ctx, clientId: string, platform: Platform, skip: Set<string>) {
  const { data } = await ctx.sb.from("video_posts").select("id, url").eq("client_id", clientId).eq("platform", platform);
  const out: { key: string; url: string }[] = [];
  for (const row of (data ?? []) as { id: string; url: string }[]) {
    const p = postFromLink(platform, await resolveShort(row.url), row.url);
    if (!p || skip.has(p.key) || out.some((o) => o.key === p.key)) continue;
    const { data: known } = await ctx.sb
      .from("social_posts")
      .select("posted_at, updated_at")
      .eq("client_id", clientId)
      .eq("platform", platform)
      .eq("external_id", p.key.slice(p.key.indexOf(":") + 1))
      .maybeSingle();
    const old = known && Date.now() - new Date(known.posted_at).getTime() > 30 * DAY;
    const fresh = known?.updated_at && Date.now() - new Date(known.updated_at).getTime() < 7 * DAY;
    if (old && fresh) continue;
    out.push(p);
    if (out.length >= LINKED_POSTS_PER_PLATFORM) break;
  }
  return out;
}

/** vm.tiktok.com-style links, followed to where they really go. */
async function resolveShort(link: string): Promise<string> {
  if (!/^https?:\/\/(vm|vt)\.tiktok\.com\/|^https?:\/\/fb\.watch\//.test(link)) return link;
  try {
    const res = await fetch(link, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
    return res.headers.get("location") ?? link;
  } catch {
    return link;
  }
}

/**
 * One post, opened directly in its own new tab (never by clicking it on
 * the profile, which brings up "log in to see this post"). Its "Never
 * miss a post" box is closed with the ✕ like any visitor would.
 */
async function doPost(ctx: Ctx, cx: BrowserContext, c: ClientRow, platform: Platform, p: { key: string; url: string }, gridText: string | null) {
  const page = await cx.newPage();
  try {
    await readPost(ctx, page, c, platform, p, gridText);
  } finally {
    await page.close().catch(() => {});
  }
}

const POST_NUMBERS = ["likes", "comments", "views", "shares"] as const;

/** Likes, comments and views the page states in words ("1,234 likes, 56 comments"), as readings. */
function statedNumbers(text: string | null | undefined, where: string): Clean[] {
  return countsFromSummary(text)
    .filter((x): x is { name: (typeof POST_NUMBERS)[number]; text: string } => (POST_NUMBERS as readonly string[]).includes(x.name))
    .map((x) => {
      const n = parseCount(x.text);
      return { name: x.name, label: `${x.name[0].toUpperCase()}${x.name.slice(1)} (${where})`, text: x.text, value: n.value, abbreviated: n.abbreviated, confidence: 0.9 };
    })
    .filter((x) => x.value != null);
}

async function readPost(ctx: Ctx, page: Page, c: ClientRow, platform: Platform, p: { key: string; url: string }, gridText: string | null) {
  let img: Buffer | null = null;
  let pageData: Clean[] = [];
  let stats: Clean[] = [];
  let caption: string | null = null;
  let problem: string | null = null;
  let usedEmbed = false;
  let info: Awaited<ReturnType<typeof meta>> = { image: null, description: null, published: null };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const fallback = attempt > 1 ? embedPost(platform, p.key) : null;
      if (fallback) usedEmbed = true;
      const status = await load(page, fallback ?? p.url);
      img = await shot(page);
      const got = await meta(page);
      // TikTok keeps the video's exact numbers (plays included, which its
      // page never shows on screen) in the page's own data.
      if (platform === "tiktok" && !fallback && !pageData.length) {
        const data = tiktokStats(await page.content().catch(() => ""), p.key.slice(3));
        pageData = Object.entries(data).map(([name, value]) => ({
          name: name === "saves" ? "other" : (name as Clean["name"]),
          label: `${name[0].toUpperCase()}${name.slice(1)} (from the page's data)`,
          text: String(value),
          value: value!,
          abbreviated: false,
          confidence: 1,
        }));
      }
      info = { image: got.image ?? info.image, description: got.description ?? info.description, published: got.published ?? info.published };
      if (status >= 400 && status !== 429) {
        problem = `The post page answered with an error (${status}).`;
        if (status === 404) break;
        continue;
      }
      const seen = await pageState(page);
      if (seen.loginWall || seen.text < 20) {
        problem = seen.loginWall ? `${LABEL[platform]} asked to log in to see this post.` : "The post page came back empty.";
        continue;
      }
      const r = await readAndLog(ctx, img, c.id, platform, "post");
      if (!r.ok) {
        problem = r.error;
        continue;
      }
      stats = clean(r.reading.stats);
      caption = r.reading.caption;
      if (r.reading.page_shows !== "post") {
        problem = r.reading.problem || `The page showed ${r.reading.page_shows.replace("_", " ")}, not the post.`;
        stats = [];
        continue;
      }
      problem = stats.length ? null : r.reading.problem || "No numbers visible on this post.";
      break;
    } catch (e) {
      problem = e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : "The post didn't load.";
    }
  }

  // Numbers the screenshot didn't show (Instagram often hides likes and
  // views from visitors who aren't logged in): take them from what the
  // platform itself states, free of charge. First the post's link-preview
  // summary ("1,234 likes, 56 comments - …"), then the post's embed page.
  const missing = () => POST_NUMBERS.filter((k) => !pick(stats, k));
  const add = (more: Clean[]) => {
    for (const x of more) if (!pick(stats, x.name)) stats.push(x);
  };
  // Exact numbers from the page's data win over rounded ones ("1.2K") read off the screen.
  for (const x of pageData) {
    const seen = pick(stats, x.name);
    if (x.name === "other") continue;
    if (!seen) stats.push(x);
    else if (seen.abbreviated) stats[stats.indexOf(seen)] = x;
  }
  if (missing().length) add(statedNumbers(info.description, "from the post's summary"));
  const embed = embedPost(platform, p.key);
  if (missing().some((k) => k !== "comments") && embed && !usedEmbed) {
    try {
      await load(page, embed);
      if (!(await pageState(page)).loginWall) add(statedNumbers(await bodyText(page), "from the embed page"));
    } catch {
      // Best effort: what we have stands.
    }
  }
  // Last resort for plays: the number on the profile grid ("26K"), as TikTok rounds it.
  if (!pick(stats, "views") && gridText) {
    const g = parseCount(gridText);
    if (g.value != null) stats.push({ name: "views", label: "Views (from the profile grid)", text: gridText, value: g.value, abbreviated: g.abbreviated, confidence: 0.9 });
  }
  if (stats.length && problem) problem = null;

  const ok = !problem || stats.length > 0;
  const likes = pick(stats, "likes");
  const comments = pick(stats, "comments");
  const views = pick(stats, "views");
  const shares = pick(stats, "shares");
  const shotPath = img ? await keepShot(ctx, c.id, platform, "post", img) : null;
  await ctx.sb.from("social_readings").insert({
    run_id: ctx.runId,
    client_id: c.id,
    platform,
    kind: "post",
    url: p.url,
    post_key: p.key,
    status: ok ? "ok" : "failed",
    likes: likes?.value ?? null,
    comments: comments?.value ?? null,
    views: views?.value ?? null,
    stats,
    problem,
    screenshot_path: shotPath,
  });
  if (!ok) ctx.failures++;

  // The post's current numbers, for the Recent posts cards. A number that
  // wasn't visible this time keeps its last good value.
  const externalId = p.key.slice(p.key.indexOf(":") + 1);
  const { data: known } = await ctx.sb
    .from("social_posts")
    .select("likes, comments, views, shares, posted_at, first_seen_at, thumbnail_path, caption")
    .eq("client_id", c.id)
    .eq("platform", platform)
    .eq("external_id", externalId)
    .maybeSingle();
  const now = new Date().toISOString();
  const posted =
    plausible(postedFromKey(p.key))?.toISOString() ??
    (info.published && plausible(new Date(info.published)) ? new Date(info.published).toISOString() : null) ??
    known?.posted_at ??
    now;
  const thumb = known?.thumbnail_path ?? (info.image ? await keepThumb(ctx, page, c.id, platform, externalId, info.image) : null);
  await ctx.sb.from("social_posts").upsert(
    {
      client_id: c.id,
      platform,
      external_id: externalId,
      posted_at: posted,
      first_seen_at: known?.first_seen_at ?? now,
      caption: (caption ?? info.description ?? known?.caption ?? null)?.slice(0, 600) ?? null,
      thumbnail_path: thumb,
      thumbnail_url: null,
      permalink: p.url,
      is_video: views != null || ["tiktok", "youtube"].includes(platform) || /reel|video|watch/.test(p.url),
      likes: likes?.value ?? known?.likes ?? null,
      comments: comments?.value ?? known?.comments ?? null,
      views: views?.value ?? known?.views ?? null,
      shares: shares?.value ?? known?.shares ?? null,
      updated_at: now,
    },
    { onConflict: "client_id,platform,external_id" }
  );

  // A video whose "Where it's posted" link is this post gets its numbers.
  if (ok && (likes || comments || views || shares)) await applyToVideos(ctx, c.id, platform, p.key, { likes, comments, views, shares });
  log(`    post ${p.key}: ${ok ? "ok" : "failed"}${likes ? ` · likes ${likes.text}` : ""}${comments ? ` · comments ${comments.text}` : ""}${views ? ` · views ${views.text}` : ""}${shares ? ` · shares ${shares.text}` : ""}${problem ? ` · ${problem}` : ""}`);
}

/** The post's own preview picture, kept so Recent posts has an image after the screenshots go. */
async function keepThumb(ctx: Ctx, page: Page, clientId: string, platform: Platform, id: string, image: string): Promise<string | null> {
  try {
    // Opened in the browser, like any visitor's would be.
    const res = await page.goto(new URL(image, page.url()).toString(), { timeout: 15_000 });
    const type = res?.headers()["content-type"] ?? "";
    if (!res || !res.ok() || !/^image\//.test(type)) {
      return null;
    }
    const body = await res.body();
    if (body.length > 2_000_000) return null;
    const path = `${clientId}/${platform}/${id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}.${type.includes("png") ? "png" : "jpg"}`;
    const { error } = await ctx.sb.storage.from("social-thumbs").upload(path, body, { contentType: type, upsert: true });
    return error ? null : path;
  } catch {
    return null;
  }
}

async function applyToVideos(ctx: Ctx, clientId: string, platform: Platform, key: string, n: { likes: Clean | null; comments: Clean | null; views: Clean | null; shares: Clean | null }) {
  const { data } = await ctx.sb.from("video_posts").select("id, url").eq("client_id", clientId).eq("platform", platform);
  for (const row of (data ?? []) as { id: string; url: string }[]) {
    const p = postFromLink(platform, await resolveShort(row.url), row.url);
    if (p?.key !== key) continue;
    const numbers: Record<string, number> = {};
    if (n.likes?.value != null) numbers.likes = n.likes.value;
    if (n.comments?.value != null) numbers.comments = n.comments.value;
    if (n.views?.value != null) numbers.views = n.views.value;
    if (n.shares?.value != null) numbers.shares = n.shares.value;
    await ctx.sb.from("video_posts").update({ ...numbers, metrics_at: new Date().toISOString(), metrics_source: "platform" }).eq("id", row.id);
  }
}

/** Screenshots older than 14 days are deleted; the readings stay. */
async function cleanupShots(sb: SupabaseClient) {
  const before = new Date(Date.now() - SHOTS_KEPT_DAYS * DAY).toISOString();
  for (let round = 0; round < 20; round++) {
    const { data } = await sb.from("social_readings").select("id, screenshot_path").not("screenshot_path", "is", null).lt("taken_at", before).limit(500);
    const rows = (data ?? []) as { id: string; screenshot_path: string }[];
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      await sb.storage.from("social-shots").remove(chunk.map((r) => r.screenshot_path));
      await sb.from("social_readings").update({ screenshot_path: null }).in("id", chunk.map((r) => r.id));
    }
    log(`Deleted ${rows.length} screenshot(s) older than ${SHOTS_KEPT_DAYS} days.`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
