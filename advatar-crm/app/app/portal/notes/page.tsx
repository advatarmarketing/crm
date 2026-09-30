import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNotebook } from "@/lib/notes";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

/**
 * A client's own notes.
 *
 * The same notebook the team has, in the portal's tab row rather than
 * at /app/notes — one way in per role, which is how Calendar, To-do and
 * Uploads already work for clients.
 *
 * Private to the client login that wrote them. Not to the team, not to
 * the CEO: 0032's policies are owner-only for everyone, and the page
 * says so, because a client deserves to know before they write
 * anything down.
 */
export default async function PortalNotesPage({ searchParams }: { searchParams: { note?: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const notebook = await loadNotebook(supabase);

  return (
    <main className="page page-md">
      <h1 className="page-title page-title-accent">Notes</h1>

      {notebook.available ? (
        <NotesWorkspace initial={notebook} openNoteId={searchParams.note ?? null} todoHref="/app/portal/todo" />
      ) : (
        <EmptyState
          title="Notes are nearly ready"
          body="Your team is finishing setting this up. Check back shortly."
        />
      )}
    </main>
  );
}
