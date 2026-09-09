"use client";

import { useState } from "react";
import type { EventCategory, ScheduleEntry } from "./SchedulePanel";

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
}: {
  events: ScheduleEntry[];
  categories: EventCategory[];
  /** ISO date for the month to open on. Defaults to this month. */
  initialMonth?: string;
  /** Whose entry it is — only meaningful on a whole-team calendar. */
  showPerson?: boolean;
}) {
  const today = startOfDay(new Date());
  const opening = initialMonth ? new Date(initialMonth) : today;

  const [cursor, setCursor] = useState(new Date(opening.getFullYear(), opening.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);

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
      </div>

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
          const isToday = cell.date.getTime() === today.getTime();

          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelected(dayEvents.length > 0 ? (selected === key ? null : key) : null)}
              aria-label={`${cell.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${dayEvents.length} entries`}
              style={{
                textAlign: "left",
                minHeight: 92,
                padding: "6px 7px",
                border: selected === key ? "1px solid var(--accent)" : "1px solid var(--border)",
                boxShadow: selected === key ? `0 0 0 2px var(--accent-ring)` : "none",
                borderRadius: "var(--radius-sm)",
                background: cell.inMonth ? "var(--surface)" : "var(--surface-2)",
                opacity: cell.inMonth ? 1 : 0.45,
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                cursor: dayEvents.length > 0 ? "pointer" : "default",
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

              {dayEvents.slice(0, 3).map((e) => (
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

              {dayEvents.length > 3 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                  +{dayEvents.length - 3} more
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tapping a day opens its full list — three entries fit in a
          cell on a laptop, fewer on a phone, and a shoot day can
          easily have more. */}
      {selected && selectedEvents.length > 0 && (
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
