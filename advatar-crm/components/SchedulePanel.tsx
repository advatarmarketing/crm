"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface ScheduleEntry {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  category_id: string | null;
  client_id: string | null;
  assigned_to: string | null;
  clientName?: string | null;
  personName?: string | null;
}

export interface ClientChoice {
  id: string;
  name: string;
}

/** From event_categories (0019) — editable, not a fixed list. */
export interface EventCategory {
  id: string;
  name: string;
  colour: string;
}

// A literal, not a token: this value gets an alpha suffix appended
// (`${colour}22`) to tint a cell, and string-concatenating onto a
// var() produces invalid CSS. Mid grey reads acceptably on both
// themes' grounds.
const FALLBACK_COLOUR = "#8a8a8a";

/**
 * Writes go straight through the browser Supabase client, the same
 * way TaskList and AssignedTeamPanel already do in this codebase, so
 * `schedule_events`' RLS (0018) is what decides whether an edit is
 * allowed rather than a role check in here. `editable` only controls
 * whether the controls are rendered — a read-only surface shows the
 * same list without them.
 */
export function SchedulePanel({
  initialEvents,
  editable = false,
  defaultAssignee = null,
  clients = [],
  categories = [],
  emptyMessage = "Nothing scheduled.",
  showPerson = false,
}: {
  initialEvents: ScheduleEntry[];
  editable?: boolean;
  /** Pre-fills whose schedule a newly added entry lands on. */
  defaultAssignee?: string | null;
  clients?: ClientChoice[];
  /** Event types and their colours, read from event_categories. */
  categories?: EventCategory[];
  emptyMessage?: string;
  /** Dashboard shows whose entry it is; a person's own page doesn't. */
  showPerson?: boolean;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [location, setLocation] = useState("");
  const [clientId, setClientId] = useState("");

  const supabase = createClient();
  const router = useRouter();

  function resetForm() {
    setTitle("");
    setDate("");
    setTime("");
    setCategoryId("");
    setLocation("");
    setClientId("");
  }

  async function addEvent() {
    if (!title.trim() || !date) {
      setError("A title and a date are needed.");
      return;
    }

    setBusy(true);
    setError(null);

    // No time given means an all-day entry. Stored at local midnight
    // rather than UTC midnight so it doesn't slide to the previous
    // day for anyone west of Greenwich.
    const allDay = !time;
    const startsAt = new Date(`${date}T${time || "00:00"}`).toISOString();

    const { data, error: insertError } = await supabase
      .from("schedule_events")
      .insert({
        title: title.trim(),
        starts_at: startsAt,
        all_day: allDay,
        category_id: categoryId || categories[0]?.id || null,
        location: location.trim() || null,
        client_id: clientId || null,
        assigned_to: defaultAssignee,
      })
      .select("id, title, starts_at, ends_at, all_day, location, category_id, client_id, assigned_to")
      .single();

    setBusy(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not add that.");
      return;
    }

    const clientName = clients.find((c) => c.id === clientId)?.name ?? null;
    setEvents((prev) =>
      [...prev, { ...(data as ScheduleEntry), clientName }].sort((a, b) =>
        a.starts_at.localeCompare(b.starts_at)
      )
    );
    resetForm();
    setAdding(false);
    router.refresh();
  }

  async function removeEvent(id: string) {
    const prev = events;
    setEvents((es) => es.filter((e) => e.id !== id)); // optimistic
    const { error: deleteError } = await supabase.from("schedule_events").delete().eq("id", id);
    if (deleteError) {
      setEvents(prev);
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const colourFor = (id: string | null) => categoryById.get(id ?? "")?.colour ?? FALLBACK_COLOUR;
  const nameFor = (id: string | null) => categoryById.get(id ?? "")?.name ?? null;

  const grouped = groupByDay(events);

  return (
    <div>
      {events.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          {emptyMessage}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 14 }}>
          {grouped.map(({ label, isToday, entries }) => (
            <div key={label}>
              <span
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: isToday ? "var(--accent)" : "var(--text-3)",
                  fontWeight: isToday ? 700 : 400,
                  marginBottom: 8,
                }}
              >
                {label}
                {isToday ? " · today" : ""}
              </span>

              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {entries.map((e) => (
                  <li
                    key={e.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 14px",
                      border: "1px solid var(--border)",
                      borderLeft: `3px solid ${colourFor(e.category_id)}`,
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface)",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-2)",
                        flexShrink: 0,
                        minWidth: 44,
                      }}
                    >
                      {e.all_day ? "all day" : formatTime(e.starts_at)}
                    </span>

                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)" }}>
                        {e.title}
                      </span>
                      {(e.category_id || e.clientName || e.location || (showPerson && e.personName)) && (
                        <span
                          style={{
                            display: "block",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10.5,
                            color: "var(--text-3)",
                            marginTop: 2,
                          }}
                        >
                          {[nameFor(e.category_id), showPerson ? e.personName : null, e.clientName, e.location]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </span>

                    {editable && (
                      <button
                        type="button"
                        onClick={() => removeEvent(e.id)}
                        aria-label={`Remove ${e.title}`}
                        title="Remove"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-3)",
                          cursor: "pointer",
                          padding: 4,
                          lineHeight: 0,
                          flexShrink: 0,
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      {editable &&
        (adding ? (
          <div
            style={{
              padding: "14px 16px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
            }}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is it? e.g. Shoot — Bright Co"
              style={{ ...field, marginBottom: 10 }}
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ ...field, flex: "1 1 150px" }}
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                title="Leave blank for an all-day entry"
                style={{ ...field, flex: "1 1 120px" }}
              />
              <select
                value={categoryId || categories[0]?.id || ""}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ ...field, flex: "1 1 150px" }}
              >
                {categories.length === 0 && <option value="">No categories set up</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Where? (optional)"
                style={{ ...field, flex: "1 1 160px" }}
              />
              {clients.length > 0 && (
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  style={{ ...field, flex: "1 1 160px" }}
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={addEvent} disabled={busy} className="btn btn-primary">
                {busy ? "Adding…" : "Add to schedule"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                  resetForm();
                }}
                className="btn"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="btn">
            + Add to schedule
          </button>
        ))}
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Groups entries under a day heading, keeping chronological order. */
function groupByDay(events: ScheduleEntry[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const day = new Date(e.starts_at);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }

  return Array.from(byDay.entries()).map(([key, entries]) => {
    const day = new Date(key);
    return {
      label: day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
      isToday: day.getTime() === today.getTime(),
      entries,
    };
  });
}

const field = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
};
