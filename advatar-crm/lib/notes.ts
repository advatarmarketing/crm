// Structural, for the same reason as lib/submissions.ts — see the
// note there and in lib/supabase/admin.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

/** The eight label colours. Null means no label. See 0035. */
export const NOTE_COLOURS = [
  "red",
  "orange",
  "gold",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;

export type NoteColour = (typeof NOTE_COLOURS)[number];

export function isNoteColour(value: unknown): value is NoteColour {
  return typeof value === "string" && (NOTE_COLOURS as readonly string[]).includes(value);
}

export interface NoteFolder {
  id: string;
  name: string;
  created_at: string;
  /** Null for a top-level folder. Folders go two levels deep (0035). */
  parent_id: string | null;
  color: NoteColour | null;
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
  color: NoteColour | null;
  /**
   * "plain" for everything written before 0035, "html" for anything
   * saved since. A plain note keeps its line breaks and is never
   * reflowed as markup; it becomes html the next time it is edited.
   */
  body_format: "plain" | "html";
}

export interface Notebook {
  /**
   * False when 0032 has not been run. The page then explains that
   * rather than showing an empty notebook, which would look like
   * everything anyone had written had vanished.
   */
  available: boolean;
  /**
   * False when 0035 has not been run. Subfolders, colour labels and
   * rich text are then hidden rather than offered and refused — the
   * rest of the notebook works exactly as it did before.
   */
  richAvailable: boolean;
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
  const [folders, notes, items, extras] = await Promise.all([
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
    // 0035's columns, asked for separately and allowed to fail.
    //
    // Not folded into the two queries above for the reason set out at
    // length in lib/profile-fields.ts: PostgREST rejects the WHOLE
    // query over one unknown column, so a single select naming
    // parent_id would empty somebody's entire notebook on a database
    // that has not run 0035 yet. Here, that same database simply has
    // no subfolders and no colours, and every note still opens.
    loadNoteExtras(supabase),
  ]);

  if (isMissingTable(folders.error) || isMissingTable(notes.error) || isMissingTable(items.error)) {
    return { available: false, richAvailable: false, folders: [], notes: [] };
  }

  const itemsByNote = new Map<string, NoteItem[]>();
  for (const item of (items.data ?? []) as NoteItem[]) {
    const list = itemsByNote.get(item.note_id) ?? [];
    list.push(item);
    itemsByNote.set(item.note_id, list);
  }

  return {
    available: true,
    richAvailable: extras.available,
    folders: ((folders.data ?? []) as { id: string; name: string; created_at: string }[]).map((f) => ({
      ...f,
      parent_id: extras.folders.get(f.id)?.parent_id ?? null,
      color: extras.folders.get(f.id)?.color ?? null,
    })),
    notes: (
      (notes.data ?? []) as Omit<Note, "items" | "color" | "body_format">[]
    ).map((n) => ({
      ...n,
      items: itemsByNote.get(n.id) ?? [],
      color: extras.notes.get(n.id)?.color ?? null,
      // Without 0035 there is no column to read, and every note that
      // exists was written as plain text — which is exactly what this
      // default says.
      body_format: extras.notes.get(n.id)?.body_format ?? "plain",
    })),
  };
}

interface NoteExtras {
  /** False when either column set is missing, i.e. 0035 is not run. */
  available: boolean;
  folders: Map<string, { parent_id: string | null; color: NoteColour | null }>;
  notes: Map<string, { color: NoteColour | null; body_format: "plain" | "html" }>;
}

/** 0035's columns, or empty maps on a database that has not run it. */
async function loadNoteExtras(supabase: QueryableClient): Promise<NoteExtras> {
  const empty: NoteExtras = { available: false, folders: new Map(), notes: new Map() };

  const [f, n] = await Promise.all([
    supabase.from("note_folders").select("id, parent_id, color"),
    supabase.from("notes").select("id, color, body_format"),
  ]);

  empty.available = !f.error && !n.error;

  if (!f.error) {
    for (const row of (f.data ?? []) as { id: string; parent_id: string | null; color: string | null }[]) {
      empty.folders.set(row.id, {
        parent_id: row.parent_id ?? null,
        color: isNoteColour(row.color) ? row.color : null,
      });
    }
  }

  if (!n.error) {
    for (const row of (n.data ?? []) as { id: string; color: string | null; body_format: string | null }[]) {
      empty.notes.set(row.id, {
        color: isNoteColour(row.color) ? row.color : null,
        body_format: row.body_format === "html" ? "html" : "plain",
      });
    }
  }

  return empty;
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

// =================================================================
// Rich text
// =================================================================

/**
 * The only tags a note body may contain.
 *
 * Short on purpose. Bold, italic and underline were what was asked
 * for; lists and line breaks are what typing them produces. Nothing
 * here can load anything, run anything, or point anywhere — there is
 * no img, no a, no style, no span, and no attribute of any kind
 * survives, so there is no src, href, style or on* to go wrong.
 */
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "br", "p", "div", "ul", "ol", "li"]);

/** Tags that stand on their own and must not be given a closing half. */
const VOID_TAGS = new Set(["br"]);

/**
 * Escapes text that sits between tags.
 *
 * `&` is only escaped when it is not already the start of an entity,
 * because a contenteditable produces `&nbsp;` constantly and escaping
 * that again would show the reader the literal letters "&nbsp;".
 */
function escapeText(text: string): string {
  return text
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Makes a stored note body safe to render.
 *
 * Written without the DOM so it gives the same answer on the server
 * and in the browser — this runs during server rendering too, and a
 * sanitiser that only worked in one of those would be worse than
 * none, because it would look like it was working.
 *
 * The approach is allowlist-only and tag-by-tag: a tag that is not in
 * the list is dropped entirely while its text is kept, and a tag that
 * is in the list is re-emitted with no attributes at all. Anything
 * between tags is escaped, so a stray "<" in "5 < 6" cannot open a
 * tag that was never there.
 *
 * These notes are owner-only at the database level, so in practice a
 * person can only do this to themselves. That is not a reason to skip
 * it: bodies can also arrive by paste from anywhere on the web, and
 * "only you can hurt you" stops being true the moment a note is ever
 * shown somewhere else.
 */
export function sanitizeNoteHtml(html: string): string {
  if (!html) return "";

  // Comments first: they can hide a tag from a naive tag scanner.
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");

  const tag = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let out = "";
  let last = 0;
  let match = tag.exec(withoutComments);

  while (match) {
    out += escapeText(withoutComments.slice(last, match.index));

    const name = match[1].toLowerCase();
    if (ALLOWED_TAGS.has(name)) {
      const closing = match[0].startsWith("</");
      if (VOID_TAGS.has(name)) {
        if (!closing) out += `<${name}>`;
      } else {
        out += closing ? `</${name}>` : `<${name}>`;
      }
    }

    last = tag.lastIndex;
    match = tag.exec(withoutComments);
  }

  out += escapeText(withoutComments.slice(last));
  return out;
}

/** A note written before 0035, as the markup the editor expects. */
export function plainToHtml(text: string): string {
  return escapeText(text).replace(/\r?\n/g, "<br>");
}

/**
 * The words out of a note body, with one line per visible line.
 *
 * Used by the to-do list enterer, which has always worked a line at a
 * time, and by anything else that needs the text rather than the
 * markup.
 */
export function htmlToPlainText(html: string): string {
  return (
    html
      // Everything that ends a visible line becomes one.
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol)\s*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      // Last, or it would turn "&amp;lt;" into "<".
      .replace(/&amp;/gi, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** A note's body as plain text, whichever way it was stored. */
export function noteBodyAsText(note: Pick<Note, "body" | "body_format">): string {
  return note.body_format === "html" ? htmlToPlainText(note.body) : note.body;
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
