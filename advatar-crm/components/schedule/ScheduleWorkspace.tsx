"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WeekGrid } from "./WeekGrid";
import {
  BLOCK_COLOURS,
  BLOCK_COLUMNS,
  CALENDAR_KINDS,
  DAY_NAMES,
  PRESET_COLUMNS,
  STARTER_PRESETS,
  addDays,
  isoDate,
  labelToMinutes,
  loadWeekbook,
  minutesToLabel,
  startOfWeek,
  type BlockColour,
  type CalendarKind,
  type PlannerBlock,
  type PlannerPreset,
  type Weekbook,
} from "@/lib/planner-week";

/** What the editor is holding. Null when nothing is open. */
interface Draft {
  id: string | null;
  title: string;
  notes: string;
  weekday: number;
  date: string;
  start: string;
  end: string;
  repeats: boolean;
  color: BlockColour | null;
  calendarKind: CalendarKind;
  onCalendar: boolean;
  existingEventId: string | null;
}

/**
 * The Schedule tab.
 *
 * Your own week, by the hour, and nobody else's: both tables are
 * owner-only (0036), so there is no role check in this file because
 * there is nothing to check.
 *
 * The one place it reaches outside itself is the "show on the team
 * calendar" tick, which writes a row into schedule_events — the
 * company diary everyone can see. That is why it is a deliberate tick
 * rather than the default: most of a week is nobody else's business,
 * and the few things that are get said so explicitly.
 */
export function ScheduleWorkspace({
  initial,
  initialWeek,
  canShare,
  myId,
}: {
  initial: Weekbook;
  /** YYYY-MM-DD of the Monday first shown, decided on the server. */
  initialWeek: string;
  /**
   * Whether this person may write to the company calendar. Videographers
   * and clients read schedule_events but cannot add to it (0018), so
   * for them the tick would be a button that always failed.
   */
  canShare: boolean;
  myId: string;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [weekStart, setWeekStart] = useState(() => {
    const [y, m, d] = initialWeek.split("-").map(Number);
    return startOfWeek(new Date(y, m - 1, d));
  });
  const [blocks, setBlocks] = useState<PlannerBlock[]>(initial.blocks);
  const [presets, setPresets] = useState<PlannerPreset[]>(initial.presets);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wholeDay, setWholeDay] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fixed on the client after mount: rendering "today" on the server
  // would bake Vercel's UTC date into the HTML and light the wrong
  // column for anyone looking late in the evening.
  const [today, setToday] = useState("");
  useEffect(() => setToday(isoDate(new Date())), []);

  const dayStartHour = wholeDay ? 0 : 6;
  const dayEndHour = wholeDay ? 24 : 23;

  function fail(message: string) {
    setError(message);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------------------------------------------------------
  // The week on screen
  // ---------------------------------------------------------------

  const refetch = useCallback(
    async (start: Date) => {
      setLoading(true);
      const book = await loadWeekbook(supabase, isoDate(start), isoDate(addDays(start, 6)));
      setLoading(false);
      if (book.available) setBlocks(book.blocks);
    },
    [supabase]
  );

  // Repeating blocks are already in hand; only the dated ones change
  // with the week, so this refetches rather than paging in memory.
  async function goToWeek(start: Date) {
    setWeekStart(start);
    setDraft(null);
    await refetch(start);
  }

  // ---------------------------------------------------------------
  // The starter set
  // ---------------------------------------------------------------
  // Added once, the first time somebody opens the tab with nothing
  // saved. The ref stops React's double-invoked effects in development
  // from sending it twice; the unique index on (owner, name) would
  // refuse the duplicates anyway, which is the real guarantee.
  const seeded = useRef(false);

  useEffect(() => {
    if (!initial.available || presets.length > 0 || seeded.current) return;
    seeded.current = true;

    (async () => {
      const { data, error: e } = await supabase
        .from("planner_presets")
        .insert(STARTER_PRESETS.map((p) => ({ ...p, owner_id: myId })))
        .select(PRESET_COLUMNS);
      if (!e && data) setPresets(data as PlannerPreset[]);
    })();
  }, [initial.available, presets.length, supabase, myId]);

  // ---------------------------------------------------------------
  // Opening the editor
  // ---------------------------------------------------------------

  function openSlot(weekday: number, date: string, startMinute: number) {
    setError(null);
    setDraft({
      id: null,
      title: "",
      notes: "",
      weekday,
      date,
      start: minutesToLabel(startMinute),
      end: minutesToLabel(Math.min(1440, startMinute + 60)),
      repeats: false,
      color: null,
      calendarKind: "other",
      onCalendar: false,
      existingEventId: null,
    });
  }

  function openBlock(block: PlannerBlock) {
    setError(null);
    setDraft({
      id: block.id,
      title: block.title,
      notes: block.notes,
      weekday: block.weekday,
      date: block.on_date ?? isoDate(addDays(weekStart, block.weekday)),
      start: minutesToLabel(block.start_minute),
      end: minutesToLabel(block.end_minute),
      repeats: block.repeats,
      color: block.color,
      calendarKind: block.calendar_kind,
      onCalendar: Boolean(block.schedule_event_id),
      existingEventId: block.schedule_event_id,
    });
  }

  /** Drops a saved item onto the first free-looking hour of today. */
  function usePreset(preset: PlannerPreset) {
    setError(null);
    const base = today || isoDate(weekStart);
    const [y, m, d] = base.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const weekday = (date.getDay() + 6) % 7;
    const start = 9 * 60;

    setDraft({
      id: null,
      title: preset.name,
      notes: "",
      weekday,
      date: base,
      start: minutesToLabel(start),
      end: minutesToLabel(Math.min(1440, start + preset.default_minutes)),
      repeats: false,
      color: preset.color,
      calendarKind: preset.calendar_kind,
      onCalendar: false,
      existingEventId: null,
    });
  }

  // ---------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------

  /**
   * Creates, updates or removes the company-calendar entry that goes
   * with a block, and returns the id to store.
   *
   * Only ever for a dated block. A routine has no single date, so
   * there is no one event to create for it — see the note in the
   * editor.
   */
  async function syncCalendar(
    draftNow: Draft,
    startMinute: number,
    endMinute: number
  ): Promise<string | null> {
    const wanted = draftNow.onCalendar && !draftNow.repeats && canShare;

    if (!wanted) {
      if (draftNow.existingEventId) {
        await supabase.from("schedule_events").delete().eq("id", draftNow.existingEventId);
      }
      return null;
    }

    const at = (minute: number) => {
      const [y, m, d] = draftNow.date.split("-").map(Number);
      return new Date(y, m - 1, d, Math.floor(minute / 60), minute % 60).toISOString();
    };

    const row = {
      title: draftNow.title.trim(),
      starts_at: at(startMinute),
      ends_at: at(endMinute),
      kind: draftNow.calendarKind,
      assigned_to: myId,
      notes: draftNow.notes.trim() || null,
    };

    if (draftNow.existingEventId) {
      const { error: e } = await supabase
        .from("schedule_events")
        .update(row)
        .eq("id", draftNow.existingEventId);
      if (e) throw new Error(e.message);
      return draftNow.existingEventId;
    }

    const { data, error: e } = await supabase
      .from("schedule_events")
      .insert(row)
      .select("id")
      .single();
    if (e || !data) throw new Error(e?.message ?? "Could not add it to the team calendar.");
    return (data as { id: string }).id;
  }

  async function save() {
    if (!draft) return;

    const title = draft.title.trim();
    if (!title) return fail("Give it a name.");

    const start = labelToMinutes(draft.start);
    const end = labelToMinutes(draft.end);
    if (start === null || end === null) return fail("Use times like 09:00.");
    if (end <= start) return fail("It has to finish after it starts.");

    setBusy(true);
    setError(null);

    try {
      const eventId = await syncCalendar(draft, start, end);

      const row = {
        title: title.slice(0, 120),
        notes: draft.notes.slice(0, 2000),
        weekday: draft.weekday,
        start_minute: start,
        end_minute: end,
        on_date: draft.repeats ? null : draft.date,
        repeats: draft.repeats,
        color: draft.color,
        calendar_kind: draft.calendarKind,
        schedule_event_id: eventId,
      };

      const query = draft.id
        ? supabase.from("planner_blocks").update(row).eq("id", draft.id).select(BLOCK_COLUMNS).single()
        : supabase
            .from("planner_blocks")
            .insert({ ...row, owner_id: myId })
            .select(BLOCK_COLUMNS)
            .single();

      const { data, error: e } = await query;
      if (e || !data) throw new Error(e?.message ?? "Could not save that.");

      const saved = data as PlannerBlock;
      setBlocks((prev) => {
        const without = prev.filter((b) => b.id !== saved.id);
        return [...without, saved];
      });
      setDraft(null);
    } catch (problem) {
      fail(problem instanceof Error ? problem.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    if (!window.confirm(`Remove “${draft.title}” from your week?`)) return;

    setBusy(true);
    setError(null);

    // The calendar entry goes with it. Leaving it behind would put a
    // meeting on the team's diary that is in nobody's plan.
    if (draft.existingEventId && canShare) {
      await supabase.from("schedule_events").delete().eq("id", draft.existingEventId);
    }

    const { error: e } = await supabase.from("planner_blocks").delete().eq("id", draft.id);
    setBusy(false);
    if (e) return fail(e.message);

    setBlocks((prev) => prev.filter((b) => b.id !== draft.id));
    setDraft(null);
  }

  /** Keeps a block's shape as a saved item for next time. */
  async function saveAsPreset() {
    if (!draft) return;
    const name = draft.title.trim();
    if (!name) return fail("Give it a name first.");

    const start = labelToMinutes(draft.start);
    const end = labelToMinutes(draft.end);
    const minutes = start !== null && end !== null && end > start ? end - start : 60;

    setBusy(true);
    const { data, error: e } = await supabase
      .from("planner_presets")
      .insert({
        owner_id: myId,
        name: name.slice(0, 60),
        color: draft.color,
        default_minutes: Math.min(1440, Math.max(5, minutes)),
        calendar_kind: draft.calendarKind,
        position: presets.length,
      })
      .select(PRESET_COLUMNS)
      .single();
    setBusy(false);

    if (e) {
      return fail(
        e.code === "23505" ? `You already have a saved item called “${name}”.` : e.message
      );
    }
    if (data) setPresets((prev) => [...prev, data as PlannerPreset]);
  }

  async function removePreset(preset: PlannerPreset) {
    if (!window.confirm(`Remove the saved item “${preset.name}”?`)) return;
    const { error: e } = await supabase.from("planner_presets").delete().eq("id", preset.id);
    if (e) return fail(e.message);
    setPresets((prev) => prev.filter((p) => p.id !== preset.id));
  }

  // ---------------------------------------------------------------

  const weekLabel = `${addDays(weekStart, 0).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${addDays(weekStart, 6).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <>
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
            padding: "12px 14px",
            margin: "0 0 18px",
          }}
        >
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button type="button" className="btn" onClick={() => goToWeek(addDays(weekStart, -7))}>
          ←
        </button>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: 17, minWidth: 190 }}>{weekLabel}</strong>
        <button type="button" className="btn" onClick={() => goToWeek(addDays(weekStart, 7))}>
          →
        </button>
        <button type="button" className="btn" onClick={() => goToWeek(startOfWeek(new Date()))}>
          This week
        </button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)" }}>
          <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} />
          All 24 hours
        </label>
        {loading && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>Loading…</span>
        )}
      </div>

      {/* Saved items. Tap one and it opens the editor already filled in. */}
      {presets.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              marginBottom: 7,
            }}
          >
            Saved items — tap to drop one in
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {presets.map((p) => (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <button type="button" className="preset-chip" onClick={() => usePreset(p)}>
                  <span
                    className="note-dot"
                    style={p.color ? ({ "--note-label": `var(--label-${p.color})` } as React.CSSProperties) : {}}
                  />
                  {p.name}
                  <span style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                    {p.default_minutes}m
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removePreset(p)}
                  aria-label={`Remove the saved item ${p.name}`}
                  title={`Remove ${p.name}`}
                  style={{
                    border: "none",
                    background: "none",
                    color: "var(--text-3)",
                    cursor: "pointer",
                    fontSize: 13,
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        dayStartHour={dayStartHour}
        dayEndHour={dayEndHour}
        today={today}
        onPickSlot={openSlot}
        onPickBlock={openBlock}
      />

      {draft && (
        <BlockEditor
          draft={draft}
          setDraft={setDraft}
          weekStart={weekStart}
          canShare={canShare}
          busy={busy}
          onSave={save}
          onRemove={remove}
          onSaveAsPreset={saveAsPreset}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}

// =================================================================

function BlockEditor({
  draft,
  setDraft,
  weekStart,
  canShare,
  busy,
  onSave,
  onRemove,
  onSaveAsPreset,
  onClose,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  weekStart: Date;
  canShare: boolean;
  busy: boolean;
  onSave: () => void;
  onRemove: () => void;
  onSaveAsPreset: () => void;
  onClose: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={draft.id ? "Edit this block" : "Add to your week"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(8px, 3vw, 28px)",
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          maxHeight: "100%",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: 18,
        }}
      >
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 19, margin: "0 0 14px" }}>
          {draft.id ? "Edit" : "Add to your week"}
        </h2>

        <Field label="What is it?">
          <input
            autoFocus
            value={draft.title}
            maxLength={120}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Deep work, gym, client call…"
            style={{ width: "100%" }}
          />
        </Field>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="From" style={{ flex: "1 1 120px" }}>
            <input type="time" value={draft.start} onChange={(e) => set("start", e.target.value)} style={{ width: "100%" }} />
          </Field>
          <Field label="To" style={{ flex: "1 1 120px" }}>
            <input type="time" value={draft.end} onChange={(e) => set("end", e.target.value)} style={{ width: "100%" }} />
          </Field>
        </div>

        <Field label="Every week?">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-body)", fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={draft.repeats}
              onChange={(e) => {
                const repeats = e.target.checked;
                // A routine cannot also be a single calendar entry —
                // there is no one date for it to sit on.
                setDraft({ ...draft, repeats, onCalendar: repeats ? false : draft.onCalendar });
              }}
            />
            Repeat this every {DAY_NAMES[draft.weekday]}
          </label>
        </Field>

        {!draft.repeats && (
          <Field label="Which day">
            <select
              value={draft.date}
              onChange={(e) => {
                const date = e.target.value;
                const [y, m, d] = date.split("-").map(Number);
                set("date", date);
                // Keep the weekday in step with the date. The database
                // derives it too (0036), so this is only so the grid
                // moves the block straight away.
                setDraft({ ...draft, date, weekday: (new Date(y, m - 1, d).getDay() + 6) % 7 });
              }}
              style={{ width: "100%" }}
            >
              {DAY_NAMES.map((name, i) => {
                const d = addDays(weekStart, i);
                return (
                  <option key={name} value={isoDate(d)}>
                    {name} {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </option>
                );
              })}
            </select>
          </Field>
        )}

        <Field label="Colour">
          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              className="note-swatch note-swatch-none"
              aria-label="No colour"
              aria-pressed={draft.color === null}
              onClick={() => set("color", null)}
            >
              ×
            </button>
            {BLOCK_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                className="note-swatch"
                style={{ "--note-label": `var(--label-${c})` } as React.CSSProperties}
                aria-label={c}
                aria-pressed={draft.color === c}
                onClick={() => set("color", c)}
              />
            ))}
          </span>
        </Field>

        <Field label="Notes" optional>
          <textarea
            value={draft.notes}
            maxLength={2000}
            rows={2}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Anything you want to remember about it."
            style={{ width: "100%", resize: "vertical" }}
          />
        </Field>

        {/* The one thing here that other people can see. */}
        {canShare && (
          <div
            style={{
              marginTop: 4,
              padding: "11px 13px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
            }}
          >
            {draft.repeats ? (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", margin: 0, lineHeight: 1.55 }}>
                A weekly routine stays in your own schedule. To put one of
                these on the team calendar, untick &ldquo;every week&rdquo; for the
                one you want them to see — a repeat has no single date to
                sit on, so it would either appear once or forever.
              </p>
            ) : (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-body)", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={draft.onCalendar}
                    onChange={(e) => set("onCalendar", e.target.checked)}
                  />
                  Also show this on the team calendar
                </label>
                {draft.onCalendar && (
                  <div style={{ marginTop: 10 }}>
                    <Field label="Show it as">
                      <select
                        value={draft.calendarKind}
                        onChange={(e) => set("calendarKind", e.target.value as CalendarKind)}
                        style={{ width: "100%" }}
                      >
                        {CALENDAR_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k === "shoot" ? "Shoot day" : k[0].toUpperCase() + k.slice(1)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>
                      Everyone who can see the Calendar tab will see this one.
                      The rest of your week stays private.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : draft.id ? "Save" : "Add it"}
          </button>
          <button type="button" className="btn" onClick={onSaveAsPreset} disabled={busy}>
            Save for reuse
          </button>
          <span style={{ flex: 1 }} />
          {draft.id && (
            <button type="button" className="btn" onClick={onRemove} disabled={busy}>
              Remove
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  optional = false,
  style,
}: {
  label: string;
  children: React.ReactNode;
  optional?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12, ...style }}>
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-2)",
          marginBottom: 5,
        }}
      >
        {label}
        {optional && <span style={{ color: "var(--text-3)", marginLeft: 5 }}>(optional)</span>}
      </span>
      {children}
    </label>
  );
}
