import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortfolioGallery, type PortfolioItem } from "@/components/PortfolioGallery";
import { PortfolioItemsPanel, type ManualPortfolioItem } from "@/components/PortfolioItemsPanel";
import { loadSubmissions } from "@/lib/submissions";
import { StatTile } from "@/components/StatTile";
import type { ClientChoice } from "@/components/SchedulePanel";

export const dynamic = "force-dynamic";

/**
 * Everything this videographer has finished.
 *
 * Two sources, one gallery:
 *   - approved submissions (0020), which arrive here on their own the
 *     moment a reviewer signs them off;
 *   - items added by hand (`portfolio_items`, 0025) — older work, a
 *     showreel, something shot before this CRM existed.
 *
 * They're kept apart in the database on purpose. Work added by hand
 * never went through review, and writing it in as an approved
 * submission would be a lie the rest of the app would then believe.
 * The gallery marks them so a reader can tell the difference.
 */
export default async function MyPortfolioPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [submissions, { data: manual }, { data: clients }] = await Promise.all([
    loadSubmissions(supabase, { createdBy: user.id }),
    supabase
      .from("portfolio_items")
      .select("id, title, url, client_id, client_label, completed_on, notes")
      .eq("owner_id", user.id)
      .order("completed_on", { ascending: false, nullsFirst: false }),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const approved = submissions.filter((s) => s.status === "approved");

  const clientChoices: ClientChoice[] = ((clients ?? []) as unknown as { id: string; name: string }[]).map(
    (c) => ({ id: c.id, name: c.name })
  );
  const clientNameById = new Map(clientChoices.map((c) => [c.id, c.name]));

  const manualItems = (manual ?? []) as unknown as ManualPortfolioItem[];

  const fromSubmissions: PortfolioItem[] = approved.map((s) => {
    // The approved cut is the newest version — loadSubmissions
    // returns versions newest first.
    const finalCut = s.versions[0];
    return {
      id: s.id,
      title: s.title,
      clientId: s.client_id,
      clientName: s.clientName ?? null,
      url: finalCut?.url ?? null,
      version: s.current_version,
      // When it was approved isn't stored separately; the last
      // version submitted is the closest honest answer, and it's what
      // "when did I finish this" means in practice.
      completedAt: finalCut?.created_at ?? s.created_at,
      revisions: s.versions.length,
      source: "submission",
    };
  });

  const fromManual: PortfolioItem[] = manualItems.map((m) => ({
    id: m.id,
    title: m.title,
    clientId: m.client_id,
    clientName: m.client_id ? clientNameById.get(m.client_id) ?? null : m.client_label,
    url: m.url,
    version: 1,
    // No date given means it sorts as the oldest thing here rather
    // than jumping to the top of the gallery.
    completedAt: m.completed_on ?? "1970-01-01",
    revisions: 1,
    source: "manual",
    notes: m.notes,
  }));

  const items = [...fromSubmissions, ...fromManual];

  const clientCount = new Set(items.map((i) => i.clientName ?? "—")).size;
  const thisYear = items.filter(
    (i) => new Date(i.completedAt).getFullYear() === new Date().getFullYear()
  ).length;

  return (
    <main className="page">
      <h1 className="page-title page-title-accent">My Portfolio</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px", maxWidth: "60ch" }}>
        Every video you&rsquo;ve had approved, plus anything you&rsquo;ve added
        yourself. Work still in review appears here once it&rsquo;s signed off.
      </p>

      {items.length > 0 && (
        <div className="stat-row">
          <StatTile label="Videos completed" value={String(items.length)} tone="accent" hint="all time" />
          <StatTile label="This year" value={String(thisYear)} />
          <StatTile label="Clients worked with" value={String(clientCount)} />
        </div>
      )}

      <PortfolioGallery items={items} />

      <section className="section" style={{ marginTop: 40, maxWidth: 780 }}>
        <div className="section-head">
          <h2 className="section-title">Added by you</h2>
          <p className="section-sub">Older work, showreels, anything not submitted through the CRM</p>
        </div>
        <PortfolioItemsPanel initialItems={manualItems} clients={clientChoices} />
      </section>
    </main>
  );
}
