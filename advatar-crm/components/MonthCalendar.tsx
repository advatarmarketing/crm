"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EventCategory, ScheduleEntry } from "./SchedulePanel";

/**
 * Something that happens ON a day rather than at a time: a video going
 * out (0042), a payment falling due. Drawn apart from bookings so the
 * two read differently at a glance, and switchable off as a group.
 */
export interface CalendarMarker {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  kind: "video" | "payment";
  title: string;
  /** Second line in the day list — client, stage. */
  detail?: string | null;
  href?: string | null;
  /** Can be dragged to another day. */
  movable?: boolean;
  /** Something is wrong with it (late, overdue). */
  alert?: boolean;
}

const MARKER_COLOUR: Record<CalendarMarker["kind"], string> = {
  // Video work is violet and money is green everywhere in the app.
  video: "#8b5cf6",
  payment: "#16a34a",
};
const MARKER_ICON: Record<CalendarMarker["kind"], string> = { video: "▶", payment: "£" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// A literal, not a token: this value gets an alpha suffix appended
// (`${colour}22`) to tint a cell, and string-concatenating onto a
// var() produces invalid CSS. Mid grey reads acceptably on both
// themes' grounds.
const FALLBACK_COLOUR = "#8a8a8a";

/**
 * A month grid of calendar entries, coloured by category.
 *
 * Read-only: this is the view a videographer gets of their own
 * schedule, and `schedule_events`' RLS gives them select access only
 * (0018). Booking is done by whoever is running the diary, from the
 * admin side.
 *
 * Weeks start on Monday, which is how a shoot week is actually
 * discussed — JavaScript's getDay() puts Sunday first, so the index
 * is shifted rather than used raw.
 */
export function MonthCalendar({
  events,
  categories,
  initialMonth,
  showPerson = false,
  markers = [],
  videoToggle = false,
  onMoveMarker,
}: {
  events: ScheduleEntry[];
  categories: EventCategory[];
  /** ISO date for the month to open on. Defaults to this month. */
  initialMonth?: string;
  /** Whose entry it is — only meaningful on a whole-team calendar. */
  showPerson?: boolean;
  markers?: CalendarMarker[];
  /** Draw the "Video schedule" switch above the grid. */
  videoToggle?: boolean;
  /** Returns an error message, or null once the move has saved. */
  onMoveMarker?: (id: string, date: string) => Promise<string | null>;
}) {
  const today = startOfDay(new Date());
  const opening = initialMonth ? new Date(initialMonth) : today;

  const [cursor, setCursor] = useState(new Date(opening.getFullYear(), opening.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const [showVideos, setShowVideos] = useState(true);
  const [localMarkers, setLocalMarkers] = useState(markers);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  useEffect(() => setLocalMarkers(markers), [markers]);

  // Remembered per browser: the CEO who prefers the calendar without
  // videos should not have to switch them off every visit.
  useEffect(() => {
    if (!videoToggle) return;
    try {
      if (window.localStorage.getItem("calendar.showVideos") === "0") setShowVideos(false);
    } catch {
      /* storage blocked — default on */
    }
  }, [videoToggle]);

  function toggleVideos() {
    const next = !showVideos;
    setShowVideos(next);
    try {
      window.localStorage.setItem("calendar.showVideos", next ? "1" : "0");
    } catch {
      /* fine */
    }
  }

  const visibleMarkers = localMarkers.filter((m) => m.kind !== "video" || showVideos);
  const markersByDay = new Map<string, CalendarMarker[]>();
  for (const m of visibleMarkers) {
    if (!markersByDay.has(m.date)) markersByDay.set(m.date, []);
    markersByDay.get(m.date)!.push(m);
  }

  async function drop(key: string) {
    const id = dragId;
    setDragId(null);
    setDropKey(null);
    if (!id || !onMoveMarker) return;
    const before = localMarkers.find((m) => m.id === id);
    if (!before || before.date === key) return;
    setLocalMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, date: key } : m)));
    setMoveError(null);
    const err = await onMoveMarker(id, key);
    if (err) {
      setLocalMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, date: before.date } : m)));
      setMoveError(err);
    }
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const colourFor = (id: string | null) => categoryById.get(id ?? "")?.colour ?? FALLBACK_COLOUR;
  const nameFor = (id: string | null) => categoryById.get(id ?? "")?.name ?? "Uncategorised";

  // Bucket events by local day so a 9am entry lands on its own date
  // rather than whatever UTC says.
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of events) {
    const key = dayKey(new Date(e.starts_at));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  const cells = buildGrid(cursor);
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const selectedEvents = selected ? byDay.get(selected) ?? [] : [];
  const selectedMarkers = selected ? markersByDay.get(selected) ?? [] : [];
  const videoCount = localMarkers.filter((m) => m.kind === "video").length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="btn"
          aria-label="Previous month"
        >
          ←
        </button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: 0, minWidth: 190 }}>{monthLabel}</h2>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="btn"
          aria-label="Next month"
        >
          →
        </button>
        <button
          type="button"
          onClick={() => {
            setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelected(null);
          }}
          className="btn"
        >
          Today
        </button>
        {videoToggle && (
          <button
            type="button"
            className="btn"
            aria-pressed={showVideos}
            onClick={toggleVideos}
            style={{
              marginLeft: "auto",
              background: showVideos ? MARKER_COLOUR.video : undefined,
              color: showVideos ? "#fff" : undefined,
              borderColor: MARKER_COLOUR.video,
            }}
          >
            {MARKER_ICON.video} Video schedule{videoCount ? ` (${videoCount})` : ""} {showVideos ? "on" : "off"}
          </button>
        )}
      </div>

      {moveError && (
        <p role="alert" style={{ color: "var(--danger-fg)", fontSize: 13, margin: "0 0 10px" }}>
          {moveError}
        </p>
      )}
      {onMoveMarker && showVideos && videoCount > 0 && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", margin: "0 0 10px" }}>
          Drag a video onto another day to move it.
        </p>
      )}

      {/* Key. Without it the colours are decoration rather than
          information. */}
      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
          {categories.map((c) => (
            <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                aria-hidden="true"
                style={{ width: 11, height: 11, borderRadius: 3, background: c.colour, flexShrink: 0 }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>{c.name}</span>
            </span>
          ))}
        </div>
      )}

      <div className="month-grid-head">
        {WEEKDAYS.map((d) => (
          <span key={d} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", padding: "0 4px 6px" }}>
            {d}
          </span>
        ))}
      </div>

      <div className="month-grid">
        {cells.map((cell) => {
          const key = dayKey(cell.date);
          const dayEvents = byDay.get(key) ?? [];
          const dayMarkers = markersByDay.get(key) ?? [];
          const total = dayEvents.length + dayMarkers.length;
          const isToday = cell.date.getTime() === today.getTime();
          const open = () => setSelected(total > 0 ? (selected === key ? null : key) : null);

          return (
            // A div, not a button: a draggable video inside a <button>
            // cannot be picked up in every browser.
            <div
              role="button"
              tabIndex={0}
              key={key}
              data-day={key}
              onClick={open}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open();
                }
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (dropKey !== key) setDropKey(key);
              }}
              onDragLeave={() => dropKey === key && setDropKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                drop(key);
              }}
              aria-label={`${cell.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${total} entries`}
              style={{
                outline: dropKey === key ? `2px dashed ${MARKER_COLOUR.video}` : undefined,
                textAlign: "left",
                minHeight: 92,
                padding: "6px 7px",
                border: selected === key ? "1px solid var(--accent)" : "1px solid var(--border)",
                boxShadow: selected === key ? `0 0 0 2px var(--accent-ring)` : "none",
                borderRadius: "var(--radius-sm)",
                background: cell.inMonth ? "var(--surface)" : "var(--surface-2)",
                opacity: cell.inMonth ? 1 : 0.45,
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                cursor: total > 0 ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: isToday ? "var(--accent-fg)" : "var(--text-2)",
                  background: isToday ? "var(--accent)" : "transparent",
                  borderRadius: "var(--radius-pill)",
                  padding: isToday ? "1px 7px" : "1px 0",
                  alignSelf: "flex-start",
                  fontWeight: isToday ? 700 : 400,
                }}
              >
                {cell.date.getDate()}
              </span>

              {dayMarkers.slice(0, 3).map((m) => (
                <span
                  key={m.id}
                  data-marker-id={m.id}
                  draggable={Boolean(m.movable && onMoveMarker)}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", m.id);
                    setDragId(m.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropKey(null);
                  }}
                  title={[m.title, m.detail].filter(Boolean).join(" — ")}
                  style={{
                    display: "block",
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    lineHeight: 1.3,
                    color: "var(--text-1)",
                    background: `${MARKER_COLOUR[m.kind]}1f`,
                    border: `1px solid ${m.alert ? "var(--danger-fg)" : `${MARKER_COLOUR[m.kind]}66`}`,
                    borderRadius: 999,
                    padding: "1px 6px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: m.movable && onMoveMarker ? "grab" : undefined,
                    opacity: dragId === m.id ? 0.4 : 1,
                  }}
                >
                  <span aria-hidden style={{ color: MARKER_COLOUR[m.kind], marginRight: 3 }}>{MARKER_ICON[m.kind]}</span>
                  {m.title}
                </span>
              ))}

              {dayEvents.slice(0, Math.max(0, 3 - dayMarkers.length)).map((e) => (
                <span
                  key={e.id}
                  title={`${e.title} — ${nameFor(e.category_id)}`}
                  style={{
                    display: "block",
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    lineHeight: 1.3,
                    color: "var(--text-1)",
                    background: `${colourFor(e.category_id)}22`,
                    borderLeft: `3px solid ${colourFor(e.category_id)}`,
                    borderRadius: 3,
                    padding: "2px 4px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {e.all_day ? "" : `${formatTime(e.starts_at)} `}
                  {e.title}
                </span>
              ))}

              {total > 3 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                  +{total - Math.min(3, dayMarkers.length) - Math.min(dayEvents.length, Math.max(0, 3 - dayMarkers.length))} more
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Tapping a day opens its full list — three entries fit in a
          cell on a laptop, fewer on a phone, and a shoot day can
          easily have more. */}
      {selected && selectedEvents.length + selectedMarkers.length > 0 && (
        <div
          style={{
            marginTop: 24,
            padding: "20px 22px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 12px" }}>
            {new Date(selected).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h3>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedMarkers.map((m) => (
              <li
                key={m.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 11px",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${MARKER_COLOUR[m.kind]}`,
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface-2)",
                }}
              >
                <span aria-hidden style={{ color: MARKER_COLOUR[m.kind], minWidth: 46, flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {MARKER_ICON[m.kind]} {m.kind === "video" ? "video" : "due"}
                </span>
                <span style={{ minWidth: 0 }}>
                  {m.href ? (
                    <Link href={m.href} style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)" }}>
                      {m.title}
                    </Link>
                  ) : (
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)" }}>{m.title}</span>
                  )}
                  {m.detail && (
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10.5, color: m.alert ? "var(--danger-fg)" : "var(--text-3)", marginTop: 2 }}>
                      {m.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {selectedEvents.map((e) => (
              <li
                key={e.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 11px",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${colourFor(e.category_id)}`,
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface-2)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", minWidth: 46, flexShrink: 0 }}>
                  {e.all_day ? "all day" : formatTime(e.starts_at)}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)" }}>{e.title}</span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>
                    {[nameFor(e.category_id), showPerson ? e.personName : null, e.clientName, e.location]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Six weeks from the Monday on or before the 1st — a stable grid. */
function buildGrid(monthStart: Date) {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  // getDay(): 0 = Sunday. Shift so Monday is 0.
  const offset = (first.getDay() + 6) % 7;

  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  return Array.from({ length: 42 }, (_, i) => {
    const date = startOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    return { date, inMonth: date.getMonth() === monthStart.getMonth() };
  });
}

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Local calendar day, not a UTC instant. */
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
