import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNotebook } from "@/lib/notes";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { EmptyState } from "@/components/EmptyState";
import type { ProfileRole } from "@/lib/supabase/types";
import type { ClientChoice } from "@/components/SchedulePanel";

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

  // Which clients this person may attach a folder to is decided by
  // `clients`' own RLS, not here: a videographer gets the ones they
  // are assigned, the CEO gets all of them. An empty list simply
  // means the control has nothing to offer and hides itself.
  const [notebook, { data: clients }] = await Promise.all([
    loadNotebook(supabase),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: ProfileRole } | null)?.role;

  const clientChoices: ClientChoice[] = ((clients ?? []) as unknown as { id: string; name: string | null }[]).map(
    (c) => ({ id: c.id, name: c.name?.trim() || "Untitled client" })
  );

  // A videographer's client pages live under /app/my-clients; the
  // team's under /app/clients. Linking everyone to the same place
  // would bounce half of them off middleware and back to their
  // dashboard.
  const clientHrefBase = role === "videographer" ? "/app/my-clients" : "/app/clients";

  return (
    <main className="page page-md">
      <h1 className="page-title page-title-accent">Notes</h1>

      {notebook.available ? (
        <NotesWorkspace
          initial={notebook}
          openNoteId={searchParams.note ?? null}
          todoHref="/app/todo"
          clients={clientChoices}
          clientHrefBase={clientHrefBase}
        />
      ) : (
        <EmptyState
          title="Notes aren’t switched on yet"
          body="This needs one database update (migration 0032) before notes can be saved. Nothing has been lost — there is nothing here yet to lose."
        />
      )}
    </main>
  );
}
