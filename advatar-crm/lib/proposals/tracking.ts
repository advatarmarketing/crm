import { type PackageId, type ProposalContent } from "./content";
import { slidesFor } from "./pricing";

/**
 * Turns a proposal's tracking events (0057) into what the team wants to
 * know: did they read it all, which packages, where did they spend
 * their time, what did they open and tick.
 */

export interface TrackRow {
  session_id: string;
  kind: string;
  slide: string | null;
  package: string | null;
  ms: number | null;
  detail: Record<string, unknown> | null;
  at: string;
}

export interface Report {
  opened: boolean;
  visits: number;
  firstAt: string | null;
  lastAt: string | null;
  devices: string[];
  totalMs: number;
  /** Pages in the order of the package they looked at most, with time on each. */
  pages: { id: string; label: string; ms: number; seen: boolean }[];
  topPage: string | null;
  packages: { id: string; label: string; ms: number; picked: boolean }[];
  readAll: boolean;
  /** How many of the package's pages they reached. */
  progress: { seen: number; of: number; packageLabel: string };
  reachedEnd: boolean;
  breakdowns: string[];
  extras: { label: string; qty: number }[];
  plans: string[];
  contract: { opened: boolean; ms: number };
  letsGo: boolean;
  method: string | null;
}

export function buildReport(content: ProposalContent, rows: TrackRow[]): Report {
  const label = (id: string | null) => {
    if (!id) return "";
    if (id === "packages") return "Packages";
    if (id === "summary") return "Summary & total";
    return content.slides.find((s) => s.id === id)?.title ?? id;
  };
  const pkgLabel = (id: string | null) => content.packages.find((p) => p.id === id)?.name ?? id ?? "";

  const sessions = new Set(rows.map((r) => r.session_id));
  const devices = new Set<string>();
  const pageMs = new Map<string, number>();
  const pkgMs = new Map<string, number>();
  const pkgPicked = new Set<string>();
  const breakdowns = new Set<string>();
  const extras = new Map<string, number>();
  const plans = new Set<string>();
  let contractMs = 0;
  let contractOpened = false;
  let letsGo = false;
  let method: string | null = null;

  for (const r of rows) {
    if (r.kind === "open" && typeof r.detail?.device === "string") devices.add(r.detail.device as string);
    if (r.kind === "slide" && r.slide) {
      pageMs.set(r.slide, (pageMs.get(r.slide) ?? 0) + (r.ms ?? 0));
      if (r.package) pkgMs.set(r.package, (pkgMs.get(r.package) ?? 0) + (r.ms ?? 0));
    }
    if (r.kind === "package" && r.package) pkgPicked.add(r.package);
    if (r.kind === "breakdown" && r.slide) breakdowns.add(r.slide);
    if (r.kind === "extra" && r.slide && typeof r.detail?.extra === "string") {
      const s = content.slides.find((x) => x.id === r.slide);
      const x = s?.extras.find((e) => e.id === r.detail!.extra);
      extras.set(x?.label ?? String(r.detail.extra), Number(r.detail.qty ?? 0));
    }
    if (r.kind === "plan" && typeof r.detail?.plan === "string") plans.add(r.detail.plan as string);
    if (r.kind === "contract") {
      contractOpened = true;
      contractMs += r.ms ?? 0;
    }
    if (r.kind === "lets_go") letsGo = true;
    if (r.kind === "method" && typeof r.detail?.method === "string") method = r.detail.method as string;
  }

  // The package they spent longest on decides the page order shown.
  const ranked = [...pkgMs.entries()].sort((a, b) => b[1] - a[1]);
  const mainPkg = (ranked[0]?.[0] as PackageId | undefined) ?? content.defaultPackage;
  const order = ["packages", ...slidesFor(content, mainPkg).map((s) => s.id), "summary"];
  for (const id of pageMs.keys()) if (!order.includes(id)) order.splice(order.length - 1, 0, id);
  const pages = order.map((id) => ({ id, label: label(id), ms: pageMs.get(id) ?? 0, seen: pageMs.has(id) }));
  const top = [...pages].filter((p) => p.ms > 0).sort((a, b) => b.ms - a.ms)[0] ?? null;

  const mustSee = slidesFor(content, mainPkg).map((s) => s.id);
  const seenCount = mustSee.filter((id) => pageMs.has(id)).length;

  const looked = new Set<string>([...pkgMs.keys(), ...pkgPicked]);
  const packages = content.packages
    .filter((p) => p.enabled || looked.has(p.id))
    .map((p) => ({ id: p.id, label: p.name, ms: pkgMs.get(p.id) ?? 0, picked: looked.has(p.id) }));

  const times = rows.map((r) => r.at).sort();
  return {
    opened: rows.some((r) => r.kind === "open"),
    visits: sessions.size,
    firstAt: times[0] ?? null,
    lastAt: times[times.length - 1] ?? null,
    devices: [...devices],
    totalMs: [...pageMs.values()].reduce((a, b) => a + b, 0),
    pages,
    topPage: top?.label ?? null,
    packages,
    readAll: mustSee.length > 0 && seenCount === mustSee.length && pageMs.has("summary"),
    progress: { seen: seenCount, of: mustSee.length, packageLabel: pkgLabel(mainPkg) },
    reachedEnd: pageMs.has("summary"),
    breakdowns: [...breakdowns].map(label),
    extras: [...extras.entries()].filter(([, q]) => q > 0).map(([l, q]) => ({ label: l, qty: q })),
    plans: [...plans],
    contract: { opened: contractOpened, ms: contractMs },
    letsGo,
    method,
  };
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
