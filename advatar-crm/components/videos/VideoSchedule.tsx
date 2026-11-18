"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadUploads, type UploadEntry } from "@/lib/uploads";
import { packageFromRow, type PackageSettings } from "@/lib/packages";
import {
  BOX_LABEL,
  BOX_STATES,
  addDays,
  boxState,
  defaultCycleEnd,
  inOrder,
  loadVideos,
  packageCount,
  prettyDay,
  todayKey,
  type BoxState,
  type ContentVideo,
  type VideoCycle,
} from "@/lib/videos";
import {
  addVideoAction,
  createCycleAction,
  deleteCycleAction,
  deleteVideoAction,
  setPostedAction,
  updateCycleAction,
  updateVideoAction,
} from "@/app/app/videos/actions";
import { POST_COLUMNS, type VideoPost } from "@/lib/performance";
import { metricsSetupAction } from "@/app/app/performance/actions";
import type { MetricsSetup } from "@/components/performance/PostRow";
import { VideoDetail } from "./VideoDetail";

/**
 * The team's Videos tab for one client.
 *
 * Work is grouped into the client's own months ("Month 1", "Month
 * 2"...), each with a start and an expected end date that can be
 * changed. Inside a month every video is a numbered box, coloured by
 * where it has got to. Clicking a box goes into that video: its
 * script, its player, its revisions and its posted tick.
 */

/** What a video is delivered through, as much as this tab needs. */
export interface Delivery {
  upload: UploadEntry;
  /** The latest version's link, and its optional player link. */
  url: string | null;
  streamUrl: string | null;
  /** Rounds of changes the client has used on this video. */
  roundsUsed: number;
}

export type VideoPatch = Parameters<typeof updateVideoAction>[1];

function fullDay(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function fixesOf(d: Delivery | undefined): { open: number; total: number } {
  const items = d?.upload.checklist ?? [];
  return { open: items.filter((i) => !i.done).length, total: items.length };
}

/** The one line under a box's pillar: where this video is right now. */
export function statusLine(v: ContentVideo, state: BoxState, d: Delivery | undefined, pkg: PackageSettings | null, today: string): string {
  if (state === "posted") return v.posted_at ? `Posted ${prettyDay(v.posted_at.slice(0, 10), false)}` : "Posted";
  if (state === "revisions") {
    const f = fixesOf(d);
    return f.total > 0 ? `${f.total - f.open} of ${f.total} changes done` : "Changes asked for";
  }
  if (state === "done") {
    if (d?.upload.clientDecision === "approved") return "Approved, ready to post";
    if (pkg?.revisions === "none") return "Done, ready to post";
    return d?.upload.visibility === "team_and_client" ? "With the client" : "Done, not sent to the client";
  }
  const late = v.publish_on && v.publish_on < today;
  if (state === "scripted") return late ? "Scripted, running late" : "Scripted, not filmed";
  return late ? "Late, not started" : "Not done yet";
}

export function VideoSchedule({
  clientId,
  editable,
  pkg: givenPkg,
  initialOpenId = null,
}: {
  /** Opens straight inside this video (from the Performance tab). */
  initialOpenId?: string | null;
  clientId: string;
  editable: boolean;
  /** Null when no package has been chosen yet. Left out, it is looked up. */
  pkg?: PackageSettings | null;
}) {
  const [foundPkg, setFoundPkg] = useState<PackageSettings | null>(null);
  const pkg = givenPkg !== undefined ? givenPkg : foundPkg;
  const supabase = useMemo(() => createClient(), []);
  const top = useRef<HTMLDivElement>(null);
  const today = todayKey();

  const [cycles, setCycles] = useState<VideoCycle[]>([]);
  const [cyclesOn, setCyclesOn] = useState(true);
  const [videos, setVideos] = useState<ContentVideo[]>([]);
  const [deliveries, setDeliveries] = useState<Map<string, Delivery>>(new Map());
  const [pillars, setPillars] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const [monthId, setMonthId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [postsOn, setPostsOn] = useState(false);
  const [setup, setSetup] = useState<MetricsSetup>({ screenshots: false, youtube: false });
  const [filter, setFilter] = useState<BoxState | null>(null);
  const [starting, setStarting] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [res, cyc, place, ups, planner, shape, posted] = await Promise.all([
      loadVideos(supabase, { clientId }),
      supabase.from("content_cycles").select("id, client_id, number, starts_on, ends_on").eq("client_id", clientId).order("number"),
      // 0045's columns on their own, so a missing update costs the
      // months and not the videos.
      supabase.from("content_videos").select("id, cycle_id, position").eq("client_id", clientId),
      loadUploads(supabase, { clientId }),
      supabase.from("planners").select("content").eq("client_id", clientId).maybeSingle(),
      // 0046, each on its own for the same reason.
      supabase.from("content_videos").select("id, aspect").eq("client_id", clientId),
      supabase.from("video_posts").select(POST_COLUMNS).eq("client_id", clientId),
    ]);
    const aspectById = new Map(((shape.error ? [] : shape.data ?? []) as { id: string; aspect: string | null }[]).map((a) => [a.id, a.aspect]));
    setPostsOn(!posted.error);
    setPosts((posted.error ? [] : posted.data ?? []) as VideoPost[]);

    const placeById = new Map(
      ((place.error ? [] : place.data ?? []) as { id: string; cycle_id: string | null; position: number | null }[]).map((p) => [p.id, p])
    );
    const list = res.videos.map((v) => ({ ...v, cycle_id: placeById.get(v.id)?.cycle_id ?? null, position: placeById.get(v.id)?.position ?? null, aspect: aspectById.get(v.id) ?? null }));

    const linked = new Set(list.map((v) => v.submission_id).filter((x): x is string => Boolean(x)));
    const mine = ups.uploads.filter((u) => linked.has(u.id));
    const streams = new Map<string, string>();
    const rounds = new Map<string, number>();
    if (mine.length > 0) {
      const ids = mine.map((u) => u.id);
      const [sv, sr] = await Promise.all([
        supabase.from("submission_versions").select("submission_id, version, stream_url").in("submission_id", ids),
        supabase.from("submissions").select("id, client_change_rounds").in("id", ids),
      ]);
      for (const v of (sv.data ?? []) as { submission_id: string; version: number; stream_url: string | null }[]) {
        if (v.stream_url) streams.set(`${v.submission_id}:${v.version}`, v.stream_url);
      }
      for (const s of (sr.data ?? []) as { id: string; client_change_rounds: number | null }[]) rounds.set(s.id, s.client_change_rounds ?? 0);
    }
    const map = new Map<string, Delivery>();
    for (const u of mine) {
      const latest = u.versions.find((x) => x.version === u.current_version) ?? u.versions[0];
      map.set(u.id, {
        upload: u,
        url: latest?.url ?? null,
        streamUrl: streams.get(`${u.id}:${u.current_version}`) ?? null,
        roundsUsed: rounds.get(u.id) ?? 0,
      });
    }

    const items = ((planner.data as { content?: { pillars?: { items?: { name?: string }[] } } } | null)?.content?.pillars?.items ?? []) as {
      name?: string;
    }[];

    if (givenPkg === undefined) {
      const { data: row } = await supabase.from("client_packages").select("*").eq("client_id", clientId).maybeSingle();
      setFoundPkg(row ? packageFromRow(row as Record<string, unknown>) : null);
    }
    setAvailable(res.available);
    setCyclesOn(!cyc.error);
    setCycles((cyc.error ? [] : cyc.data ?? []) as VideoCycle[]);
    setVideos(list);
    setDeliveries(map);
    setPillars(items.map((p) => String(p.name ?? "").trim()).filter(Boolean));
    setLoading(false);
  }, [supabase, clientId, givenPkg]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    metricsSetupAction().then(setSetup);
  }, []);

  // The month in progress today, else the latest one.
  const month =
    cycles.find((c) => c.id === monthId) ??
    cycles.find((c) => c.starts_on <= today && today <= c.ends_on) ??
    cycles[cycles.length - 1] ??
    null;

  const inMonth = useMemo(
    () => inOrder(cyclesOn && month ? videos.filter((v) => v.cycle_id === month.id) : !cyclesOn ? videos : []),
    [videos, month, cyclesOn]
  );
  const loose = useMemo(() => (cyclesOn ? inOrder(videos.filter((v) => !v.cycle_id || !cycles.some((c) => c.id === v.cycle_id))) : []), [videos, cycles, cyclesOn]);

  const deliveryOf = (v: ContentVideo) => (v.submission_id ? deliveries.get(v.submission_id) : undefined);
  const stateOf = (v: ContentVideo) => {
    const d = deliveryOf(v);
    return boxState(v, d?.upload, fixesOf(d).open);
  };

  const counts = useMemo(() => {
    const c: Record<BoxState, number> = { todo: 0, scripted: 0, revisions: 0, done: 0, posted: 0 };
    for (const v of inMonth) c[stateOf(v)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inMonth, deliveries]);

  function patchLocal(id: string, patch: Partial<ContentVideo>) {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  async function save(id: string, patch: VideoPatch) {
    setError(null);
    const before = videos.find((v) => v.id === id);
    patchLocal(id, patch as Partial<ContentVideo>);
    const res = await updateVideoAction(id, patch);
    if (res.error) {
      setError(res.error);
      if (before) patchLocal(id, before);
    } else if ("cycle_id" in patch) {
      load();
    }
  }

  async function togglePosted(v: ContentVideo) {
    const next = !v.posted_at;
    setError(null);
    patchLocal(v.id, { posted_at: next ? new Date().toISOString() : null });
    const res = await setPostedAction(v.id, next);
    if (res.error) {
      setError(res.error);
      patchLocal(v.id, { posted_at: v.posted_at });
    }
  }

  async function add(cycle: VideoCycle | null) {
    setBusy(true);
    setError(null);
    const last = inMonth[inMonth.length - 1]?.publish_on;
    const date = cycle ? (last && last < cycle.ends_on ? addDays(last, 1) : last ?? cycle.starts_on) : today;
    const res = await addVideoAction(clientId, date, cycle?.id ?? null);
    setBusy(false);
    if (res.error || !res.video) return setError(res.error ?? "Could not add a video.");
    await load();
    open(res.video.id);
  }

  async function remove(id: string) {
    const res = await deleteVideoAction(id);
    if (res.error) return setError(res.error);
    setOpenId(null);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }

  function open(id: string | null) {
    setOpenId(id);
    setError(null);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) return <p style={{ color: "var(--text-3)" }}>Loading…</p>;

  if (!available) {
    return (
      <div className="card card-pad" style={{ maxWidth: 760 }}>
        <h2 className="vm-title">Videos</h2>
        <p className="vm-hint">
          The video schedule isn’t switched on yet. Database update <strong>0042</strong> needs running in Supabase.
        </p>
      </div>
    );
  }

  const errorLine = error && (
    <p role="alert" className="vm-error">
      {error}
    </p>
  );

  // Inside one video.
  const opened = openId ? videos.find((v) => v.id === openId) : null;
  if (opened) {
    const siblings = opened.cycle_id && cyclesOn ? inOrder(videos.filter((v) => v.cycle_id === opened.cycle_id)) : cyclesOn ? loose : inMonth;
    const index = siblings.findIndex((v) => v.id === opened.id);
    const cycle = cycles.find((c) => c.id === opened.cycle_id) ?? null;
    const d = deliveryOf(opened);
    const state = stateOf(opened);
    return (
      <div ref={top} className="vm" style={{ scrollMarginTop: 90 }}>
        {errorLine}
        <VideoDetail
          key={opened.id}
          video={opened}
          number={cycle || !cyclesOn ? index + 1 : null}
          backLabel={cycle ? `Month ${cycle.number}` : "All videos"}
          state={state}
          status={statusLine(opened, state, d, pkg, today)}
          delivery={d ?? null}
          pkg={pkg}
          pillars={pillars}
          cycles={cycles}
          editable={editable}
          onClose={() => open(null)}
          onPrev={index > 0 ? () => open(siblings[index - 1].id) : null}
          onNext={index < siblings.length - 1 ? () => open(siblings[index + 1].id) : null}
          onSave={(patch) => save(opened.id, patch)}
          onTogglePosted={() => togglePosted(opened)}
          onRemove={() => remove(opened.id)}
          onReload={load}
          onError={setError}
          posts={postsOn ? posts.filter((p) => p.video_id === opened.id) : null}
          setup={setup}
        />
      </div>
    );
  }

  const box = (v: ContentVideo, n: number | null, i: number) => {
    const d = deliveryOf(v);
    const state = stateOf(v);
    const what = v.title?.trim() || v.description?.trim() || v.hook?.trim() || "";
    const name = n ? `Video ${n}` : "Video";
    return (
      <li key={v.id} className={`vbox vbox--${state}`} style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }} data-video-id={v.id} data-state={state}>
        <button type="button" className="vbox-main" onClick={() => open(v.id)} aria-label={`${name}: ${what || "nothing written yet"}. ${BOX_LABEL[state]}: ${statusLine(v, state, d, pkg, today)}.`}>
          <span className="vbox-num">{name}</span>
          <span className={what ? "vbox-what" : "vbox-what is-empty"}>{what || "—"}</span>
          <span className={v.pillar ? "vbox-pillar" : "vbox-pillar is-empty"}>{v.pillar?.trim() || "No pillar yet"}</span>
          {/* The colour says where it is; the words are in the
              tooltip and read out by screen readers. */}
          <span className="vbox-foot" title={statusLine(v, state, d, pkg, today)}>
            <span className="vbox-dot" aria-hidden />
            {v.publish_on && state !== "posted" && <span className="vbox-date">{prettyDay(v.publish_on, false)}</span>}
          </span>
        </button>
        {editable && (
          <button
            type="button"
            className="vbox-tick"
            aria-pressed={Boolean(v.posted_at)}
            aria-label={v.posted_at ? `${name} is posted. Untick` : `Mark ${name} as posted`}
            title={v.posted_at ? "Posted. Click to untick" : "Tick when it’s posted"}
            onClick={() => togglePosted(v)}
          >
            ✓
          </button>
        )}
      </li>
    );
  };

  const shown = filter ? inMonth.filter((v) => stateOf(v) === filter) : inMonth;
  const numberOf = new Map(inMonth.map((v, i) => [v.id, i + 1]));
  const total = inMonth.length;

  return (
    <div ref={top} className="vm fade-in" style={{ scrollMarginTop: 90 }}>
      {!cyclesOn && (
        <p className="access-note" role="status" style={{ marginBottom: 18 }}>
          Months (“Month 1”, “Month 2”…) switch on with database update <strong>0045</strong>. Until it’s run, every video
          shows together here.
        </p>
      )}

      {cyclesOn && (
        <div className="vm-months" role="tablist" aria-label="Months">
          {cycles.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={month?.id === c.id && !starting}
              className="vm-month-tab"
              onClick={() => {
                setMonthId(c.id);
                setStarting(false);
                setFilter(null);
                setEditingDates(false);
              }}
            >
              Month {c.number}
            </button>
          ))}
          {editable && cycles.length > 0 && (
            <button type="button" className="vm-month-tab is-new" aria-pressed={starting} onClick={() => setStarting((s) => !s)}>
              + Start Month {(cycles[cycles.length - 1]?.number ?? 0) + 1}
            </button>
          )}
        </div>
      )}

      {errorLine}

      {cyclesOn && (starting || cycles.length === 0) ? (
        editable ? (
          <StartMonth
            clientId={clientId}
            number={(cycles[cycles.length - 1]?.number ?? 0) + 1}
            defaultStart={cycles.length ? addDays(cycles[cycles.length - 1].ends_on, 1) : today}
            pkg={pkg}
            onCancel={cycles.length ? () => setStarting(false) : null}
            onMade={async (c) => {
              await load();
              setMonthId(c.id);
              setStarting(false);
            }}
          />
        ) : (
          <p className="card card-pad-sm vm-hint">No months have been started for this client yet.</p>
        )
      ) : (
        <>
          <header className="vm-head">
            <div>
              <h2 className="vm-title">{month ? `Month ${month.number}` : "All videos"}</h2>
              {month &&
                (editingDates ? (
                  <MonthDates
                    cycle={month}
                    onDone={async (changed) => {
                      setEditingDates(false);
                      if (changed) await load();
                    }}
                    onError={setError}
                  />
                ) : (
                  <p className="vm-dates">
                    <span>{fullDay(month.starts_on)}</span>
                    <span aria-hidden className="vm-arrow">→</span>
                    <span className="sr-only">to</span>
                    <span>{fullDay(month.ends_on)}</span>
                    <span className="vm-dates-note">expected</span>
                    {editable && (
                      <button type="button" className="vm-link" onClick={() => setEditingDates(true)}>
                        Change dates
                      </button>
                    )}
                  </p>
                ))}
            </div>
            <div className="vm-progress" aria-label={`${counts.posted} of ${total} posted`}>
              <p>
                <strong>{counts.posted}</strong> of {total} posted
              </p>
              <div className="vm-bar" aria-hidden>
                {(["posted", "done", "revisions", "scripted", "todo"] as BoxState[]).map(
                  (s) => counts[s] > 0 && <span key={s} className={`vm-bar-seg vbox--${s}`} style={{ flexGrow: counts[s] }} />
                )}
              </div>
            </div>
          </header>

          {total > 0 && (
            <div className="vm-legend" role="group" aria-label="Show only">
              {BOX_STATES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`vm-chip vbox--${s}`}
                  aria-pressed={filter === s}
                  onClick={() => setFilter(filter === s ? null : s)}
                  disabled={counts[s] === 0 && filter !== s}
                >
                  <span className="vbox-dot" aria-hidden />
                  {BOX_LABEL[s]} <b>{counts[s]}</b>
                </button>
              ))}
              {filter && (
                <button type="button" className="vm-link" onClick={() => setFilter(null)}>
                  Show all
                </button>
              )}
            </div>
          )}

          <ul className="vm-grid">
            {shown.map((v, i) => box(v, numberOf.get(v.id) ?? null, i))}
            {editable && !filter && (
              <li className="vbox vbox--add">
                <button type="button" className="vbox-main" onClick={() => add(month)} disabled={busy}>
                  <span className="vbox-plus" aria-hidden>
                    +
                  </span>
                  <span className="vbox-what">Add Video {total + 1}</span>
                </button>
              </li>
            )}
          </ul>
          {filter && shown.length === 0 && <p className="vm-hint">No videos are “{BOX_LABEL[filter].toLowerCase()}” in this month.</p>}

          {editable && month && total === 0 && (
            <p className="vm-hint" style={{ marginTop: 14 }}>
              This month is empty.{" "}
              <button
                type="button"
                className="vm-link"
                onClick={async () => {
                  const res = await deleteCycleAction(month.id);
                  if (res.error) return setError(res.error);
                  setMonthId(null);
                  load();
                }}
              >
                Remove Month {month.number}
              </button>
            </p>
          )}
        </>
      )}

      {loose.length > 0 && !starting && (
        <section style={{ marginTop: 34 }}>
          <h3 className="vm-sub">Not in a month yet ({loose.length})</h3>
          <p className="vm-hint" style={{ marginBottom: 12 }}>
            Added from Uploads or the calendar. Open one to move it into a month.
          </p>
          <ul className="vm-grid">{loose.map((v, i) => box(v, null, i))}</ul>
        </section>
      )}
    </div>
  );
}

function StartMonth({
  clientId,
  number,
  defaultStart,
  pkg,
  onCancel,
  onMade,
}: {
  clientId: string;
  number: number;
  defaultStart: string;
  pkg: PackageSettings | null;
  onCancel: (() => void) | null;
  onMade: (c: VideoCycle) => void;
}) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => defaultCycleEnd(defaultStart));
  const fromPackage = start && end && end >= start ? packageCount(pkg, start, end) : 0;
  const [count, setCount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownCount = count ?? String(fromPackage);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await createCycleAction(clientId, start, end, Number(shownCount || 0));
    setBusy(false);
    if (res.error && !res.cycle) return setError(res.error);
    if (res.cycle) onMade(res.cycle);
  }

  return (
    <div className="card card-pad vm-start fade-in">
      <h2 className="vm-title">Start Month {number}</h2>
      <p className="vm-hint">
        A month runs from the day their work starts, not the 1st. The end date is when you expect to finish; you can change
        both later.
      </p>
      <div className="vm-start-fields">
        <label>
          <span className="vm-label">Starts</span>
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value) setEnd(defaultCycleEnd(e.target.value));
            }}
          />
        </label>
        <label>
          <span className="vm-label">Expected to end</span>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label>
          <span className="vm-label">Videos this month</span>
          <input type="number" min={0} max={120} inputMode="numeric" value={shownCount} onChange={(e) => setCount(e.target.value)} />
        </label>
      </div>
      <p className="vm-hint">
        {pkg
          ? `Their package gives ${fromPackage} video${fromPackage === 1 ? "" : "s"} between these dates. Change the number if this month is different.`
          : "No package chosen yet, so say how many videos this month needs."}
      </p>
      {error && (
        <p role="alert" className="vm-error">
          {error}
        </p>
      )}
      <div className="onboard-actions">
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !start || !end}>
          {busy ? "Starting…" : `Start Month ${number}`}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function MonthDates({ cycle, onDone, onError }: { cycle: VideoCycle; onDone: (changed: boolean) => void; onError: (e: string | null) => void }) {
  const [start, setStart] = useState(cycle.starts_on);
  const [end, setEnd] = useState(cycle.ends_on);
  const [busy, setBusy] = useState(false);

  async function saveDates() {
    if (start === cycle.starts_on && end === cycle.ends_on) return onDone(false);
    setBusy(true);
    onError(null);
    const res = await updateCycleAction(cycle.id, start, end);
    setBusy(false);
    if (res.error) return onError(res.error);
    onDone(true);
  }

  return (
    <div className="vm-dates is-editing">
      <label>
        <span className="sr-only">Start date</span>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <span aria-hidden className="vm-arrow">→</span>
      <label>
        <span className="sr-only">Expected end date</span>
        <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <button type="button" className="btn btn-primary" onClick={saveDates} disabled={busy || !start || !end}>
        Save
      </button>
      <button type="button" className="btn" onClick={() => onDone(false)} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}
