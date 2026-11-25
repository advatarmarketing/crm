import { z } from "zod";
import { ICONS, PACKAGE_IDS, type ProposalContent } from "./content";

/**
 * Checks a proposal sent from the editor before it's saved, so a
 * broken one can never reach a client. Limits are generous; they only
 * stop nonsense (negative hours, a novel in a caption).
 */

const pkgId = z.enum(PACKAGE_IDS as [string, ...string[]]);
const text = (max: number) => z.string().max(max);
const num = (max: number) => z.number().finite().min(0).max(max);
const perPackage = (max: number) => z.object({ essentials: num(max), growth: num(max), accelerator: num(max) });

const media = z.object({
  url: z
    .string()
    .max(2000)
    .refine((u) => u === "" || /^https:\/\/[^\s]+$/i.test(u), "Media links must start with https://"),
  caption: text(200),
});

const line = z.object({
  id: text(60).min(1),
  label: text(160).min(1),
  mode: z.enum(["hours", "fixed"]),
  unit: num(100000),
  unitLabel: text(30).min(1),
  qty: perPackage(1000),
});

const extra = z.object({
  id: text(60).min(1),
  label: text(160).min(1),
  mode: z.enum(["hours", "fixed"]),
  unit: num(100000),
  unitLabel: text(30).min(1),
  max: num(100),
});

const slide = z.object({
  id: text(60).min(1),
  kind: z.enum(["topic", "priced"]),
  group: z.enum(["visuals", "ads", "influencer"]),
  enabled: z.boolean(),
  short: text(80),
  kicker: text(80),
  title: text(160),
  headlines: z.array(text(200)).max(8),
  media: z.array(media).max(16),
  points: z.array(z.object({ icon: z.enum(ICONS as [string, ...string[]]), label: text(80) })).max(12),
  lines: z.array(line).max(20),
  extras: z.array(extra).max(12),
  budget: perPackage(1000000).nullable().optional(),
  note: text(400).optional(),
});

export const contentSchema = z.object({
  v: z.literal(1),
  rate: num(10000),
  discountPct: num(90),
  defaultPackage: pkgId,
  packages: z
    .array(z.object({ id: pkgId, name: text(40).min(1), tagline: text(160), enabled: z.boolean() }))
    .length(3),
  intro: z.object({ kicker: text(80), title: text(160), subtitle: text(300) }),
  slides: z.array(slide).max(30),
  summary: z.object({ title: text(120), subtitle: text(300) }),
  contract: text(30000),
});

export function parseContent(raw: unknown): { ok: true; content: ProposalContent } | { ok: false; error: string } {
  const r = contentSchema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `${first.path.join(" › ") || "Proposal"}: ${first.message}` };
  }
  const c = r.data as ProposalContent;
  if (!c.packages.some((p) => p.enabled)) return { ok: false, error: "Switch on at least one package." };
  if (!c.packages.find((p) => p.id === c.defaultPackage)?.enabled) return { ok: false, error: "The package shown first has to be switched on." };
  const ids = new Set<string>();
  for (const s of c.slides) {
    if (ids.has(s.id)) return { ok: false, error: `Two slides share the id "${s.id}".` };
    ids.add(s.id);
  }
  return { ok: true, content: c };
}
