import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortfolioGallery, type PortfolioItem } from "@/components/PortfolioGallery";
import { loadSubmissions } from "@/lib/submissions";
import { StatTile } from "@/components/StatTile";

export const dynamic = "force-dynamic";

/**
 * Everything this videographer has had approved.
 *
 * Built from the submissions in 0020 rather than a separate portfolio
 * table: a finished video is an approved submission, and keeping one
 * source means nothing has to be copied across or kept in step.
 *
 * Only `approved` counts. Work still in review isn't finished, and a
 * portfolio that quietly included rejected cuts would be worse than
 * useless when someone is showing it to a prospective client.
 */
export default async function MyPortfolioPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const submissions = await loadSubmissions(supabase, { createdBy: user.id });
  const approved = submissions.filter((s) => s.status === "approved");

  const items: PortfolioItem[] = approved.map((s) => {
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
    };
  });

  const clientCount = new Set(items.map((i) => i.clientName ?? "—")).size;
  const thisYear = items.filter(
    (i) => new Date(i.completedAt).getFullYear() === new Date().getFullYear()
  ).length;

  return (
    <main className="page">
      <h1 className="page-title page-title-accent">My Portfolio</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px" }}>
        Every video you&rsquo;ve had approved. Work still in review appears here
        once it&rsquo;s signed off.
      </p>

      {items.length > 0 && (
        <div className="stat-row">
          <StatTile label="Videos completed" value={String(items.length)} tone="accent" hint="all time" />
          <StatTile label="This year" value={String(thisYear)} />
          <StatTile label="Clients worked with" value={String(clientCount)} />
        </div>
      )}

      <PortfolioGallery items={items} />
    </main>
  );
}
