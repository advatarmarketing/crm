import { z } from "zod";

/**
 * The video sales letter page, app.advatar.co.uk/enquire-vsl (0062).
 *
 * Everything on it that words or pictures can change lives in one
 * jsonb row (site_pages, slug "enquire-vsl"), edited on the page itself
 * by the CEO or operations. What is here is the shape of that row, the
 * wording it starts with, and the one function that turns whatever
 * arrives (a saved row, an edit) into something safe to show.
 */

export const VSL_SLUG = "enquire-vsl";

export interface VslLogo {
  id: string;
  name: string;
  /** A public URL: our own storage (uploaded and evened out), or a pasted link. */
  url: string;
}

export interface VslCase {
  id: string;
  kind: "case_study" | "testimonial";
  title: string;
  body: string;
  /** Who said it, or whose business it is: "Sarah, owner of Mehfil". */
  person: string;
  /** A Cloudinary link (video or image), or empty for none. */
  media_url: string;
}

export interface VslLinkSection {
  heading: string;
  body: string;
  button: string;
  url: string;
}

export interface VslContent {
  title: string;
  subheading: string;
  video_url: string;
  /** The line beside the stars: "95% client satisfaction rate". */
  proof_headline: string;
  /** The small line under it: "50+ brands helped over the last 2 years". */
  proof_line: string;
  show_stars: boolean;
  form_heading: string;
  logos_heading: string;
  logos: VslLogo[];
  cases_heading: string;
  cases: VslCase[];
  case_cta_text: string;
  case_cta_button: string;
  next: VslLinkSection;
  about: VslLinkSection;
  work: VslLinkSection;
  final_heading: string;
  final_button: string;
}

export const DEFAULT_VSL: VslContent = {
  title: "We build brands people can’t scroll past",
  subheading: "Watch this short video to see how we turn content into customers, then tell us about your business below.",
  video_url: "",
  proof_headline: "95% client satisfaction rate",
  proof_line: "50+ brands helped over the last 2 years",
  show_stars: true,
  form_heading: "Tell us about your business",
  logos_heading: "Who we’ve helped extraordinarily build",
  logos: [],
  cases_heading: "Case studies and testimonials",
  cases: [],
  case_cta_text: "Do you want the same impact for your brand or business?",
  case_cta_button: "Get started",
  next: {
    heading: "What will happen next?",
    body: "Once you send the form, we’ll be in touch within 48 hours to book a discovery call. We’ll get to know your business, show you what we’d do, and you decide if it’s right for you.",
    button: "See what working with us looks like",
    url: "https://www.advatar.co.uk/look-inside",
  },
  about: {
    heading: "Who we are",
    body: "A creative team of strategists, videographers and editors who build brands through content that gets seen.",
    button: "About us",
    url: "https://www.advatar.co.uk/about",
  },
  work: {
    heading: "View more of our work",
    body: "Campaigns, content and results from the brands we work with.",
    button: "See our work",
    url: "https://www.advatar.co.uk/our-work",
  },
  final_heading: "Want to build something special with us?",
  final_button: "Fill in the form",
};

// -----------------------------------------------------------------
// Reading and checking
// -----------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max);
/** Empty, or a web link. Everything shown or linked to is https. */
const link = z
  .string()
  .trim()
  .max(1000)
  .refine((s) => s === "" || /^https:\/\//i.test(s), "Links must start with https://");

const section = z.object({ heading: text(160), body: text(1500), button: text(80), url: link });

const schema = z.object({
  title: text(200),
  subheading: text(600),
  video_url: link,
  proof_headline: text(120),
  proof_line: text(200),
  show_stars: z.boolean(),
  form_heading: text(160),
  logos_heading: text(160),
  logos: z
    .array(
      z.object({
        id: text(60).min(1),
        name: text(120),
        // https, as everywhere; plain http only for a copy running on this computer.
        url: z
          .string()
          .trim()
          .max(1000)
          .refine((s) => /^https:\/\//i.test(s) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(s), "Each logo needs an image"),
      })
    )
    .max(80),
  cases_heading: text(160),
  cases: z
    .array(
      z.object({
        id: text(60).min(1),
        kind: z.enum(["case_study", "testimonial"]),
        title: text(200),
        body: text(4000),
        person: text(160),
        media_url: link,
      })
    )
    .max(40),
  case_cta_text: text(200),
  case_cta_button: text(60),
  next: section,
  about: section,
  work: section,
  final_heading: text(200),
  final_button: text(60),
});

/**
 * A saved row (which may be from an older shape, or missing pieces)
 * laid over the defaults. Anything that fails the rules falls back to
 * the default for that piece rather than taking the page down.
 */
export function readVsl(raw: unknown): VslContent {
  const base: VslContent = JSON.parse(JSON.stringify(DEFAULT_VSL));
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base, ...(raw as Record<string, unknown>) } as Record<string, unknown>;
  for (const key of ["next", "about", "work"] as const) {
    merged[key] = { ...base[key], ...((raw as Record<string, unknown>)[key] as object | undefined) };
  }
  const parsed = schema.safeParse(merged);
  if (parsed.success) return parsed.data;
  // Keep what is valid, piece by piece.
  const out = { ...base } as Record<string, unknown>;
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  for (const key of Object.keys(shape)) {
    const one = shape[key].safeParse(merged[key]);
    if (one.success) out[key] = one.data;
  }
  return out as unknown as VslContent;
}

/** An edit, checked: the content to save, or the first problem in plain words. */
export function checkVsl(raw: unknown): { ok: true; value: VslContent } | { ok: false; error: string } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue.path.join(" → ");
  return { ok: false, error: `${issue.message}${where ? ` (${where})` : ""}` };
}

/** What a case study's link shows: a picture, a video, or nothing. */
export function mediaKind(url: string): "image" | "video" | null {
  const u = url.trim();
  if (!u) return null;
  if (/\/image\/upload\//.test(u) || /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(u)) return "image";
  return "video";
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
