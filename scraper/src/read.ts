import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { parseCount } from "./numbers.js";
import { LABEL, type Platform } from "./platforms.js";

/**
 * Claude reads one screenshot and returns only what it can see. The key
 * comes from ANTHROPIC_API_KEY in the job's environment and is never
 * written anywhere.
 */

const STAT_NAMES = [
  "followers",
  "following",
  "posts",
  "likes",
  "comments",
  "views",
  "shares",
  "subscribers",
  "total_views",
  "videos",
  "employees",
  "other",
] as const;

const Stat = z.object({
  name: z.enum(STAT_NAMES),
  label: z.string().describe("The label next to the number, as shown, e.g. 'Followers'."),
  text: z.string().describe("The number exactly as shown, e.g. '12.3K' or '1,204'."),
  value: z.number().nullable().describe("The number it stands for, e.g. 12300. Null if unclear."),
  abbreviated: z.boolean().describe("True if shown rounded with K/M/B or similar."),
  confidence: z.number().describe("0 to 1: how sure you are you read this correctly."),
});

const Reading = z.object({
  page_shows: z.enum(["profile", "post", "login_wall", "cookie_wall", "not_found", "error_page", "other"]),
  problem: z.string().nullable().describe("If numbers are hidden or the page is not what was expected, say why in a few words."),
  stats: z.array(Stat),
  caption: z.string().nullable().describe("For a post: the first line of its caption or title, if visible."),
});

export type StatOut = z.infer<typeof Stat>;
export type ReadingOut = z.infer<typeof Reading>;

const SYSTEM = `You read numbers off a screenshot of a public social media page for a marketing agency's client dashboard.

Rules:
- Report only numbers you can actually see in the screenshot. Never estimate, infer, calculate or remember a number. If a number is hidden, blurred, cut off, covered by a pop-up or not on screen, leave it out.
- "text" is the number exactly as displayed, including K/M/B and separators. "value" is the whole number it represents (12.3K -> 12300). "abbreviated" is true when the display is rounded (K, M, B, "1.2 million").
- "confidence" is how sure you are that you read that number and its label correctly, from 0 to 1.
- Use the closest "name": followers, following, posts, likes, comments, views, shares, subscribers, total_views, videos, employees, or other.
- If the page is a login wall, cookie wall, error or "not found" page, say so in page_shows and return no stats.
Return JSON only.`;

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function readScreenshot(
  client: Anthropic,
  model: string,
  image: Buffer,
  platform: Platform,
  kind: "profile" | "post"
): Promise<{ ok: true; reading: ReadingOut; usage: Usage } | { ok: false; error: string; usage: Usage | null }> {
  const ask =
    kind === "profile"
      ? `This is the public ${LABEL[platform]} profile page. Read the account's numbers shown in its header: followers (or subscribers), following, number of posts or videos, and any other totals shown (for example total likes on TikTok, total views on YouTube).`
      : `This is one public ${LABEL[platform]} post. Read its likes (or reactions), comments, views (or plays) and shares if shown. Ignore numbers that belong to other posts, comments or the account.`;
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 2000,
      // A simple reading job: no thinking, which keeps the cost down.
      thinking: { type: "disabled" },
      output_config: { format: betaZodOutputFormat(Reading) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.toString("base64") } },
            { type: "text", text: ask },
          ],
        },
      ],
    });
    const usage: Usage = { model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    if (response.stop_reason === "refusal") return { ok: false, error: "The AI declined to read this screenshot.", usage };
    if (response.stop_reason === "max_tokens" || !response.parsed_output) return { ok: false, error: "The AI's answer was cut off.", usage };
    return { ok: true, reading: response.parsed_output, usage };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was refused. Check ANTHROPIC_API_KEY in GitHub.", usage: null };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Anthropic rate limit hit.", usage: null };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Anthropic API error ${e.status ?? ""}`.trim(), usage: null };
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Reading failed.", usage: null };
  }
}

export interface Clean {
  name: StatOut["name"];
  label: string;
  text: string;
  value: number | null;
  abbreviated: boolean;
  confidence: number;
}

/**
 * Checks the AI's numbers against the text it copied: the number is
 * worked out from the text here; when the two disagree, the text wins
 * and confidence is lowered.
 */
export function clean(stats: StatOut[]): Clean[] {
  return stats.map((s) => {
    const parsed = parseCount(s.text);
    let value = parsed.value;
    let confidence = Math.max(0, Math.min(1, Number.isFinite(s.confidence) ? s.confidence : 0));
    if (value == null) {
      value = null;
      confidence = Math.min(confidence, 0.3);
    } else if (s.value != null && Math.abs(s.value - value) > Math.max(1, value * 0.01)) {
      confidence = Math.min(confidence, 0.5);
    }
    return { name: s.name, label: s.label.slice(0, 60), text: s.text.slice(0, 40), value, abbreviated: parsed.abbreviated || s.abbreviated, confidence };
  });
}

/** The first number of a kind, if read with reasonable confidence. */
export function pick(stats: Clean[], ...names: StatOut["name"][]): Clean | null {
  for (const n of names) {
    const s = stats.find((x) => x.name === n && x.value != null);
    if (s) return s;
  }
  return null;
}
