import type { PlannerContent } from "@/lib/planner/content";

/**
 * What is still missing for a client, worked out from what is saved
 * rather than remembered from the day they were added. The same list
 * shows on the review step when a client is added from a meeting and
 * on the client's page afterwards, shrinking as the team fills it in.
 */

export interface Gap {
  /** Short name of the missing thing, e.g. "Fonts". */
  label: string;
  /** Where to fix it. */
  where: "info" | "package" | "plan" | "logins";
  /** Plan section to open, for "plan". */
  section?: string;
}

const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";

export interface ClientBasics {
  contact_name: string | null;
  contact_email: string | null;
}

export function planGaps(content: PlannerContent | null): Gap[] {
  if (!content) return [{ label: "Content plan", where: "plan" }];
  const gaps: Gap[] = [];

  if (!content.logoUrl) gaps.push({ label: "Logo", where: "plan", section: "overview" });
  for (const row of content.branding?.rows ?? []) {
    if (blank(row.value)) gaps.push({ label: row.label.replace(/\s*\(.*\)$/, ""), where: "plan", section: "branding" });
  }
  if (blank(content.thesis?.quote)) gaps.push({ label: "The standard this account is built on", where: "plan", section: "overview" });
  if (blank(content.overview?.desc)) gaps.push({ label: "What this account is for", where: "plan", section: "overview" });

  const pillars = (content.pillars?.items ?? []).filter((p) => !blank(p.name));
  if (pillars.length === 0) gaps.push({ label: "Content pillars", where: "plan", section: "pillars" });
  else if (pillars.reduce((n, p) => n + (Number(p.pct) || 0), 0) !== 100)
    gaps.push({ label: "Pillar shares (they should add up to 100%)", where: "plan", section: "pillars" });

  if ((content.format?.stats ?? []).some((s) => blank(s.value))) gaps.push({ label: "Format mix", where: "plan", section: "format" });
  if ((content.workflow?.steps ?? []).every((s) => blank(s.title))) gaps.push({ label: "Weekly workflow", where: "plan", section: "workflow" });
  if ((content.metrics?.items ?? []).every((m) => blank(m.label))) gaps.push({ label: "Metrics to track", where: "plan", section: "metrics" });
  if ((content.competitors?.links ?? []).every((l) => blank(l.title))) gaps.push({ label: "Competitors to study", where: "plan", section: "competitors" });
  if ((content.timeline?.items ?? []).every((t) => blank(t.title))) gaps.push({ label: "Client timeline", where: "plan", section: "timeline" });
  if (blank(content.guarantee?.body)) gaps.push({ label: "Our guarantee", where: "plan", section: "guarantee" });

  return gaps;
}

export function clientGaps(basics: ClientBasics, hasPackage: boolean, hasLogin: boolean): Gap[] {
  const gaps: Gap[] = [];
  if (!hasPackage) gaps.push({ label: "Package", where: "package" });
  if (blank(basics.contact_name)) gaps.push({ label: "Contact name", where: "info" });
  if (blank(basics.contact_email)) gaps.push({ label: "Contact email", where: "info" });
  if (!hasLogin) gaps.push({ label: "The client's portal login", where: "logins" });
  return gaps;
}
