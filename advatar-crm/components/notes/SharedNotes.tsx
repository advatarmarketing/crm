import { formatNoteTime, plainToHtml, sanitizeNoteHtml, type SharedNoteGroup } from "@/lib/notes";

/**
 * The notes the agency has shared with this client (0040), on the
 * client's own Notes tab, above their own notebook.
 *
 * Read-only by design and read-only in fact: there is nothing to
 * press here, and the database would refuse it anyway — 0040 grants
 * a client SELECT and nothing else. No edit, no delete, no ticking
 * off somebody else's checklist.
 *
 * A server component, so none of this needs to be interactive and
 * none of it ships as JavaScript.
 */
export function SharedNotes({ groups }: { groups: SharedNoteGroup[] }) {
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.notes.length, 0);

  return (
    <section style={{ marginBottom: 34 }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          margin: "0 0 4px",
        }}
      >
        Shared with you
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 16px", lineHeight: 1.6 }}>
        {total === 1 ? "A note" : `${total} notes`} your team has shared with you. You can read{" "}
        {total === 1 ? "it" : "them"} here; your own notes below stay private to you.
      </p>

      {groups.map((group) => (
        <div key={group.folderId} style={{ marginBottom: 18 }}>
          <h3
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              margin: "0 0 10px",
            }}
          >
            {group.folderName}
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {group.notes.map((note) => (
              <article key={note.id} className="card card-pad-sm">
                <h4 style={{ fontFamily: "var(--font-display)", fontSize: 17, margin: "0 0 6px" }}>
                  {note.title}
                </h4>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                    margin: "0 0 10px",
                  }}
                >
                  Updated {formatNoteTime(note.updated_at)}
                </p>

                {note.body.trim().length > 0 && (
                  <div
                    className="note-body-rich"
                    style={{ fontSize: 14, color: "var(--text-1)", lineHeight: 1.65 }}
                    // The same sanitiser the notebook itself renders
                    // through: a fixed tag allow-list, every attribute
                    // stripped, so there is no src, href, style or on*
                    // left to go wrong. See lib/notes.ts.
                    dangerouslySetInnerHTML={{
                      __html:
                        note.body_format === "html"
                          ? sanitizeNoteHtml(note.body)
                          : plainToHtml(note.body),
                    }}
                  />
                )}

                {note.items.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                    {note.items.map((item) => (
                      <li
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          fontSize: 13.5,
                          lineHeight: 1.6,
                          color: item.done ? "var(--text-3)" : "var(--text-2)",
                          textDecoration: item.done ? "line-through" : "none",
                          padding: "3px 0",
                        }}
                      >
                        {/* Drawn rather than a disabled checkbox: there
                            is nothing here to tick, and a greyed-out
                            control invites the attempt. */}
                        <span aria-hidden style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>
                          {item.done ? "✓" : "·"}
                        </span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
