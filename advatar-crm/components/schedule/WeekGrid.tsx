"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  DAY_NAMES,
  addDays,
  blocksForDay,
  isoDate,
  layOutDay,
  minutesToLabel,
  type PlannerBlock,
} from "@/lib/planner-week";

/** How tall one hour is. Everything else is derived from this. */
const HOUR_PX = 46;

/**
 * The week, drawn by the hour.
 *
 * Presentational on purpose: it is handed the blocks and two
 * callbacks, and knows nothing about saving. Clicking empty space
 * starts something new at that hour; clicking a block opens it.
 */
export function WeekGrid({
  weekStart,
  blocks,
  dayStartHour,
  dayEndHour,
  today,
  onPickSlot,
  onPickBlock,
}: {
  weekStart: Date;
  blocks: PlannerBlock[];
  dayStartHour: number;
  dayEndHour: number;
  /** YYYY-MM-DD, so the right column can be marked. */
  today: string;
  onPickSlot: (weekday: number, date: string, startMinute: number) => void;
  onPickBlock: (block: PlannerBlock) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: dayEndHour - dayStartHour }, (_, i) => dayStartHour + i);
  const gridHeight = hours.length * HOUR_PX;

  // Open somewhere useful. Without this a day that starts at midnight
  // opens on six hours of empty night.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const openAt = Math.max(0, (8 - dayStartHour) * HOUR_PX - 20);
    el.scrollTop = openAt;
  }, [dayStartHour]);

  return (
    <div className="week-grid-wrap">
      {/* The day names stay put while the hours scroll under them. */}
      <div className="week-grid-head">
        <span className="week-grid-gutter" aria-hidden="true" />
        {DAY_NAMES.map((name, i) => {
          const date = addDays(weekStart, i);
          const iso = isoDate(date);
          return (
            <div key={name} className={"week-grid-day-head" + (iso === today ? " is-today" : "")}>
              <span className="week-grid-day-name">{name}</span>
              <span className="week-grid-day-num">{date.getDate()}</span>
            </div>
          );
        })}
      </div>

      <div className="week-grid-scroll" ref={scrollRef}>
        <div className="week-grid" style={{ height: gridHeight }}>
          <div className="week-grid-gutter">
            {hours.map((h) => (
              <span key={h} className="week-grid-hour-label" style={{ top: (h - dayStartHour) * HOUR_PX }}>
                {minutesToLabel(h * 60)}
              </span>
            ))}
          </div>

          {DAY_NAMES.map((name, weekday) => {
            const date = addDays(weekStart, weekday);
            const iso = isoDate(date);
            const laid = layOutDay(blocksForDay(blocks, weekday, iso));

            return (
              <div key={name} className={"week-grid-col" + (iso === today ? " is-today" : "")}>
                {/* One button per hour, so the whole grid is reachable
                    by keyboard and a tap lands on a known hour rather
                    than wherever the finger happened to be. */}
                {hours.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="week-grid-slot"
                    style={{ top: (h - dayStartHour) * HOUR_PX, height: HOUR_PX }}
                    aria-label={`Add something at ${minutesToLabel(h * 60)} on ${name} ${date.getDate()}`}
                    onClick={() => onPickSlot(weekday, iso, h * 60)}
                  />
                ))}

                {laid.map(({ block, column, columns }) => {
                  const top = ((block.start_minute - dayStartHour * 60) / 60) * HOUR_PX;
                  const height = ((block.end_minute - block.start_minute) / 60) * HOUR_PX;

                  // Anything outside the hours on screen is skipped
                  // rather than drawn off the top, which would show as
                  // a block stuck to the first hour.
                  if (block.end_minute <= dayStartHour * 60 || block.start_minute >= dayEndHour * 60) {
                    return null;
                  }

                  const width = 100 / columns;
                  return (
                    <button
                      key={block.id}
                      type="button"
                      className={"week-block" + (block.repeats ? " is-repeating" : "")}
                      style={
                        {
                          top: Math.max(0, top),
                          height: Math.max(18, height - 2),
                          left: `${column * width}%`,
                          width: `calc(${width}% - 3px)`,
                          ...(block.color ? { "--block-colour": `var(--label-${block.color})` } : {}),
                        } as CSSProperties
                      }
                      onClick={() => onPickBlock(block)}
                      title={`${block.title} · ${minutesToLabel(block.start_minute)}–${minutesToLabel(block.end_minute)}`}
                    >
                      <span className="week-block-title">{block.title}</span>
                      {height > 34 && (
                        <span className="week-block-time">
                          {minutesToLabel(block.start_minute)}–{minutesToLabel(block.end_minute)}
                        </span>
                      )}
                      {/* Two marks, both small: a dot for a routine, a
                          ring for something the team can also see. */}
                      {block.repeats && <span className="week-block-mark" title="Every week">↻</span>}
                      {block.schedule_event_id && (
                        <span className="week-block-mark week-block-shared" title="Also on the team calendar">
                          ●
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
