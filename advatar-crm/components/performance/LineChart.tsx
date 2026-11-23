"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GrowthSeries, Unit } from "@/lib/performance/growth";

/**
 * A line chart for growth over days or months: one line per platform,
 * plus all of them together in the ink colour. Hover (or arrow keys)
 * moves a crosshair that lists every line's value at that point; the same
 * numbers are in the table underneath, so nothing needs hovering to read.
 *
 * Inline SVG, no charting library. Colours follow the platform, never
 * the order, so a filter that hides a line doesn't repaint the others.
 */

const H = 260;
const M = { top: 14, bottom: 30, left: 52 };

const dayLabel = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = (k: string, withYear: boolean) =>
  new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", ...(withYear ? { year: "2-digit" } : {}), timeZone: "UTC" });
const fullLabel = (k: string, unit: Unit) =>
  unit === "month"
    ? new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    : new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

const colour = (s: GrowthSeries) => (s.rgb ? `rgb(${s.rgb})` : "var(--text-1)");

export function LineChart({
  keys,
  unit,
  series,
  format,
  label,
  zeroBased = true,
}: {
  keys: string[];
  unit: Unit;
  series: GrowthSeries[];
  format: (n: number) => string;
  /** What is measured, e.g. "Views": names the chart for screen readers and the table. */
  label: string;
  /** False for followers: the scale hugs the numbers so a change of a few shows. */
  zeroBased?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [at, setAt] = useState<number | null>(null);
  const id = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const direct = series.length >= 2 && series.length <= 4 && width >= 520;
  const right = direct ? 112 : 16;
  const plotW = width - M.left - right;
  const plotH = H - M.top - M.bottom;

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  let lo = zeroBased ? 0 : Math.min(...all);
  let hi = Math.max(...all, zeroBased ? 1 : lo + 1);
  if (!zeroBased) {
    const pad = Math.max(1, (hi - lo) * 0.15);
    lo = Math.max(0, lo - pad);
    hi = hi + pad;
  }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step || step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);

  const x = (i: number) => M.left + (keys.length <= 1 ? plotW / 2 : (i / (keys.length - 1)) * plotW);
  const y = (v: number) => M.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const pathOf = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // About six dates along the bottom.
  const every = Math.max(1, Math.ceil(keys.length / Math.max(2, Math.floor(plotW / 90))));
  const years = new Set(keys.map((k) => k.slice(0, 4))).size > 1;
  const xTicks = keys.map((k, i) => ({ k, i })).filter(({ i }) => i % every === 0 || i === keys.length - 1).filter(({ i }, n, arr) => i === keys.length - 1 || n === arr.length - 1 || arr[n + 1].i - i >= every * 0.6);

  // Direct labels at the end of each line, kept apart and joined back to their line.
  const ends = direct
    ? series
        .map((s) => {
          let i = s.values.length - 1;
          while (i >= 0 && s.values[i] == null) i--;
          return i >= 0 ? { s, i, v: s.values[i] as number, ty: y(s.values[i] as number) } : null;
        })
        .filter((e): e is { s: GrowthSeries; i: number; v: number; ty: number } => !!e)
        .sort((a, b) => a.ty - b.ty)
    : [];
  for (let n = 1; n < ends.length; n++) if (ends[n].ty - ends[n - 1].ty < 15) ends[n].ty = ends[n - 1].ty + 15;

  const dots = keys.length <= 24;

  function move(clientX: number) {
    const box = wrap.current?.querySelector("svg")?.getBoundingClientRect();
    if (!box || !keys.length) return;
    const px = ((clientX - box.left) / box.width) * width;
    const i = keys.length <= 1 ? 0 : Math.round(((px - M.left) / plotW) * (keys.length - 1));
    setAt(Math.max(0, Math.min(keys.length - 1, i)));
  }

  const tipLeft = at == null ? 0 : (x(at) / width) * 100;

  return (
    <div className="lc">
      {series.length >= 2 && (
        <ul className="lc-legend" aria-label="Lines">
          {series.map((s) => (
            <li key={s.id}>
              <span className="lc-key" style={{ background: colour(s), height: s.rgb ? 2 : 3 }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="lc-plot" ref={wrap}>
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`${label}, ${keys.length ? `${fullLabel(keys[0], unit)} to ${fullLabel(keys[keys.length - 1], unit)}` : ""}. Use the left and right arrow keys to read each point; the table below has every number.`}
          tabIndex={0}
          onPointerMove={(e) => move(e.clientX)}
          onPointerLeave={() => setAt(null)}
          onFocus={() => setAt((a) => a ?? keys.length - 1)}
          onBlur={() => setAt(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setAt((a) => Math.max(0, (a ?? keys.length) - 1));
            else if (e.key === "ArrowRight") setAt((a) => Math.min(keys.length - 1, (a ?? -1) + 1));
            else return;
            e.preventDefault();
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="lc-tick">
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map(({ k, i }) => (
            <text key={k} x={x(i)} y={H - 8} textAnchor={keys.length > 1 && i === keys.length - 1 ? "end" : i === 0 && keys.length > 1 ? "start" : "middle"} className="lc-tick">
              {unit === "month" ? monthLabel(k, years) : dayLabel(k)}
            </text>
          ))}
          {at != null && <line x1={x(at)} x2={x(at)} y1={M.top} y2={M.top + plotH} stroke="var(--text-3)" strokeWidth={1} />}
          {series.map((s) => (
            <g key={s.id}>
              <path d={pathOf(s.values)} fill="none" stroke={colour(s)} strokeWidth={s.rgb ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) =>
                v != null && (dots || at === i || (s.values[i - 1] == null && s.values[i + 1] == null)) ? (
                  <circle key={i} cx={x(i)} cy={y(v)} r={at === i ? 5 : 3.5} fill={colour(s)} stroke="var(--surface-solid, var(--bg, #fff))" strokeWidth={2} />
                ) : null
              )}
            </g>
          ))}
          {ends.map((e) => (
            <g key={e.s.id}>
              <line x1={x(e.i) + 6} x2={M.left + plotW + 8} y1={y(e.v)} y2={e.ty} stroke="var(--text-3)" strokeWidth={1} opacity={0.5} />
              <text x={M.left + plotW + 12} y={e.ty} dy="0.32em" className="lc-end">
                <tspan className="lc-end-v">{format(e.v)}</tspan> {e.s.label}
              </text>
            </g>
          ))}
        </svg>
        {at != null && (
          <div className="lc-tip" style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 60 ? "calc(-100% - 12px)" : "12px"})` }} role="status">
            <p className="lc-tip-day">{fullLabel(keys[at], unit)}</p>
            {series.map((s) => (
              <p key={s.id} className="lc-tip-row">
                <span className="lc-key" style={{ background: colour(s) }} aria-hidden />
                <strong>{s.values[at] == null ? "–" : format(s.values[at] as number)}</strong>
                <span>{s.label}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="lc-table">
        <summary>Show as a table</summary>
        <div className="perf-scroll">
          <table className="perf-table" aria-describedby={id}>
            <caption id={id} className="sr-only">
              {label}
            </caption>
            <thead>
              <tr>
                <th>{unit === "month" ? "Month" : "Day"}</th>
                {series.map((s) => (
                  <th key={s.id}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) =>
                series.some((s) => s.values[i] != null) ? (
                  <tr key={k}>
                    <th scope="row">{fullLabel(k, unit)}</th>
                    {series.map((s) => (
                      <td key={s.id}>{s.values[i] == null ? "–" : format(s.values[i] as number)}</td>
                    ))}
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
