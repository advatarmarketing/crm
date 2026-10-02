"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  NOTE_COLOURS,
  formatNoteTime,
  linesToItems,
  noteBodyAsText,
  plainToHtml,
  sanitizeNoteHtml,
  type Note,
  type NoteColour,
  type NoteFolder,
  type NoteItem,
  type Notebook,
} from "@/lib/notes";
import { RichNoteEditor, type RichNoteEditorHandle } from "./RichNoteEditor";

/** "all" and "none" are views, not folders: every note, and notes in no folder. */
type FolderView = "all" | "none" | string;

const NOTE_COLUMNS = "id, folder_id, title, body, created_at, updated_at";

/**
 * The same, plus 0035's columns. Used only when the notebook loaded
 * them successfully — on a database without 0035 this select would
 * fail outright and take the save with it, which is why the plain
 * list above still exists.
 */
const NOTE_COLUMNS_RICH = NOTE_COLUMNS + ", color, body_format";
const FOLDER_COLUMNS = "id, name, created_at";
const FOLDER_COLUMNS_RICH = FOLDER_COLUMNS + ", parent_id, color";
const ITEM_COLUMNS = "id, note_id, text, done, position";

/**
 * The Notes tab: folders, notes inside them, and a to-do list inside
 * any note.
 *
 * Everything here writes straight through the browser client, the way
 * TaskList and SchedulePanel already do. There is no role check in
 * this file because there is nothing to check — every policy on these
 * tables is "owner only" (0032), so a person can only ever read and
 * change their own notebook, whoever they are.
 *
 * A note is written, then SAVED. Once saved it collapses to its title
 * and dates, and opens again with a tap. That is deliberate: this is a
 * list people will keep for months, and a list of fully expanded notes
 * stops being a list after the fifth one.
 *
 * The list is ordered by when each note was last updated, newest
 * first — and ticking, adding or removing a to-do counts as updating
 * the note (0032's trigger), so the list reorders locally on the same
 * rule rather than waiting for a reload to agree with the database.
 */
export function NotesWorkspace({
  initial,
  openNoteId = null,
  todoHref,
}: {
  initial: Notebook;
  /** From ?note= — the To-do tab links straight to the note an item came from. */
  openNoteId?: string | null;
  /** Where this person's To-do tab lives: /app/todo, or /app/portal/todo for a client. */
  todoHref: string;
}) {
  const supabase = useMemo(() => createClient(), []);

  /**
   * Whether 0035 has been run. Everything it added — subfolders,
   * colour labels, rich text — is hidden rather than offered and
   * refused when it has not, so a database that is behind the code
   * gets the notebook it had before and no broken buttons.
   */
  const rich = initial.richAvailable;

  const [folders, setFolders] = useState<NoteFolder[]>(initial.folders);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [view, setView] = useState<FolderView>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(openNoteId ? [openNoteId] : []));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Arriving from the To-do tab: bring that note into view once the
  // page has painted, so it is the first thing seen rather than
  // somewhere down a long list.
  useEffect(() => {
    if (!openNoteId) return;
    document.getElementById(`note-${openNoteId}`)?.scrollIntoView({ block: "center" });
  }, [openNoteId]);

  const folderName = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [notes]
  );

  const visible = sorted.filter((n) =>
    view === "all" ? true : view === "none" ? n.folder_id === null : n.folder_id === view
  );

  const unfiledCount = notes.filter((n) => n.folder_id === null).length;
  const currentFolder = view !== "all" && view !== "none" ? folders.find((f) => f.id === view) ?? null : null;

  // ---------------------------------------------------------------
  // Local bookkeeping
  // ---------------------------------------------------------------

  function replaceNote(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  /** The database has already moved updated_at (0032's trigger); this keeps the order in step. */
  function touch(id: string) {
    replaceNote(id, { updated_at: new Date().toISOString() });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function fail(message: string) {
    setError(message);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------------------------------------------------------
  // Folders
  // ---------------------------------------------------------------

  async function createFolder(name: string, parentId: string | null = null): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setError(null);

    const { data, error: e } = await supabase
      .from("note_folders")
      .insert(rich ? { name: trimmed, parent_id: parentId } : { name: trimmed })
      .select(rich ? FOLDER_COLUMNS_RICH : FOLDER_COLUMNS)
      .single();

    if (e || !data) {
      // 23505 is the unique index on (owner, parent, name): the same
      // name in the same place. Worth naming, because the fix is to
      // pick another name rather than to try again.
      fail(
        e?.code === "23505"
          ? parentId
            ? `That folder already has one called “${trimmed}”.`
            : `You already have a folder called “${trimmed}”.`
          : e?.message ?? "Could not create that folder."
      );
      return false;
    }

    const row = data as Partial<NoteFolder> & { id: string; name: string; created_at: string };
    const created: NoteFolder = {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      parent_id: row.parent_id ?? parentId,
      color: row.color ?? null,
    };
    setFolders((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setView(created.id);
    return true;
  }

  /** Sets or clears a folder's colour label. */
  async function setFolderColour(folder: NoteFolder, color: NoteColour | null) {
    setError(null);
    const { error: e } = await supabase.from("note_folders").update({ color }).eq("id", folder.id);
    if (e) {
      fail(e.message);
      return;
    }
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, color } : f)));
  }

  async function renameFolder(folder: NoteFolder) {
    const name = window.prompt("Rename folder", folder.name)?.trim();
    if (!name || name === folder.name) return;
    setError(null);

    const { error: e } = await supabase.from("note_folders").update({ name }).eq("id", folder.id);
    if (e) {
      fail(e.code === "23505" ? `You already have a folder called “${name}”.` : e.message);
      return;
    }
    setFolders((prev) =>
      prev.map((f) => (f.id === folder.id ? { ...f, name } : f)).sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async function deleteFolder(folder: NoteFolder) {
    const count = notes.filter((n) => n.folder_id === folder.id).length;
    const message =
      count === 0
        ? `Delete the folder “${folder.name}”?`
        : `Delete the folder “${folder.name}”? Its ${count} note${count === 1 ? "" : "s"} will be kept and moved to “No folder”.`;
    if (!window.confirm(message)) return;
    setError(null);

    const { error: e } = await supabase.from("note_folders").delete().eq("id", folder.id);
    if (e) {
      fail(e.message);
      return;
    }
    // The database moves the notes itself (on delete set null); this
    // mirrors it so the counts are right without a reload. A subfolder
    // of this one is promoted to the top level the same way, rather
    // than disappearing with its parent.
    setFolders((prev) =>
      prev
        .filter((f) => f.id !== folder.id)
        .map((f) => (f.parent_id === folder.id ? { ...f, parent_id: null } : f))
    );
    setNotes((prev) => prev.map((n) => (n.folder_id === folder.id ? { ...n, folder_id: null } : n)));
    setView("all");
  }

  // ---------------------------------------------------------------
  // Notes
  // ---------------------------------------------------------------

  async function createNote(values: NoteFormValues): Promise<boolean> {
    setError(null);

    const { data, error: e } = await supabase
      .from("notes")
      .insert(
        rich
          ? {
              title: values.title,
              body: values.body,
              folder_id: values.folderId,
              color: values.color,
              body_format: "html",
            }
          : { title: values.title, body: values.body, folder_id: values.folderId }
      )
      .select(rich ? NOTE_COLUMNS_RICH : NOTE_COLUMNS)
      .single();

    if (e || !data) {
      fail(e?.message ?? "Could not save that note.");
      return false;
    }

    const saved = data as Partial<Note> & Omit<Note, "items" | "color" | "body_format">;
    const note: Note = {
      ...saved,
      color: saved.color ?? null,
      body_format: saved.body_format ?? "plain",
      items: [] as NoteItem[],
    };

    if (values.newItems.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("note_checklist_items")
        .insert(values.newItems.map((text, i) => ({ note_id: note.id, text, position: i })))
        .select(ITEM_COLUMNS);

      if (itemsError) {
        // The note itself is saved; say what did not make it rather
        // than throwing the whole note away.
        fail(`The note was saved, but its to-do list was not: ${itemsError.message}`);
      } else {
        note.items = (items ?? []) as NoteItem[];
        note.updated_at = new Date().toISOString();
      }
    }

    setNotes((prev) => [note, ...prev]);
    // Saved notes arrive collapsed, as a title in the list — which is
    // the point of saving them. If the note was filed somewhere other
    // than the folder on screen, follow it there so it doesn't appear
    // to have vanished.
    if (view !== "all" && (values.folderId ?? "none") !== view) {
      setView(values.folderId ?? "none");
    }
    return true;
  }

  async function updateNote(note: Note, values: NoteFormValues): Promise<boolean> {
    setError(null);

    const { data, error: e } = await supabase
      .from("notes")
      .update(
        rich
          ? {
              title: values.title,
              body: values.body,
              folder_id: values.folderId,
              color: values.color,
              body_format: "html",
            }
          : { title: values.title, body: values.body, folder_id: values.folderId }
      )
      .eq("id", note.id)
      .select(rich ? NOTE_COLUMNS_RICH : NOTE_COLUMNS)
      .single();

    if (e || !data) {
      fail(e?.message ?? "Could not save your changes.");
      return false;
    }

    let items = note.items;

    if (values.newItems.length > 0) {
      const start = note.items.reduce((max, i) => Math.max(max, i.position), -1) + 1;
      const { data: added, error: itemsError } = await supabase
        .from("note_checklist_items")
        .insert(values.newItems.map((text, i) => ({ note_id: note.id, text, position: start + i })))
        .select(ITEM_COLUMNS);

      if (itemsError) {
        fail(`Your changes were saved, but the new to-do items were not: ${itemsError.message}`);
      } else {
        items = [...items, ...((added ?? []) as NoteItem[])];
      }
    }

    const saved = data as Partial<Note> & Omit<Note, "items" | "color" | "body_format">;
    replaceNote(note.id, {
      ...saved,
      color: saved.color ?? null,
      body_format: saved.body_format ?? "plain",
      items,
      updated_at: new Date().toISOString(),
    });
    return true;
  }

  async function deleteNote(note: Note) {
    if (!window.confirm(`Delete “${note.title}”? This can’t be undone.`)) return;
    setError(null);

    const { error: e } = await supabase.from("notes").delete().eq("id", note.id);
    if (e) {
      fail(e.message);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
  }

  async function moveNote(note: Note, folderId: string | null) {
    if (folderId === note.folder_id) return;
    setError(null);

    const { error: e } = await supabase.from("notes").update({ folder_id: folderId }).eq("id", note.id);
    if (e) {
      fail(e.message);
      return;
    }
    replaceNote(note.id, { folder_id: folderId, updated_at: new Date().toISOString() });
  }

  // ---------------------------------------------------------------
  // To-do items, live — no Save needed to tick one
  // ---------------------------------------------------------------

  async function toggleItem(note: Note, item: NoteItem, done: boolean) {
    // Optimistic: a tick box that waits on the network feels broken.
    replaceNote(note.id, { items: note.items.map((i) => (i.id === item.id ? { ...i, done } : i)) });

    const { error: e } = await supabase.from("note_checklist_items").update({ done }).eq("id", item.id);
    if (e) {
      replaceNote(note.id, { items: note.items });
      fail(e.message);
      return;
    }
    touch(note.id);
  }

  async function addItem(note: Note, text: string): Promise<boolean> {
    const clean = linesToItems(text);
    if (clean.length === 0) return false;
    setError(null);

    const start = note.items.reduce((max, i) => Math.max(max, i.position), -1) + 1;
    const { data, error: e } = await supabase
      .from("note_checklist_items")
      .insert(clean.map((t, i) => ({ note_id: note.id, text: t, position: start + i })))
      .select(ITEM_COLUMNS);

    if (e) {
      fail(e.message);
      return false;
    }
    replaceNote(note.id, {
      items: [...note.items, ...((data ?? []) as NoteItem[])],
      updated_at: new Date().toISOString(),
    });
    return true;
  }

  async function removeItem(note: Note, item: NoteItem) {
    replaceNote(note.id, { items: note.items.filter((i) => i.id !== item.id) });

    const { error: e } = await supabase.from("note_checklist_items").delete().eq("id", item.id);
    if (e) {
      replaceNote(note.id, { items: note.items });
      fail(e.message);
      return;
    }
    touch(note.id);
  }

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 22px", maxWidth: "62ch" }}>
        Private to you — nobody else can read these, including management. Any
        to-do list you add to a note also appears on your{" "}
        <Link href={todoHref} style={{ color: "inherit" }}>
          To-do tab
        </Link>
        , and ticking it off in either place ticks it off in both.
      </p>

      {error && (
        <p
          role="alert"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--danger-fg)",
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            margin: "0 0 16px",
          }}
        >
          {error}
        </p>
      )}

      <FolderBar
        folders={folders}
        notes={notes}
        view={view}
        unfiledCount={unfiledCount}
        onSelect={(v) => {
          setView(v);
          setEditingId(null);
        }}
        onCreate={createFolder}
        rich={rich}
        onColour={setFolderColour}
      />

      {currentFolder && (
        <div style={{ display: "flex", gap: 14, margin: "-6px 0 18px" }}>
          <button type="button" onClick={() => renameFolder(currentFolder)} style={linkButton}>
            Rename folder
          </button>
          <button type="button" onClick={() => deleteFolder(currentFolder)} style={{ ...linkButton, color: "var(--danger-fg)" }}>
            Delete folder
          </button>
        </div>
      )}

      {composing ? (
        <div style={{ marginBottom: 22 }}>
          <NoteForm
            heading="New note"
            folders={folders}
            initial={{
              title: "",
              body: "",
              bodyIsHtml: false,
              color: null,
              // A note started inside a folder belongs in that folder.
              folderId: currentFolder?.id ?? null,
            }}
            rich={rich}
            submitLabel="Save note"
            onCancel={() => setComposing(false)}
            onSubmit={async (values) => {
              const ok = await createNote(values);
              if (ok) setComposing(false);
              return ok;
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setComposing(true);
            setEditingId(null);
          }}
          style={{ marginBottom: 22 }}
        >
          + New note
        </button>
      )}

      {visible.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-3)", margin: "8px 0" }}>
          {notes.length === 0
            ? "No notes yet. Press “New note” to write your first."
            : view === "none"
              ? "Every note is in a folder."
              : "Nothing in this folder yet."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((note) => (
            <li key={note.id} id={`note-${note.id}`}>
              {editingId === note.id ? (
                <NoteForm
                  heading="Edit note"
                  folders={folders}
                  initial={{
                    title: note.title,
                    body: note.body,
                    bodyIsHtml: note.body_format === "html",
                    color: note.color,
                    folderId: note.folder_id,
                  }}
                  rich={rich}
                  existingItemCount={note.items.length}
                  submitLabel="Save changes"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (values) => {
                    const ok = await updateNote(note, values);
                    if (ok) setEditingId(null);
                    return ok;
                  }}
                />
              ) : (
                <NoteRow
                  note={note}
                  folders={folders}
                  folderLabel={view === "all" ? folderName.get(note.folder_id ?? "") ?? null : null}
                  open={expanded.has(note.id)}
                  todoHref={todoHref}
                  onToggle={() => toggleExpanded(note.id)}
                  onEdit={() => {
                    setEditingId(note.id);
                    setComposing(false);
                  }}
                  onDelete={() => deleteNote(note)}
                  onMove={(folderId) => moveNote(note, folderId)}
                  onToggleItem={(item, done) => toggleItem(note, item, done)}
                  onAddItem={(text) => addItem(note, text)}
                  onRemoveItem={(item) => removeItem(note, item)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =================================================================
// Folder bar
// =================================================================

function FolderBar({
  folders,
  notes,
  view,
  unfiledCount,
  rich,
  onSelect,
  onCreate,
  onColour,
}: {
  folders: NoteFolder[];
  notes: Note[];
  view: FolderView;
  unfiledCount: number;
  rich: boolean;
  onSelect: (view: FolderView) => void;
  onCreate: (name: string, parentId: string | null) => Promise<boolean>;
  onColour: (folder: NoteFolder, color: NoteColour | null) => void;
}) {
  /** null = not adding; "" = adding at the top level; an id = inside it. */
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  /** Which folder's colour picker is open. */
  const [colouring, setColouring] = useState<string | null>(null);

  /**
   * A folder's count includes its subfolders'.
   *
   * Otherwise a parent with everything filed one level down would read
   * 0, which looks like an empty folder rather than a full one.
   */
  const countIn = (id: string) => {
    const childIds = folders.filter((f) => f.parent_id === id).map((f) => f.id);
    return notes.filter((n) => n.folder_id === id || (n.folder_id && childIds.includes(n.folder_id))).length;
  };

  const top = folders.filter((f) => !f.parent_id);
  const childrenOf = (id: string) => folders.filter((f) => f.parent_id === id);

  async function submit() {
    setBusy(true);
    const ok = await onCreate(name, addingIn || null);
    setBusy(false);
    if (ok) {
      setName("");
      setAddingIn(null);
    }
  }

  const addRow = (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input
        autoFocus
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setAddingIn(null);
        }}
        placeholder={addingIn ? "Subfolder name" : "Folder name"}
        aria-label={addingIn ? "New subfolder name" : "New folder name"}
        style={{ width: 170, padding: "7px 10px", fontSize: 13 }}
      />
      <button type="button" className="btn" onClick={submit} disabled={busy || !name.trim()} style={{ minHeight: 34, padding: "6px 12px" }}>
        Add
      </button>
      <button type="button" onClick={() => setAddingIn(null)} style={linkButton}>
        Cancel
      </button>
    </span>
  );

  return (
    <div
      role="tablist"
      aria-label="Folders"
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 18 }}
    >
      <Chip label="All notes" count={notes.length} active={view === "all"} onClick={() => onSelect("all")} />

      {top.map((f) => (
        <span key={f.id} style={{ display: "contents" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Chip
              label={f.name}
              count={countIn(f.id)}
              active={view === f.id}
              onClick={() => onSelect(f.id)}
              folder
              colour={f.color}
            />
            {rich && (
              <>
                <IconBtn
                  label={`Colour label for ${f.name}`}
                  onClick={() => setColouring((c) => (c === f.id ? null : f.id))}
                >
                  <span className="note-dot" style={swatchVar(f.color)} />
                </IconBtn>
                <IconBtn label={`New folder inside ${f.name}`} onClick={() => { setAddingIn(f.id); setName(""); }}>
                  +
                </IconBtn>
              </>
            )}
          </span>

          {colouring === f.id && (
            <ColourPicker
              value={f.color}
              onPick={(c) => {
                onColour(f, c);
                setColouring(null);
              }}
            />
          )}

          {addingIn === f.id && addRow}

          {childrenOf(f.id).map((child) => (
            <span key={child.id} className="note-subfolder" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Chip
                label={child.name}
                count={countIn(child.id)}
                active={view === child.id}
                onClick={() => onSelect(child.id)}
                folder
                colour={child.color}
              />
              {rich && (
                <IconBtn
                  label={`Colour label for ${child.name}`}
                  onClick={() => setColouring((c) => (c === child.id ? null : child.id))}
                >
                  <span className="note-dot" style={swatchVar(child.color)} />
                </IconBtn>
              )}
              {colouring === child.id && (
                <ColourPicker
                  value={child.color}
                  onPick={(c) => {
                    onColour(child, c);
                    setColouring(null);
                  }}
                />
              )}
            </span>
          ))}
        </span>
      ))}

      {/* Only once there is something in it — an always-present
          "No folder" chip reading 0 is noise for anyone who files
          everything. */}
      {unfiledCount > 0 && folders.length > 0 && (
        <Chip label="No folder" count={unfiledCount} active={view === "none"} onClick={() => onSelect("none")} />
      )}

      {addingIn === "" ? (
        addRow
      ) : (
        <button
          type="button"
          onClick={() => { setAddingIn(""); setName(""); }}
          style={{
            ...chipBase,
            borderStyle: "dashed",
            color: "var(--text-3)",
            background: "transparent",
          }}
        >
          + New folder
        </button>
      )}
    </div>
  );
}

/** The CSS variable each swatch and dot paints itself from. */
function swatchVar(colour: NoteColour | null): CSSProperties {
  return colour ? ({ "--note-label": `var(--label-${colour})` } as CSSProperties) : {};
}

/** A small square icon button, for the controls beside a folder chip. */
function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 24,
        height: 24,
        display: "grid",
        placeItems: "center",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-3)",
        fontSize: 13,
        lineHeight: 1,
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/**
 * The eight labels, plus "none".
 *
 * Each swatch is a button with aria-pressed, and the chosen one takes
 * a ring as well as its colour — telling eight dots apart by hue alone
 * is exactly the thing some people cannot do.
 */
function ColourPicker({
  value,
  onPick,
}: {
  value: NoteColour | null;
  onPick: (colour: NoteColour | null) => void;
}) {
  return (
    <span
      role="group"
      aria-label="Colour label"
      style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
    >
      <button
        type="button"
        className="note-swatch note-swatch-none"
        aria-label="No colour"
        title="No colour"
        aria-pressed={value === null}
        onClick={() => onPick(null)}
      >
        &times;
      </button>
      {NOTE_COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          className="note-swatch"
          style={swatchVar(c)}
          aria-label={c}
          title={c}
          aria-pressed={value === c}
          onClick={() => onPick(c)}
        />
      ))}
    </span>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
  folder = false,
  colour = null,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  folder?: boolean;
  colour?: NoteColour | null;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        ...chipBase,
        borderColor: active ? "var(--text-1)" : "var(--border)",
        background: active ? "var(--text-1)" : "var(--surface)",
        color: active ? "var(--bg)" : "var(--text-2)",
      }}
    >
      {colour ? <span className="note-dot" style={swatchVar(colour)} /> : folder && <FolderIcon />}
      <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ opacity: 0.6 }}>{count}</span>
    </button>
  );
}

// =================================================================
// One note, collapsed or open
// =================================================================

function NoteRow({
  note,
  folders,
  folderLabel,
  open,
  todoHref,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  onToggleItem,
  onAddItem,
  onRemoveItem,
}: {
  note: Note;
  folders: NoteFolder[];
  folderLabel: string | null;
  open: boolean;
  todoHref: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
  onToggleItem: (item: NoteItem, done: boolean) => void;
  onAddItem: (text: string) => Promise<boolean>;
  onRemoveItem: (item: NoteItem) => void;
}) {
  const done = note.items.filter((i) => i.done).length;
  const total = note.items.length;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md, 10px)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          width: "100%",
          padding: "14px 16px",
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          color: "inherit",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            marginTop: 3,
            color: "var(--text-3)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: 15,
              // The dot sits on the title line rather than before the
              // chevron, so a labelled note and an unlabelled one line
              // up the same way down the list.
              color: "var(--text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: open ? "normal" : "nowrap",
            }}
          >
            {note.color && (
              <span
                className="note-dot"
                style={{ ...swatchVar(note.color), marginRight: 7, verticalAlign: "middle" }}
                aria-hidden="true"
              />
            )}
            {note.title}
          </span>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.03em",
              color: "var(--text-3)",
              marginTop: 4,
              lineHeight: 1.6,
            }}
          >
            {/* Each part kept whole, so a narrow screen breaks
                BETWEEN them rather than halfway through a date. */}
            {folderLabel && <span style={{ whiteSpace: "nowrap" }}>{folderLabel} · </span>}
            <span style={{ whiteSpace: "nowrap" }}>Created {formatNoteTime(note.created_at)}</span>
            <span className="note-meta-sep"> · </span>
            <span className="note-meta-updated" style={{ whiteSpace: "nowrap" }}>
              Updated {formatNoteTime(note.updated_at)}
            </span>
          </span>
        </span>

        {total > 0 && (
          <span
            title={`${done} of ${total} to-dos done`}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              color: done === total ? "var(--text-3)" : "var(--text-2)",
            }}
          >
            <CheckIcon />
            {done}/{total}
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px 42px" }}>
          {note.body.trim() ? (
            note.body_format === "html" ? (
              /* Sanitised here, at the point of rendering, rather than
                 trusted because it was sanitised before being stored.
                 What is in the database is data; this is the only
                 place that decides what becomes markup. */
              <div
                className="note-body-rich"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--text-1)",
                  overflowWrap: "anywhere",
                  margin: "0 0 14px",
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(note.body) }}
              />
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--text-1)",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  margin: "0 0 14px",
                }}
              >
                {note.body}
              </p>
            )
          ) : (
            total === 0 && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 14px" }}>
                No text in this note yet.
              </p>
            )
          )}

          <Checklist
            items={note.items}
            todoHref={todoHref}
            onToggle={onToggleItem}
            onAdd={onAddItem}
            onRemove={onRemoveItem}
          />

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 14,
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
            }}
          >
            <button type="button" onClick={onEdit} style={linkButton}>
              Edit
            </button>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, ...linkButtonText }}>
              Folder
              <select
                value={note.folder_id ?? ""}
                onChange={(e) => onMove(e.target.value || null)}
                aria-label="Move to folder"
                style={{ padding: "4px 8px", fontSize: 12, minHeight: 0 }}
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            <button type="button" onClick={onDelete} style={{ ...linkButton, color: "var(--danger-fg)", marginLeft: "auto" }}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// A note's to-do list, live
// =================================================================

function Checklist({
  items,
  todoHref,
  onToggle,
  onAdd,
  onRemove,
}: {
  items: NoteItem[];
  todoHref: string;
  onToggle: (item: NoteItem, done: boolean) => void;
  onAdd: (text: string) => Promise<boolean>;
  onRemove: (item: NoteItem) => void;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const ok = await onAdd(draft);
    setBusy(false);
    if (ok) setDraft("");
  }

  if (items.length === 0 && !adding) {
    return (
      <button type="button" className="btn" onClick={() => setAdding(true)} style={{ minHeight: 36, padding: "7px 12px" }}>
        <CheckIcon /> Add a to-do list
      </button>
    );
  }

  return (
    <div>
      <span
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 8,
        }}
      >
        To-do list
        <Link href={todoHref} style={{ color: "inherit", textTransform: "none", letterSpacing: 0 }}>
          Also on your To-do tab →
        </Link>
      </span>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "9px 12px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg)",
              opacity: item.done ? 0.55 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => onToggle(item, e.target.checked)}
              aria-label={item.done ? `Mark “${item.text}” as not done` : `Mark “${item.text}” as done`}
              style={{ width: 16, height: 16, marginTop: 2, accentColor: "var(--text-1)", cursor: "pointer", flexShrink: 0 }}
            />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: "var(--font-body)",
                fontSize: 13.5,
                color: "var(--text-1)",
                textDecoration: item.done ? "line-through" : "none",
                overflowWrap: "anywhere",
              }}
            >
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={`Remove “${item.text}”`}
              title="Remove"
              style={{ ...linkButton, color: "var(--text-3)", padding: "0 2px", lineHeight: 1 }}
            >
              <CrossIcon />
            </button>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          autoFocus={items.length === 0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Add a to-do and press Enter"
          aria-label="New to-do"
          style={{ flex: 1, minWidth: 0, padding: "8px 10px", fontSize: 13 }}
        />
        <button type="button" className="btn" onClick={submit} disabled={busy || !draft.trim()} style={{ minHeight: 36, padding: "6px 12px" }}>
          Add
        </button>
      </div>
    </div>
  );
}

// =================================================================
// Writing and editing a note
// =================================================================

interface NoteFormValues {
  title: string;
  body: string;
  color: NoteColour | null;
  folderId: string | null;
  /** To-do items made while writing, saved along with the note. */
  newItems: string[];
}

function NoteForm({
  heading,
  folders,
  initial,
  rich,
  existingItemCount = 0,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  heading: string;
  folders: NoteFolder[];
  initial: {
    title: string;
    body: string;
    bodyIsHtml: boolean;
    color: NoteColour | null;
    folderId: string | null;
  };
  rich: boolean;
  existingItemCount?: number;
  submitLabel: string;
  onSubmit: (values: NoteFormValues) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [colour, setColour] = useState<NoteColour | null>(initial.color);
  const [folderId, setFolderId] = useState<string | null>(initial.folderId);
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<RichNoteEditorHandle>(null);

  /**
   * A note written before 0035 opens as markup so it can be edited
   * with the rest. Computed once: re-running it on every render would
   * hand the editor new HTML mid-keystroke.
   */
  const [startingHtml] = useState(() =>
    initial.bodyIsHtml ? sanitizeNoteHtml(initial.body) : plainToHtml(initial.body)
  );

  /**
   * The to-do list enterer.
   *
   * With lines selected in the note, those lines BECOME the to-do list:
   * each one turns into an item and leaves the text, so the note does
   * not say everything twice. With nothing selected, it starts an empty
   * list to type into.
   */
  function makeTodoList() {
    // The rich editor keeps its own DOM, so the selection comes from
    // it rather than from a textarea's start/end offsets. Behaviour is
    // the same as it always was: the selected lines BECOME the to-do
    // list and leave the note, so nothing is said twice.
    if (rich) {
      const picked = linesToItems(editorRef.current?.getSelectedText() ?? "");
      if (picked.length > 0) {
        editorRef.current?.deleteSelection();
        setItems((prev) => [...prev, ...picked]);
        return;
      }
      setItems((prev) => [...prev, ""]);
      return;
    }

    const el = bodyRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;

    if (el && end > start) {
      // Widen to whole lines, so selecting half of "Book the drone"
      // does not leave "Book the" behind in the text.
      const lineStart = body.lastIndexOf("\n", start - 1) + 1;
      const nextBreak = body.indexOf("\n", end - (body[end - 1] === "\n" ? 1 : 0));
      const lineEnd = nextBreak === -1 ? body.length : nextBreak;

      const picked = linesToItems(body.slice(lineStart, lineEnd));
      if (picked.length > 0) {
        const before = body.slice(0, lineStart);
        const after = body.slice(lineEnd).replace(/^\n/, "");
        setBody((before + after).replace(/\n{3,}/g, "\n\n"));
        setItems((prev) => [...prev, ...picked]);
        return;
      }
    }

    setItems((prev) => [...prev, ""]);
  }

  async function submit() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setProblem("Give the note a title.");
      return;
    }
    setProblem(null);
    setBusy(true);

    // Sanitised on the way out as well as on the way in. The editor's
    // own markup is already limited to what execCommand produces, but
    // a note is stored once and rendered for years, and this is the
    // last point where anything can be guaranteed about it.
    const nextBody = rich
      ? sanitizeNoteHtml(editorRef.current?.getHtml() ?? "").slice(0, 20000)
      : body.slice(0, 20000);

    const ok = await onSubmit({
      title: cleanTitle.slice(0, 200),
      body: nextBody,
      color: colour,
      folderId,
      newItems: items.map((i) => i.trim()).filter(Boolean).map((i) => i.slice(0, 500)),
    });
    setBusy(false);
    return ok;
  }

  return (
    <div
      style={{
        border: "1px solid var(--border-2, var(--border))",
        borderRadius: "var(--radius-md, 10px)",
        background: "var(--surface)",
        padding: 16,
      }}
    >
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 10,
        }}
      >
        {heading}
      </span>

      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (problem) setProblem(null);
        }}
        maxLength={200}
        placeholder="Title"
        aria-label="Title"
        autoFocus
        style={{ width: "100%", fontSize: 15, fontWeight: 600, marginBottom: 10 }}
      />

      {rich ? (
        <div style={{ marginBottom: 10 }}>
          <RichNoteEditor ref={editorRef} initialHtml={startingHtml} ariaLabel="Note" />
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11.5, color: "var(--text-3)", margin: "6px 0 0" }}>
            Ctrl+B, I and U work too. Typing <code>-&gt;</code> makes an arrow, and
            starting a line with <code>-</code> and a space starts a bullet list.
          </p>
        </div>
      ) : (
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={20000}
          rows={7}
          placeholder="Write your note…"
          aria-label="Note"
          style={{ width: "100%", fontSize: 14, lineHeight: 1.55, resize: "vertical", marginBottom: 10 }}
        />
      )}

      {rich && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Label
          </span>
          <ColourPicker value={colour} onPick={setColour} />
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button type="button" className="btn" onClick={makeTodoList} style={{ minHeight: 36, padding: "7px 12px" }}>
          <CheckIcon /> Make to-do list
        </button>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-3)", flex: "1 1 220px" }}>
          Select lines in your note first to turn them into to-dos — or press it
          with nothing selected to start a list.
        </span>
      </div>

      {items.length > 0 && (
        <div style={{ margin: "12px 0 4px" }}>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              marginBottom: 8,
            }}
          >
            {existingItemCount > 0 ? "New to-dos to add" : "To-do list"}
          </span>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((text, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden="true" style={{ width: 14, height: 14, border: "1.5px solid var(--text-3)", borderRadius: 3, flexShrink: 0 }} />
                <input
                  value={text}
                  autoFocus={text === "" && i === items.length - 1}
                  maxLength={500}
                  onChange={(e) => setItems((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
                  onKeyDown={(e) => {
                    // Enter on the last item starts the next one, the way
                    // every checklist app has taught people to expect.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (i === items.length - 1 && text.trim()) setItems((prev) => [...prev, ""]);
                    }
                  }}
                  placeholder="To-do"
                  aria-label={`To-do ${i + 1}`}
                  style={{ flex: 1, minWidth: 0, padding: "7px 10px", fontSize: 13 }}
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Remove this to-do"
                  style={{ ...linkButton, color: "var(--text-3)" }}
                >
                  <CrossIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 14 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, ...linkButtonText }}>
          Folder
          <select
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value || null)}
            aria-label="Folder"
            style={{ padding: "6px 10px", fontSize: 13 }}
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <span style={{ flex: 1 }} />

        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>

      {problem && (
        <p role="alert" style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--danger-fg)", margin: "10px 0 0" }}>
          {problem}
        </p>
      )}
    </div>
  );
}

// =================================================================
// Small pieces
// =================================================================

const chipBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  minHeight: 34,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  fontFamily: "var(--font-mono)",
  fontSize: 11.5,
  letterSpacing: "0.03em",
  cursor: "pointer",
};

const linkButtonText: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-2)",
};

const linkButton: CSSProperties = {
  ...linkButtonText,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};

function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
