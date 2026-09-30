import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNotebook } from "@/lib/notes";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

/**
 * Notes, for everyone on the team: CEO, operations managers, staff and
 * videographers. Clients have the same thing at /app/portal/notes,
 * inside their own tab row.
 *
 * One page for four roles because it is the same notebook for all of
 * them — private to its owner (0032), so there is no management view
 * of it to build and nothing that differs by role.
 */
export default async function NotesPage({ searchParams }: { searchParams: { note?: string } }) {
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
        <NotesWorkspace initial={notebook} openNoteId={searchParams.note ?? null} todoHref="/app/todo" />
      ) : (
        <EmptyState
          title="Notes aren’t switched on yet"
          body="This needs one database update (migration 0032) before notes can be saved. Nothing has been lost — there is nothing here yet to lose."
        />
      )}
    </main>
  );
}
