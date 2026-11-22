import Anthropic from "@anthropic-ai/sdk";
import { logAiCall } from "@/lib/ai-usage";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { DEFAULT_PLANNER_CONTENT, makeId, type PlannerContent } from "@/lib/planner/content";
import { describePackage, videosPerWeek, type PackageSettings } from "@/lib/packages";

/**
 * Reads a meeting (a Fathom summary or transcript, call notes, a
 * PDF) and fills in a new client and their content plan from it.
 *
 * The rule the model works to: only what was actually said. Anything
 * not discussed comes back empty, so it lands on the "still to fill
 * in" list for the team instead of being made up. Fonts and colours
 * are the usual examples.
 */

export const MEETING_MODEL = "claude-opus-5-5";
export const MEETING_KEY_ENV = "ANTHROPIC_API_KEY";

const text = z.string().nullable();

const MeetingSchema = z.object({
  client: z.object({
    business_name: text,
    contact_name: text,
    contact_email: text,
    service: text,
  }),
  plan: z.object({
    brand_line: text,
    standard: text,
    account_job: text,
    brand: z.object({
      essence: text,
      mission: text,
      tone: text,
      fonts: text,
      colours: text,
      design_style: text,
      sound: text,
      backgrounds: text,
      faces: text,
    }),
    pillars: z.array(
      z.object({
        name: z.string(),
        share_percent: z.number().nullable(),
        purpose: text,
        description: text,
        angles: z.array(z.string()),
      })
    ),
    format: z.object({
      reels: text,
      carousels: text,
      statics: text,
      stories: text,
    }),
    metrics: z.array(z.object({ name: z.string(), how_often: text })),
    competitors: z.array(z.object({ name: z.string(), url: text })),
    timeline: z.array(z.object({ when: text, title: z.string(), description: text })),
  }),
  video_ideas: z.array(
    z.object({
      title: z.string(),
      pillar: text,
      description: text,
      hook: text,
      cta: text,
    })
  ),
  to_ask: z.array(z.string()),
});

export type MeetingRead = z.infer<typeof MeetingSchema>;

const SYSTEM = `You read a meeting between Advatar, a video content agency, and a new client, and fill in that client's onboarding record.

The one rule: use only what the meeting actually says. If something was not discussed, return null (or an empty list). Never fill a gap with a sensible guess, an industry default or an example: an empty field becomes a task for the Advatar team, while a guessed one gets sent to the client as if they had said it. Fonts and colour palettes are rarely discussed, so expect those to be null unless specific fonts or colours were named.

How to write what you do fill in:
- British English, plain words, no hype.
- The plan is shown to the client, written from Advatar as a team ("we", "your team"), never as one person.
- Keep each field short: a line or two, not a paragraph.
- brand_line: one line that sums the account up. standard: the bar the account is held to, if one was stated. account_job: what the account is for and who it needs to reach.
- Pillars: at most four, only themes the client actually wants to cover. share_percent only if a split was agreed; otherwise null.
- format: only shares or frequencies that were agreed, written as said (e.g. "70%", "Daily").
- video_ideas: specific video ideas mentioned in the meeting, in the order they came up. Skip vague themes; those belong in pillars.
- competitors: accounts or businesses named as competitors or inspiration; url only if one was given.
- timeline: agreed dates, milestones or next steps.
- to_ask: short questions the team still needs answering, for things that came up but were left unresolved.`;

export type ReadResult =
  | { ok: true; read: MeetingRead }
  | { ok: false; error: string };

export function meetingKeyMissing(): boolean {
  return !process.env[MEETING_KEY_ENV];
}

/** `pdf` is base64, without a data: prefix. */
export async function readMeeting(input: { text?: string; pdf?: string; packageSummary?: string }): Promise<ReadResult> {
  if (meetingKeyMissing()) {
    return { ok: false, error: "Reading meetings isn't switched on yet. Add an ANTHROPIC_API_KEY in Vercel's settings." };
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.pdf) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdf } });
  }
  const notes = input.text?.trim();
  content.push({
    type: "text",
    text: [
      input.packageSummary ? `The package we have agreed for this client: ${input.packageSummary}` : null,
      notes ? `<meeting>\n${notes}\n</meeting>` : "The meeting is the attached document.",
      "Fill in the onboarding record from this meeting.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MEETING_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(MeetingSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    await logAiCall({ feature: "meeting", model: response.model, usage: response.usage, ok: response.stop_reason !== "refusal" && !!response.parsed_output, error: response.parsed_output ? null : String(response.stop_reason) });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "That document couldn't be read. Try pasting the meeting summary as text instead." };
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { ok: false, error: "The meeting was too long to read in one go. Paste the summary rather than the full transcript." };
    }
    return { ok: true, read: response.parsed_output };
  } catch (error) {
    await logAiCall({ feature: "meeting", model: MEETING_MODEL, usage: null, ok: false, error: error instanceof Error ? error.message : "failed" });
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "The ANTHROPIC_API_KEY in Vercel was refused. Check it is copied in full and still active." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Too many requests just now. Wait a minute and try again." };
    }
    if (error instanceof Anthropic.BadRequestError) {
      return { ok: false, error: "That document couldn't be read. Try a PDF under 4 MB, or paste the text." };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "Couldn't reach the service that reads meetings. Try again in a moment." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, error: `Reading the meeting failed (${error.status ?? "error"}). Try again in a moment.` };
    }
    throw error;
  }
}

const clean = (v: string | null | undefined) => (v ?? "").trim();

const BRAND_FIELDS: { prefix: string; key: keyof MeetingRead["plan"]["brand"] }[] = [
  { prefix: "brand essence", key: "essence" },
  { prefix: "mission statement", key: "mission" },
  { prefix: "tone of voice", key: "tone" },
  { prefix: "fonts", key: "fonts" },
  { prefix: "colour palette", key: "colours" },
  { prefix: "design style", key: "design_style" },
  { prefix: "sound design", key: "sound" },
  { prefix: "backgrounds", key: "backgrounds" },
  { prefix: "faces of the brand", key: "faces" },
];

/** Shares that add up to 100, keeping any that were agreed. */
function shares(given: (number | null)[]): number[] {
  if (given.length === 0) return [];
  const agreed = given.map((g) => (g && g > 0 ? Math.round(g) : null));
  if (agreed.every((g) => g !== null) && agreed.reduce((n, g) => n + (g as number), 0) === 100) return agreed as number[];
  if (agreed.some((g) => g !== null)) return agreed.map((g) => g ?? 0);
  const each = Math.floor(100 / given.length);
  return given.map((_, i) => (i === 0 ? 100 - each * (given.length - 1) : each));
}

/**
 * The client's plan from what was read. Starts from the blank
 * template, so every field the meeting did not cover stays blank and
 * shows on the "still to fill in" list.
 */
export function planFromMeeting(read: MeetingRead | null, pkg: PackageSettings | null, businessName: string): PlannerContent {
  const content: PlannerContent = JSON.parse(JSON.stringify(DEFAULT_PLANNER_CONTENT));
  content.hero.brand = businessName;

  if (pkg) {
    const posts = content.format.stats.find((s) => /posts/i.test(s.label));
    if (posts) posts.value = String(videosPerWeek(pkg));
  }
  if (!read) return content;
  const p = read.plan;

  if (clean(p.brand_line)) content.hero.sub = clean(p.brand_line);
  content.thesis.quote = clean(p.standard);
  content.overview.desc = clean(p.account_job);

  for (const row of content.branding.rows) {
    const field = BRAND_FIELDS.find((f) => row.label.toLowerCase().startsWith(f.prefix));
    if (field) row.value = clean(p.brand[field.key]);
  }

  const pillars = p.pillars.filter((x) => clean(x.name)).slice(0, 4);
  const pct = shares(pillars.map((x) => x.share_percent));
  pillars.forEach((x, i) => {
    const slot = content.pillars.items[i];
    slot.name = clean(x.name);
    slot.pct = pct[i];
    slot.subtitle = clean(x.purpose);
    slot.description = clean(x.description);
    slot.tags = x.angles.map(clean).filter(Boolean).slice(0, 6);
    if (slot.tags.length === 0) slot.tags = [""];
  });
  // Unused pillar cards would read as empty pillars.
  if (pillars.length > 0) content.pillars.items = content.pillars.items.slice(0, pillars.length);

  const formatBy: Record<string, string | null> = {
    reels: p.format.reels,
    carousels: p.format.carousels,
    static: p.format.statics,
    stories: p.format.stories,
  };
  for (const stat of content.format.stats) {
    const key = Object.keys(formatBy).find((k) => stat.label.toLowerCase().startsWith(k));
    if (key && clean(formatBy[key])) stat.value = clean(formatBy[key]);
  }

  const metrics = p.metrics.filter((m) => clean(m.name)).slice(0, 8);
  if (metrics.length) content.metrics.items = metrics.map((m) => ({ id: makeId("metric"), label: clean(m.name), value: clean(m.how_often) }));

  const competitors = p.competitors.filter((c) => clean(c.name)).slice(0, 8);
  if (competitors.length)
    content.competitors.links = competitors.map((c) => ({
      id: makeId("link"),
      title: clean(c.name),
      url: /^https?:\/\//i.test(clean(c.url)) ? clean(c.url) : "",
    }));

  const timeline = p.timeline.filter((t) => clean(t.title)).slice(0, 10);
  if (timeline.length)
    content.timeline.items = timeline.map((t) => ({
      id: makeId("tl"),
      date: clean(t.when),
      title: clean(t.title),
      description: clean(t.description),
      done: false,
      owner: "",
      milestone: "",
    }));

  return content;
}

export function packageLine(pkg: PackageSettings | null): string | undefined {
  return pkg ? describePackage(pkg) : undefined;
}
