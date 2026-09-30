// Structural, for the same reason as lib/submissions.ts — see the
// note there and in lib/supabase/admin.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export interface NoteFolder {
  id: string;
  name: string;
  created_at: string;
}

export interface NoteItem {
  id: string;
  note_id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface Note {
  id: string;
  folder_id: string | null;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  items: NoteItem[];
}

export interface Notebook {
  /**
   * False when 0032 has not been run. The page then explains that
   * rather than showing an empty notebook, which would look like
   * everything anyone had written had vanished.
   */
  available: boolean;
  folders: NoteFolder[];
  notes: Note[];
}

/** A missing table: 42P01 from Postgres, PGRST205 from PostgREST's schema cache. */
function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * Everything in the signed-in person's notebook.
 *
 * No owner filter, and none needed: every policy on these three tables
 * is "owner only" (0032), so the database returns this person's rows
 * and nobody else's whoever is asking — the CEO included. Filtering
 * here as well would suggest the filter is what keeps notes private,
 * and it is not.
 *
 * Notes come back most recently updated first, which is the order the
 * page shows them in. Folders come back alphabetically.
 */
export async function loadNotebook(supabase: QueryableClient): Promise<Notebook> {
  const [folders, notes, items] = await Promise.all([
    supabase.from("note_folders").select("id, name, created_at").order("name"),
    supabase
      .from("notes")
      .select("id, folder_id, title, body, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("note_checklist_items")
      .select("id, note_id, text, done, position")
      .order("position")
      .order("created_at"),
  ]);

  if (isMissingTable(folders.error) || isMissingTable(notes.error) || isMissingTable(items.error)) {
    return { available: false, folders: [], notes: [] };
  }

  const itemsByNote = new Map<string, NoteItem[]>();
  for (const item of (items.data ?? []) as NoteItem[]) {
    const list = itemsByNote.get(item.note_id) ?? [];
    list.push(item);
    itemsByNote.set(item.note_id, list);
  }

  return {
    available: true,
    folders: (folders.data ?? []) as NoteFolder[],
    notes: ((notes.data ?? []) as Omit<Note, "items">[]).map((n) => ({
      ...n,
      items: itemsByNote.get(n.id) ?? [],
    })),
  };
}

export interface NoteTodo {
  id: string;
  note_id: string;
  text: string;
  done: boolean;
  noteTitle: string;
}

/**
 * The to-do items from someone's notes, for their To-do tab.
 *
 * Returns an empty list — never an error — when 0032 has not been
 * run, because the To-do tab is an existing page that works today and
 * must keep working whether or not this feature's migration has been
 * applied yet.
 *
 * Only ever the caller's own: RLS again. The To-do tab only asks for
 * this when someone is looking at their OWN list, but even if it asked
 * while a manager was viewing a colleague's, it would get the
 * manager's items back, not the colleague's.
 */
export async function loadNoteTodos(supabase: QueryableClient): Promise<NoteTodo[]> {
  const [items, notes] = await Promise.all([
    supabase
      .from("note_checklist_items")
      .select("id, note_id, text, done, position")
      .order("position")
      .order("created_at"),
    supabase.from("notes").select("id, title, updated_at").order("updated_at", { ascending: false }),
  ]);

  if (items.error || notes.error) return [];

  const noteRows = (notes.data ?? []) as { id: string; title: string }[];
  const titleById = new Map(noteRows.map((n) => [n.id, n.title]));
  const noteOrder = new Map(noteRows.map((n, i) => [n.id, i]));

  // Grouped by note, most recently updated note first — the same order
  // the Notes tab uses, so a list reads the same in both places.
  return ((items.data ?? []) as NoteItem[])
    .filter((i) => titleById.has(i.note_id))
    .sort((a, b) => (noteOrder.get(a.note_id) ?? 0) - (noteOrder.get(b.note_id) ?? 0))
    .map((i) => ({
      id: i.id,
      note_id: i.note_id,
      text: i.text,
      done: i.done,
      noteTitle: titleById.get(i.note_id) ?? "Untitled note",
    }));
}

/**
 * "26 Sep 2026, 14:05", in UK time.
 *
 * The time zone is fixed rather than left to the device on purpose.
 * These strings are rendered on the server (UTC on Vercel) and again
 * in the browser, and without a fixed zone the two disagree for half
 * the year, which React reports as a hydration error and which a
 * person sees as a note's time jumping by an hour on load.
 */
export function formatNoteTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Turns a block of text into to-do items: one per non-empty line, with
 * any bullet, dash, checkbox or number the line started with removed.
 *
 * So pasting
 *     - Book drone permit
 *     [ ] Charge batteries
 *     3. Send call sheet
 * gives three clean items rather than three items that each begin with
 * a stray "- " or "[ ]".
 */
export function linesToItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•–]|\[\s?[xX]?\s?\]|\d+[.)])\s*/, "")
        .trim()
    )
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, 500));
}
