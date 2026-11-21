"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  OVERVIEW_PLACEHOLDER,
  makeId,
  type PlannerContent,
  type PlannerOverviewGoal,
  type PlannerOverviewShoot,
  type PlannerOverviewSlot,
} from "@/lib/planner/content";
import { todayKey } from "@/lib/videos";

type Overview = PlannerContent["overview"];
type Field = "goals" | "schedule" | "shoots" | "focus";

function prettyDate(v: string): { day: string; month: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return {
    day: d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
  };
}

/**
 * The Overview tab: the first thing a client sees in their plan.
 *
 * This month's goals, the content pillars, the posting rhythm, the next
 * shoot dates and how far through the month's videos we are. The
 * progress bar is real (posted videos in the current month); the rest
 * is written by the team here, and shows tasteful example content to
 * the client until it has been.
 */
export function OverviewBoard({
  clientId,
  overview,
  pillars,
  editable,
  onChange,
}: {
  clientId: string;
  overview: Overview;
  pillars: PlannerContent["pillars"]["items"];
  editable: boolean;
  onChange: (field: Field, value: unknown) => void;
}) {
  const goals = overview.goals ?? [];
  const schedule = overview.schedule ?? [];
  const shoots = overview.shoots ?? [];

  // The client sees examples where nothing has been written yet.
  const showGoals = goals.length ? goals : editable ? [] : OVERVIEW_PLACEHOLDER.goals;
  const showSchedule = schedule.length ? schedule : editable ? [] : OVERVIEW_PLACEHOLDER.schedule;
  const showShoots = shoots.length ? shoots : editable ? [] : OVERVIEW_PLACEHOLDER.shoots;
  const realPillars = pillars.filter((p) => p.name?.trim());
  const showPillars = realPillars.length
    ? realPillars.map((p) => ({ name: p.name, pct: Number(p.pct) || 0, color: p.color || "" }))
    : OVERVIEW_PLACEHOLDER.pillars;
  const pillarTotal = showPillars.reduce((n, p) => n + (p.pct || 0), 0) || 1;

  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayKey();
      const { data: cycles, error } = await supabase
        .from("content_cycles")
        .select("id, number, starts_on, ends_on")
        .eq("client_id", clientId)
        .order("number");
      if (cancelled || error || !cycles?.length) return;
      const list = cycles as { id: string; number: number; starts_on: string; ends_on: string }[];
      const now = list.find((c) => c.starts_on <= today && today <= c.ends_on) ?? list[list.length - 1];
      const { data: vids } = await supabase.from("content_videos").select("id, posted_at").eq("cycle_id", now.id);
      if (cancelled || !vids) return;
      const rows = vids as { posted_at: string | null }[];
      setProgress({ label: `Month ${now.number}`, done: rows.filter((v) => v.posted_at).length, total: rows.length });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, clientId]);

  const bar = progress && progress.total > 0 ? progress : { label: "This month", done: 3, total: 8 };
  const pct = Math.round((bar.done / Math.max(bar.total, 1)) * 100);
  const goalsDone = showGoals.filter((g) => g.done).length;

  return (
    <section className="ov">
      {editable && (
        <p className="ov-note">
          This is what the client sees first. Until you fill a box in, they see example content in it. The progress bar counts
          posted videos in the current month automatically.
        </p>
      )}

      <div className="ov-hero">
        <div className="ov-hero-text">
          <span className="ov-eyebrow">{bar.label}</span>
          {editable ? (
            <input
              className="ov-input ov-focus-input"
              defaultValue={overview.focus ?? ""}
              placeholder={OVERVIEW_PLACEHOLDER.focus}
              onBlur={(e) => onChange("focus", e.target.value)}
              aria-label="This month's focus"
            />
          ) : (
            <h2 className="ov-focus">{overview.focus?.trim() || OVERVIEW_PLACEHOLDER.focus}</h2>
          )}
        </div>
        <div className="ov-progress" aria-label={`${bar.done} of ${bar.total} videos posted`}>
          <div className="ov-progress-top">
            <span>Videos posted</span>
            <strong>
              {bar.done} <span>of {bar.total}</span>
            </strong>
          </div>
          <div className="ov-track">
            <div className="ov-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="ov-pct">{pct}% of the month delivered</span>
        </div>
      </div>

      <div className="ov-grid">
        <div className="ov-card ov-goals">
          <header>
            <h3>This month&rsquo;s goals</h3>
            {showGoals.length > 0 && <span className="ov-chip">{goalsDone}/{showGoals.length} done</span>}
          </header>
          {editable ? (
            <ListEditor<PlannerOverviewGoal>
              items={goals}
              blank={() => ({ id: makeId("goal"), text: "", done: false })}
              onChange={(v) => onChange("goals", v)}
              addLabel="+ Add a goal"
              render={(g, set) => (
                <>
                  <input type="checkbox" checked={!!g.done} onChange={(e) => set({ ...g, done: e.target.checked })} aria-label="Done" />
                  <input className="ov-input" defaultValue={g.text} placeholder="e.g. Reach 10k followers on Instagram" onBlur={(e) => set({ ...g, text: e.target.value })} />
                </>
              )}
            />
          ) : (
            <ul className="ov-goal-list">
              {showGoals.map((g) => (
                <li key={g.id} data-done={g.done ? "true" : undefined}>
                  <span className="ov-check" aria-hidden="true">
                    {g.done ? "✓" : ""}
                  </span>
                  <span>{g.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ov-card ov-pillars">
          <header>
            <h3>Content pillars</h3>
          </header>
          <div className="ov-pillar-bar" aria-hidden="true">
            {showPillars.map((p, i) => (
              <span key={i} style={{ flex: Math.max(p.pct, 1), background: p.color || `hsl(${(i * 67 + 230) % 360} 70% 60%)` }} />
            ))}
          </div>
          <ul className="ov-pillar-list">
            {showPillars.map((p, i) => (
              <li key={i}>
                <span className="ov-swatch" style={{ background: p.color || `hsl(${(i * 67 + 230) % 360} 70% 60%)` }} />
                <span className="ov-pillar-name">{p.name}</span>
                <span className="ov-pillar-pct">{Math.round((p.pct / pillarTotal) * 100)}%</span>
              </li>
            ))}
          </ul>
          {editable && <p className="ov-hint">Pillars come from the Pillars tab.</p>}
        </div>

        <div className="ov-card ov-schedule">
          <header>
            <h3>Posting schedule</h3>
          </header>
          {editable ? (
            <ListEditor<PlannerOverviewSlot>
              items={schedule}
              blank={() => ({ id: makeId("slot"), day: "", what: "" })}
              onChange={(v) => onChange("schedule", v)}
              addLabel="+ Add a posting day"
              render={(s, set) => (
                <>
                  <input className="ov-input ov-day" defaultValue={s.day} placeholder="Mon" onBlur={(e) => set({ ...s, day: e.target.value })} />
                  <input className="ov-input" defaultValue={s.what} placeholder="e.g. Reel" onBlur={(e) => set({ ...s, what: e.target.value })} />
                </>
              )}
            />
          ) : (
            <ul className="ov-week">
              {showSchedule.map((s) => (
                <li key={s.id}>
                  <span className="ov-week-day">{s.day}</span>
                  <span className="ov-week-what">{s.what}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ov-card ov-shoots">
          <header>
            <h3>Upcoming shoots</h3>
          </header>
          {editable ? (
            <ListEditor<PlannerOverviewShoot>
              items={shoots}
              blank={() => ({ id: makeId("shoot"), date: "", title: "" })}
              onChange={(v) => onChange("shoots", v)}
              addLabel="+ Add a shoot date"
              render={(s, set) => (
                <>
                  <input className="ov-input ov-date" type="date" defaultValue={s.date} onBlur={(e) => set({ ...s, date: e.target.value })} aria-label="Date" />
                  <input className="ov-input" defaultValue={s.title} placeholder="e.g. Studio shoot — 4 videos" onBlur={(e) => set({ ...s, title: e.target.value })} />
                </>
              )}
            />
          ) : (
            <ul className="ov-shoot-list">
              {showShoots.map((s) => {
                const d = prettyDate(s.date);
                return (
                  <li key={s.id}>
                    <span className="ov-cal">
                      {d ? (
                        <>
                          <strong>{d.day}</strong>
                          <small>{d.month}</small>
                        </>
                      ) : (
                        <strong>TBC</strong>
                      )}
                    </span>
                    <span>{s.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ListEditor<T extends { id: string }>({
  items,
  blank,
  onChange,
  render,
  addLabel,
}: {
  items: T[];
  blank: () => T;
  onChange: (v: T[]) => void;
  render: (item: T, set: (next: T) => void) => React.ReactNode;
  addLabel: string;
}) {
  return (
    <div className="ov-editor">
      {items.map((item, i) => (
        <div className="ov-edit-row" key={item.id}>
          {render(item, (next) => onChange(items.map((x, idx) => (idx === i ? next : x))))}
          <button type="button" className="ov-x" aria-label="Remove" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ov-add" onClick={() => onChange([...items, blank()])}>
        {addLabel}
      </button>
    </div>
  );
}
