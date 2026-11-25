/**
 * Proposals (0057): which slides a package shows, and what it costs.
 *
 * The same functions run in the browser (to show the numbers as the
 * client ticks extras) and on the server (to charge them). The server
 * never trusts a number sent from the page: it recalculates from the
 * saved proposal and the client's choice.
 */

import { GROUPS, PACKAGE_IDS, type Choice, type Extra, type Group, type Line, type PackageId, type ProposalContent, type Slide } from "./content";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function linePrice(line: Pick<Line, "mode" | "unit">, qty: number, rate: number): number {
  if (!(qty > 0)) return 0;
  return round2(line.mode === "hours" ? qty * line.unit * rate : qty * line.unit);
}

/** Is this priced slide part of the package? */
function pricedIn(slide: Slide, pkg: PackageId): boolean {
  return slide.enabled && slide.kind === "priced" && slide.lines.some((l) => (l.qty[pkg] ?? 0) > 0);
}

/**
 * The slides this package shows, in order. Topic slides show when
 * anything they introduce does (the High Quality Visuals one always).
 */
export function slidesFor(content: ProposalContent, pkg: PackageId): Slide[] {
  return content.slides.filter((s) => {
    if (!s.enabled) return false;
    if (s.kind === "priced") return pricedIn(s, pkg);
    if (s.group === "visuals") return true;
    return content.slides.some((o) => o.group === s.group && pricedIn(o, pkg));
  });
}

export function enabledPackages(content: ProposalContent) {
  const on = content.packages.filter((p) => p.enabled && PACKAGE_IDS.includes(p.id));
  return on.length ? on : content.packages.slice(0, 1);
}

export function extraKey(slide: Slide, extra: Extra) {
  return `${slide.id}:${extra.id}`;
}

export interface PricedLine {
  label: string;
  /** e.g. "8 videos x 2 hrs x £35" */
  sum: string;
  price: number;
  extra: boolean;
}

export interface SlidePrice {
  slide: Slide;
  lines: PricedLine[];
  subtotal: number;
  budget: number | null;
}

export interface Totals {
  slides: SlidePrice[];
  groups: { id: Group; label: string; subtotal: number; slides: SlidePrice[] }[];
  monthly: number;
  upfront: number;
  upfrontSaving: number;
  /** What's charged now for the chosen plan. */
  dueNow: number;
  budgetTotal: number;
}

export function money(n: number): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

function plural(word: string, n: number) {
  if (n === 1) return word;
  return /s$/.test(word) ? word : word + "s";
}

function sumText(mode: "hours" | "fixed", qty: number, unit: number, unitLabel: string, rate: number): string {
  if (mode === "fixed") return `${qty} ${plural(unitLabel, qty)} × ${money(unit)}`;
  if (unitLabel === "hour" && unit === 1) return `${qty} ${plural("hr", qty)} × ${money(rate)}`;
  return `${qty} ${plural(unitLabel, qty)} × ${unit} ${plural("hr", unit)} × ${money(rate)}`;
}

/** The price of one slide for a package, with any extras ticked. */
export function priceSlide(content: ProposalContent, slide: Slide, pkg: PackageId, extras: Record<string, number>): SlidePrice {
  const lines: PricedLine[] = [];
  for (const l of slide.lines) {
    const qty = l.qty[pkg] ?? 0;
    if (qty > 0) lines.push({ label: l.label, sum: sumText(l.mode, qty, l.unit, l.unitLabel, content.rate), price: linePrice(l, qty, content.rate), extra: false });
  }
  for (const x of slide.extras) {
    const qty = clampQty(extras[extraKey(slide, x)], x.max);
    if (qty > 0) lines.push({ label: x.label, sum: sumText(x.mode, qty, x.unit, x.unitLabel, content.rate), price: linePrice(x, qty, content.rate), extra: true });
  }
  return {
    slide,
    lines,
    subtotal: round2(lines.reduce((a, l) => a + l.price, 0)),
    budget: slide.budget ? slide.budget[pkg] || null : null,
  };
}

export function clampQty(v: unknown, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, Math.max(0, max));
}

export function totals(content: ProposalContent, choice: Choice): Totals {
  const slides = slidesFor(content, choice.package)
    .filter((s) => s.kind === "priced")
    .map((s) => priceSlide(content, s, choice.package, choice.extras));
  const monthly = round2(slides.reduce((a, s) => a + s.subtotal, 0));
  const discount = Math.min(Math.max(content.discountPct, 0), 90) / 100;
  const upfront = Math.round(monthly * 3 * (1 - discount) * 100) / 100;
  return {
    slides,
    groups: GROUPS.map((g) => {
      const mine = slides.filter((s) => s.slide.group === g.id);
      return { id: g.id, label: g.label, slides: mine, subtotal: round2(mine.reduce((a, s) => a + s.subtotal, 0)) };
    }),
    monthly,
    upfront,
    upfrontSaving: round2(monthly * 3 - upfront),
    dueNow: choice.plan === "upfront" ? upfront : monthly,
    budgetTotal: slides.reduce((a, s) => a + (s.budget ?? 0), 0),
  };
}

/** Only the extras that exist on slides this package shows, within their limits. */
export function cleanChoice(content: ProposalContent, raw: Partial<Choice> | null | undefined): Choice {
  const pkgs = enabledPackages(content).map((p) => p.id);
  const pkg = raw?.package && pkgs.includes(raw.package) ? raw.package : pkgs.includes(content.defaultPackage) ? content.defaultPackage : pkgs[0];
  const extras: Record<string, number> = {};
  for (const s of slidesFor(content, pkg)) {
    for (const x of s.extras) {
      const k = extraKey(s, x);
      const n = clampQty(raw?.extras?.[k], x.max);
      if (n > 0) extras[k] = n;
    }
  }
  return { package: pkg, plan: raw?.plan === "upfront" ? "upfront" : "monthly", extras };
}

/** The breakdown as plain text, for the contract and emails. */
export function breakdownText(t: Totals): string {
  return t.slides
    .map((s) => `- ${s.slide.title}: ${money(s.subtotal)} a month\n${s.lines.map((l) => `    ${l.label} (${l.sum}) ${money(l.price)}`).join("\n")}`)
    .join("\n");
}

export function planText(content: ProposalContent, t: Totals, plan: Choice["plan"]): string {
  return plan === "upfront"
    ? `Paid upfront for 3 months: ${money(t.upfront)} (${content.discountPct}% off ${money(t.monthly * 3)}). After 3 months it continues at ${money(t.monthly)} a month unless either side gives notice.`
    : `Paid monthly: ${money(t.monthly)} a month.`;
}

/** Fills {{placeholders}}. Unknown ones are left as they are. */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in values ? values[k] : m));
}

export function contractText(
  content: ProposalContent,
  choice: Choice,
  who: { business: string; contact: string | null; email: string | null },
  when = new Date()
): string {
  const t = totals(content, choice);
  const pkg = content.packages.find((p) => p.id === choice.package)?.name ?? choice.package;
  return fill(content.contract, {
    business: who.business,
    contact: who.contact || who.business,
    email: who.email || "email to be confirmed",
    date: when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    package: pkg,
    breakdown: breakdownText(t),
    monthly: money(t.monthly),
    total: money(t.dueNow),
    plan: planText(content, t, choice.plan),
  });
}
