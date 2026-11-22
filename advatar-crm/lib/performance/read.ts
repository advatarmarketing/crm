import Anthropic from "@anthropic-ai/sdk";
import { logAiCall } from "@/lib/ai-usage";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MEETING_KEY_ENV, MEETING_MODEL } from "@/lib/onboarding/meeting";
import { METRICS, compact, monthName, percent, platformLabel, type Numbers, type Summary } from "./index";

/**
 * The two places the Performance tab asks Claude for help:
 *
 *   reading a screenshot of a post's numbers, so nobody has to retype
 *   them (Instagram and TikTok only show full numbers to the account
 *   owner, and a screenshot of that screen is the one source that
 *   needs nobody's approval);
 *
 *   writing up what the numbers say, for the report.
 *
 * Both work to the same rule as reading a meeting: only what is
 * actually there. A number that is not on the screenshot comes back
 * empty, and the report may only use the figures it is handed.
 */

export const readerOn = () => Boolean(process.env[MEETING_KEY_ENV]);

/**
 * Screenshots go to Claude Haiku 5.5: reading five numbers off an
 * image is simple work done hundreds of times a month, and it costs a
 * fraction of a penny each. Reports stay on the meeting model.
 */
export const SCREENSHOT_MODEL = "claude-haiku-5-5";

const count = z.number().nullable();

const ScreenshotSchema = z.object({
  is_post_stats: z.boolean(),
  views: count,
  likes: count,
  comments: count,
  shares: count,
  saves: count,
  note: z.string().nullable(),
});

const SCREENSHOT_SYSTEM = `You read the numbers off a screenshot of one social media post (Instagram, TikTok, YouTube, Facebook, LinkedIn or X): either the post itself or its insights/analytics screen.

Return each number exactly as shown, as a whole number. Expand short forms: "12.4K" is 12400, "1.2M" is 1200000, "3,481" is 3481.

- views: plays or views of the video. On Instagram this is "Views" (or "Plays" on older screens). Do not use reach, impressions or accounts reached for it.
- likes, comments, shares: as labelled, or the heart, speech bubble and arrow/paper plane icons.
- saves: saves or bookmarks (TikTok calls them favourites).

If a number is not visible, return null for it. Never estimate, and never copy one number into another field. If the image is not a post or its stats, set is_post_stats to false and every number to null. Use note only for something the team must know, such as the image showing several posts at once; otherwise null.`;

export type ScreenshotResult = { ok: true; numbers: Numbers; note: string | null } | { ok: false; error: string };

const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type Media = (typeof MEDIA)[number];

function explain(error: unknown, what: string): string {
  if (error instanceof Anthropic.AuthenticationError) return "The ANTHROPIC_API_KEY in Vercel was refused. Check it is copied in full and still active.";
  if (error instanceof Anthropic.RateLimitError) return "Too many requests just now. Wait a minute and try again.";
  if (error instanceof Anthropic.BadRequestError) return `That ${what} couldn’t be read. Try a smaller or clearer one.`;
  if (error instanceof Anthropic.APIConnectionError) return "Couldn’t reach the service. Try again in a moment.";
  if (error instanceof Anthropic.APIError) return `It failed (${error.status ?? "error"}). Try again in a moment.`;
  throw error;
}

/** `data` is base64 without a data: prefix. */
export async function readScreenshot(data: string, mediaType: string, platform: string, clientId?: string | null): Promise<ScreenshotResult> {
  if (!readerOn()) return { ok: false, error: "Reading screenshots needs an ANTHROPIC_API_KEY in Vercel’s settings. You can type the numbers in instead." };
  if (!MEDIA.includes(mediaType as Media)) return { ok: false, error: "Use a PNG or JPEG screenshot." };

  const client = new Anthropic();
  try {
    // No `fallbacks` here: Claude Haiku 5.5 has no server-side
    // fallback, and a refusal is handled below like any other model's.
    // Thinking counts towards max_tokens, so it has room beyond the
    // short answer.
    const response = await client.beta.messages.parse({
      model: SCREENSHOT_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(ScreenshotSchema) },
      system: SCREENSHOT_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as Media, data } },
            { type: "text", text: `This post is on ${platformLabel(platform)}. Read its numbers.` },
          ],
        },
      ],
    });
    const out = response.parsed_output;
    const readOk = !(response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !out);
    await logAiCall({ feature: "screenshot", model: response.model, usage: response.usage, ok: readOk, clientId, platform, error: readOk ? null : String(response.stop_reason) });
    if (!readOk || !out) {
      return { ok: false, error: "That screenshot couldn’t be read. Type the numbers in instead." };
    }
    const numbers = {} as Numbers;
    for (const m of METRICS) {
      const v = out[m];
      numbers[m] = typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e12 ? Math.round(v) : null;
    }
    if (!out.is_post_stats || METRICS.every((m) => numbers[m] === null)) {
      return { ok: false, error: "No numbers could be found on that screenshot. Use one of the post or its insights screen, or type them in." };
    }
    return { ok: true, numbers, note: out.note?.trim() || null };
  } catch (error) {
    await logAiCall({ feature: "screenshot", model: SCREENSHOT_MODEL, usage: null, ok: false, clientId, platform, error: error instanceof Error ? error.message : "failed" });
    return { ok: false, error: explain(error, "screenshot") };
  }
}

/** The written half of a report. */
export interface Analysis {
  headline: string;
  overview: string;
  worked: string[];
  improve: string[];
  tested: string[];
  next: string[];
}

const lines = z.array(z.string());
const AnalysisSchema = z.object({ headline: z.string(), overview: z.string(), worked: lines, improve: lines, tested: lines, next: lines });

const REPORT_SYSTEM = `You write the analysis section of a performance report from Advatar, a video content agency, to one of its clients.

You are given every figure there is, as JSON. The one rule: use only those figures. Never invent a number, a cause, an audience fact or a trend that the data does not show. Views are the main measure; engagement (likes, comments, shares and saves) and engagement rate come second.

Be straight about what the numbers can and cannot say:
- A pillar or type with one or two videos is a test, not a result. Say what happened and that it is too few to judge.
- If something did poorly, say so plainly and say what we will do about it.
- If videos or numbers are missing, do not guess what they would have shown.

How to write:
- British English, plain words, no hype and no filler. Short sentences.
- From Advatar as a team: "we", never "I". Addressed to the client as "you" / "your".
- Refer to videos by their name and title as given.
- headline: one line that sums up the period.
- overview: three to five sentences: what went out, how many views, what stood out.
- worked: what kinds of video did well and the evidence. improve: what underperformed or needs changing. tested: things tried that it is too early to judge, and what was seen so far. next: specific things we will do next period because of these results.
- Two to five points per list, each one sentence or two with its figure. An empty list is fine where there is nothing true to say.`;

/** What the report says when Claude is not available: the same facts, read straight off the sums. */
export function basicAnalysis(s: Summary, range: string): Analysis {
  const t = s.totals;
  const top = s.ranked[0];
  const solid = s.byPillar.filter((p) => p.videos >= 3);
  const thin = s.byPillar.filter((p) => p.videos < 3);
  const best = solid[0];
  const worst = solid.length > 1 ? solid[solid.length - 1] : null;
  const label = (v: { name: string; title: string | null }) => (v.title ? `${v.name} (“${v.title}”)` : v.name);
  return {
    headline: t.videos ? `${compact(t.views)} views across ${t.videos} video${t.videos === 1 ? "" : "s"}` : "No results recorded yet",
    overview: t.videos
      ? `In ${range}, ${t.videos} video${t.videos === 1 ? "" : "s"} with recorded results reached ${compact(t.views)} views, with ${compact(t.engagements)} likes, comments, shares and saves between them (${percent(t.rate)} of views).${top ? ` The most watched was ${label(top)} with ${compact(top.views)} views.` : ""}`
      : `No videos in ${range} have results recorded yet.`,
    worked: [
      best ? `${best.name} videos averaged ${compact(best.avgViews)} views each across ${best.videos} videos, the highest of any pillar.` : "",
      top ? `${label(top)} was the most watched video with ${compact(top.views)} views.` : "",
      s.byPlatform[0] && s.byPlatform.length > 1 ? `${platformLabel(s.byPlatform[0].name)} brought the most views: ${compact(s.byPlatform[0].views)}.` : "",
    ].filter(Boolean),
    improve: [
      worst && best && worst.name !== best.name ? `${worst.name} videos averaged ${compact(worst.avgViews)} views each across ${worst.videos} videos, the lowest of the pillars with enough videos to compare.` : "",
      s.ranked.length > 3 ? `${label(s.ranked[s.ranked.length - 1])} had the fewest views: ${compact(s.ranked[s.ranked.length - 1].views)}.` : "",
    ].filter(Boolean),
    tested: thin.map((p) => `${p.name}: ${p.videos} video${p.videos === 1 ? "" : "s"} so far, averaging ${compact(p.avgViews)} views. Too few to judge yet.`),
    next: [],
  };
}

export async function writeAnalysis(input: {
  clientName: string;
  range: string;
  summary: Summary;
  /** For the AI spend log. */
  clientId?: string | null;
}): Promise<{ analysis: Analysis; written: boolean; problem: string | null }> {
  const fallback = basicAnalysis(input.summary, input.range);
  if (!readerOn() || input.summary.totals.videos === 0) return { analysis: fallback, written: false, problem: null };

  const s = input.summary;
  const group = (g: Summary["byPillar"]) => g.map((x) => ({ name: x.name, videos: x.videos, views: x.views, average_views: x.avgViews, engagements: x.engagements, engagement_rate: percent(x.rate) }));
  const data = {
    client: input.clientName,
    period: input.range,
    totals: { videos_with_results: s.totals.videos, views: s.totals.views, likes: s.totals.likes, comments: s.totals.comments, shares: s.totals.shares, saves: s.totals.saves, engagement_rate: percent(s.totals.rate) },
    by_platform: group(s.byPlatform).map((g) => ({ ...g, name: platformLabel(g.name) })),
    by_content_pillar: group(s.byPillar),
    by_video_type: group(s.byType),
    by_calendar_month: group(s.byMonth).map((g) => ({ ...g, name: monthName(g.name) })),
    videos: s.ranked.slice(0, 150).map((v) => ({
      name: v.name, title: v.title, pillar: v.pillar, type: v.type, posted: v.date, platforms: v.platforms.map(platformLabel),
      views: v.views, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saves, engagement_rate: percent(v.rate),
    })),
    not_counted: { posted_without_a_link: s.missingLinks.length, links_without_numbers: s.missingNumbers.length },
  };

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MEETING_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(AnalysisSchema) },
      system: REPORT_SYSTEM,
      messages: [{ role: "user", content: `<results>\n${JSON.stringify(data)}\n</results>\n\nWrite the analysis for this period.` }],
    });
    const out = response.parsed_output;
    await logAiCall({ feature: "report", model: response.model, usage: response.usage, ok: !!out && response.stop_reason !== "refusal", clientId: input.clientId ?? null, error: out ? null : String(response.stop_reason) });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !out) {
      return { analysis: fallback, written: false, problem: "The written analysis couldn’t be produced, so the report shows the figures with a basic summary." };
    }
    const tidy = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).slice(0, 6);
    return {
      analysis: { headline: out.headline.trim(), overview: out.overview.trim(), worked: tidy(out.worked), improve: tidy(out.improve), tested: tidy(out.tested), next: tidy(out.next) },
      written: true,
      problem: null,
    };
  } catch (error) {
    await logAiCall({ feature: "report", model: MEETING_MODEL, usage: null, ok: false, clientId: input.clientId ?? null, error: error instanceof Error ? error.message : "failed" });
    return { analysis: fallback, written: false, problem: `${explain(error, "report")} The report shows the figures with a basic summary.` };
  }
}

/** What is saved in performance_reports.content. */
export interface ReportContent {
  clientName: string;
  range: string;
  from: string | null;
  to: string | null;
  madeAt: string;
  summary: Summary;
  analysis: Analysis;
  written: boolean;
}
