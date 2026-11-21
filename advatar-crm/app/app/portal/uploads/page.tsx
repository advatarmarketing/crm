import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAssets } from "@/lib/uploads";
import { AssetsPanel } from "@/components/uploads/AssetsPanel";
import { MarkSectionSeen } from "@/components/NavBadge";
import { FILE_SECTIONS, documentSection, isFileSection } from "@/lib/files";
import { DocumentsList } from "@/components/DocumentsList";

export const dynamic = "force-dynamic";

function SectionIcon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * The client's Files.
 *
 * Five sections — Assets, Raw Footage, Invoices, Proposals, Contracts.
 * Nothing opens on its own: the client lands on a grid of the five and
 * picks one. Once a section is open, all five sit along the top as tabs
 * so they can move between them, with a way back to the grid.
 *
 * The section lives in the address (?section=…) so the browser's back
 * button and a shared link both do what they look like they'll do.
 *
 * Videos are not here any more; they have their own tab. Documents
 * shared through the older Documents tab (the `documents` table, which
 * the team's Documents section still writes to) are shown here too, in
 * the section their name points to, so that tab could go.
 * `client_assets` RLS shows the client only what was shared with them.
 */
export default async function PortalFilesPage({ searchParams }: { searchParams: { section?: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).maybeSingle();
  const clientId = (profile as { client_id?: string | null } | null)?.client_id ?? null;
  if (!clientId) return null; // see PortalLayout

  const [{ assets, problem }, { data: docRows }] = await Promise.all([
    loadAssets(supabase, { clientId }),
    supabase.from("documents").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const documents = ((docRows ?? []) as any[]).map((d) => ({ ...d, section: documentSection(d) }));
  const open = isFileSection(searchParams.section) ? searchParams.section : null;
  const count = (id: string) => assets.filter((a) => a.section === id).length + documents.filter((d) => d.section === id).length;
  const docsHere = open ? documents.filter((d) => d.section === open) : [];

  return (
    <main className="page page-xs files-page">
      <MarkSectionSeen prefix="/app/portal/uploads" />

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 8px" }}>Files</h1>

      {!open ? (
        <>
          <p className="files-lede">Everything we&rsquo;ve shared with you, in one place. Choose a section to open it.</p>
          <div className="files-grid" data-tour="files-grid">
            {FILE_SECTIONS.map((s) => {
              const n = count(s.id);
              return (
                <Link key={s.id} href={`/app/portal/uploads?section=${s.id}`} className="files-card">
                  <span className="files-card-icon">
                    <SectionIcon d={s.icon} />
                  </span>
                  <span className="files-card-name">{s.label}</span>
                  <span className="files-card-count">
                    {n === 0 ? "No files yet" : n === 1 ? "1 file" : `${n} files`}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="files-bar">
            <Link href="/app/portal/uploads" className="files-back" aria-label="Back to all sections">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              All files
            </Link>
            <nav className="files-tabs" aria-label="Files sections">
              {FILE_SECTIONS.map((s) => (
                <Link
                  key={s.id}
                  href={`/app/portal/uploads?section=${s.id}`}
                  className="files-tab"
                  aria-current={s.id === open ? "page" : undefined}
                >
                  <SectionIcon d={s.icon} size={15} />
                  {s.label}
                  <span className="files-tab-n">{count(s.id)}</span>
                </Link>
              ))}
            </nav>
          </div>

          <p className="files-lede">{FILE_SECTIONS.find((s) => s.id === open)!.blurb}</p>

          {docsHere.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <DocumentsList key={`docs-${open}`} initialDocuments={docsHere} editable={false} />
            </div>
          )}

          <AssetsPanel
            key={open}
            assets={assets}
            clients={[]}
            currentUserId={user.id}
            isClient
            fixedClientId={clientId}
            canShare={false}
            problem={problem}
            section={open}
          />
        </>
      )}
    </main>
  );
}
