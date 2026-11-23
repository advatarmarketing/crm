"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VIDEO_KINDS, clientsText, earnText } from "@/lib/journey-format";
import type { JourneyData, JourneyLevel, JourneyTick, JourneyVideo } from "@/lib/journey";

const prettyDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The path, as a road you scroll along: what's done (ticked, with the
 * day you got there), "You are here", and everything ahead out to the
 * vision. `manage` is the CEO / operations manager looking at someone:
 * they can sign steps off and move the person to a level.
 */
export function JourneyView({
  data,
  mode,
  marker,
}: {
  data: JourneyData;
  mode: "self" | "manage";
  /** The CEO's private note on one level; only ever passed on the CEO's own pages. */
  marker?: { levelId: string; label: string };
}) {
  const { path, person } = data;
  const [levelId, setLevelId] = useState(data.levelId);
  const [ticks, setTicks] = useState<JourneyTick[]>(data.ticks);
  const [videos, setVideos] = useState<JourneyVideo[]>(data.videos);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const hereRef = useRef<HTMLLIElement>(null);
  const [scrollFill, setScrollFill] = useState(0);
  const [doneFill, setDoneFill] = useState(0);

  const levels = path?.levels ?? [];
  const hereIndex = levels.findIndex((l) => l.id === levelId);
  const firstPaid = levels.findIndex((l) => l.paid && (l.earn_min ?? 0) > 0);

  // Levels ease in as they scroll into view; the road fills as you go.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = Array.from(el.querySelectorAll<HTMLElement>(".jy-level"));
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((i) => i.setAttribute("data-in", ""));
    } else {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && e.target.setAttribute("data-in", "")),
        { rootMargin: "0px 0px -12% 0px" }
      );
      items.forEach((i) => io.observe(i));
      return () => io.disconnect();
    }
  }, [levels.length]);

  useEffect(() => {
    const onScroll = () => {
      const el = root.current;
      if (!el) return;
      const road = el.querySelector<HTMLElement>(".jy-road");
      if (!road) return;
      const r = road.getBoundingClientRect();
      const mid = window.innerHeight * 0.6;
      setScrollFill(Math.max(0, Math.min(1, (mid - r.top) / Math.max(1, r.height))));
      const here = hereRef.current;
      setDoneFill(here ? Math.max(0, Math.min(1, (here.getBoundingClientRect().top + 24 - r.top) / Math.max(1, r.height))) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [levelId, levels.length]);

  // Open on "You are here".
  useEffect(() => {
    if (mode === "self" && hereRef.current && window.scrollY < 50) hereRef.current.scrollIntoView({ block: "center", behavior: "auto" });
  }, [mode]);

  const tickOf = (lvl: string, step: string) => ticks.find((t) => t.level_id === lvl && t.step_id === step) ?? null;
  const videosAt = useMemo(() => {
    const m = new Map<string, JourneyVideo[]>();
    for (const v of videos) if (v.level_id) m.set(v.level_id, [...(m.get(v.level_id) ?? []), v]);
    return m;
  }, [videos]);

  if (!data.available) return <p className="access-note">Your Journey starts once database update 0055 has been run in Supabase.</p>;
  if (!path) {
    return (
      <div className="card card-pad-sm jy-unset">
        <p>
          {mode === "self"
            ? "Your journey hasn't been set up yet. The CEO will put you on your path and show you where you are on it."
            : `${person.name} isn't on a path yet. Choose one on Team journeys.`}
        </p>
      </div>
    );
  }

  async function toggleStep(level: JourneyLevel, stepId: string) {
    setError(null);
    const t = tickOf(level.id, stepId);
    const prev = ticks;
    if (t) {
      setTicks((ts) => ts.filter((x) => !(x.level_id === level.id && x.step_id === stepId)));
      const { error: e } = await supabase.from("journey_ticks").delete().eq("profile_id", person.id).eq("level_id", level.id).eq("step_id", stepId);
      if (e) {
        setTicks(prev);
        setError(e.message);
      }
      return;
    }
    const status = mode === "manage" ? "confirmed" : "pending";
    setTicks((ts) => [...ts, { level_id: level.id, step_id: stepId, status }]);
    const { error: e } = await supabase.from("journey_ticks").insert({ profile_id: person.id, level_id: level.id, step_id: stepId, status });
    if (e) {
      setTicks(prev);
      setError(e.message);
    }
  }

  async function signOff(level: JourneyLevel, stepId: string) {
    setError(null);
    const prev = ticks;
    setTicks((ts) => ts.map((x) => (x.level_id === level.id && x.step_id === stepId ? { ...x, status: "confirmed" } : x)));
    const { error: e } = await supabase.from("journey_ticks").update({ status: "confirmed" }).eq("profile_id", person.id).eq("level_id", level.id).eq("step_id", stepId);
    if (e) {
      setTicks(prev);
      setError(e.message);
    }
  }

  async function moveTo(level: JourneyLevel) {
    if (!confirm(`Move ${person.name} to ${level.title}?`)) return;
    setError(null);
    const { error: e } = await supabase.from("journey_members").update({ level_id: level.id }).eq("profile_id", person.id);
    if (e) return setError(e.message);
    setLevelId(level.id);
    router.refresh();
  }

  const here = hereIndex >= 0 ? levels[hereIndex] : null;
  const next = hereIndex >= 0 ? levels[hereIndex + 1] ?? null : levels[0] ?? null;
  const waiting = ticks.filter((t) => t.status === "pending").length;

  return (
    <div className="jy" ref={root}>
      <header className="jy-hero">
        <p className="jy-kicker">{path.name} path</p>
        <h1 className="jy-title">{mode === "self" ? "Your Journey" : `${person.name}'s journey`}</h1>
        {here ? (
          <p className="jy-lead">
            {mode === "self" ? "You're" : `${person.name} is`} at <strong>{here.title}</strong>
            {data.reached[here.id] ? ` since ${prettyDate(data.reached[here.id])}` : ""}. Level {hereIndex + 1} of {levels.length}.
            {next && !next.vision ? ` Next: ${next.title}.` : ""}
          </p>
        ) : (
          <p className="jy-lead">Not placed on a level yet.</p>
        )}
        <div className="jy-progress" aria-hidden>
          <span style={{ width: `${levels.length ? ((Math.max(0, hereIndex) + 1) / levels.length) * 100 : 0}%` }} />
        </div>
        <p className="jy-note">
          Go at your own pace. Staying at a level you&rsquo;re happy at is completely fine: this shows what&rsquo;s possible whenever
          you want it.
        </p>
        {mode === "manage" && waiting > 0 && (
          <p className="jy-waiting" role="status">
            {waiting} step{waiting === 1 ? "" : "s"} waiting for your sign-off.
          </p>
        )}
      </header>

      {error && (
        <p className="cw-alert" role="alert">
          {error}
        </p>
      )}

      <ol className="jy-road" style={{ ["--fill" as string]: scrollFill, ["--done" as string]: doneFill }}>
        {levels.map((l, i) => {
          const state = hereIndex < 0 ? "ahead" : i < hereIndex ? "done" : i === hereIndex ? "here" : "ahead";
          const clients = clientsText(l, path.clients_word);
          const earn = earnText(l);
          const pinned = videosAt.get(l.id) ?? [];
          const stepsDone = l.steps.filter((s) => tickOf(l.id, s.id)?.status === "confirmed").length;
          return (
            <li key={l.id} ref={state === "here" ? hereRef : undefined} className="jy-level" data-state={state} data-vision={l.vision || undefined}>
              <span className="jy-node" aria-hidden>
                {state === "done" ? "✓" : i + 1}
              </span>
              <div className="jy-card">
                <div className="jy-card-top">
                  {state === "here" && <span className="jy-here">You are here</span>}
                  {state === "done" && <span className="pill pill-ok">Done{data.reached[l.id] ? ` · ${prettyDate(data.reached[l.id])}` : ""}</span>}
                  {state === "ahead" && i === hereIndex + 1 && <span className="pill pill-accent">Next</span>}
                  {l.vision && <span className="pill pill-violet">The vision</span>}
                  {i === firstPaid && <span className="pill pill-info">First goal: get paid</span>}
                  {marker && marker.levelId === l.id && (
                    <span className="pill pill-warn" title="Only you can see this">
                      {marker.label}
                    </span>
                  )}
                </div>
                <h2 className="jy-level-title">{l.title}</h2>
                {l.summary && <p className="jy-summary">{l.summary}</p>}
                {(clients || earn) && (
                  <div className="jy-chips">
                    {clients && <span className="jy-chip">{clients}</span>}
                    {earn && <span className={l.paid ? "jy-chip jy-chip-money" : "jy-chip jy-chip-unpaid"}>{earn}</span>}
                  </div>
                )}
                {l.can_do.length > 0 && (
                  <div className="jy-block">
                    <h3>What you can do</h3>
                    <ul>
                      {l.can_do.map((c, k) => (
                        <li key={k}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {l.steps.length > 0 && (
                  <div className="jy-block">
                    <h3>
                      To move up{state === "here" ? ` (${stepsDone} of ${l.steps.length} signed off)` : ""}
                    </h3>
                    {state === "here" ? (
                      <ul className="jy-steps">
                        {l.steps.map((s) => {
                          const t = tickOf(l.id, s.id);
                          const locked = t?.status === "confirmed" && mode === "self";
                          return (
                            <li key={s.id} data-status={t?.status}>
                              <label>
                                <input type="checkbox" checked={Boolean(t)} disabled={locked} onChange={() => toggleStep(l, s.id)} />
                                <span>{s.text}</span>
                              </label>
                              {t?.status === "pending" &&
                                (mode === "manage" ? (
                                  <button type="button" className="btn jy-signoff" onClick={() => signOff(l, s.id)}>
                                    Sign off
                                  </button>
                                ) : (
                                  <span className="jy-wait">Waiting for sign-off</span>
                                ))}
                              {t?.status === "confirmed" && <span className="jy-ok">Signed off</span>}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <ul className="jy-steps-plain">
                        {l.steps.map((s) => (
                          <li key={s.id} data-done={state === "done" || undefined}>
                            {s.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {pinned.length > 0 && (
                  <div className="jy-pinned">
                    {pinned.map((v) => (
                      <VideoChip key={v.id} v={v} />
                    ))}
                  </div>
                )}
                {mode === "manage" && state !== "here" && (
                  <button type="button" className="btn jy-move" onClick={() => moveTo(l)}>
                    Move {person.name.split(" ")[0]} to this level
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <VideoProgress
        videos={videos}
        canAdd
        adding={adding}
        setAdding={setAdding}
        onAdd={async (v) => {
          setError(null);
          const res = await supabase
            .from("journey_videos")
            .insert({ ...v, profile_id: person.id, level_id: levelId })
            .select("id, kind, url, title, note, level_id, added_at")
            .single();
          if (res.error || !res.data) {
            setError(res.error?.message ?? "Couldn't add the video.");
            return false;
          }
          setVideos((vs) => [...vs, res.data as JourneyVideo]);
          return true;
        }}
        onRemove={async (id) => {
          const { error: e } = await supabase.from("journey_videos").delete().eq("id", id);
          if (e) return setError(e.message);
          setVideos((vs) => vs.filter((x) => x.id !== id));
        }}
        whose={mode === "self" ? "Your" : `${person.name.split(" ")[0]}'s`}
      />
    </div>
  );
}

function VideoChip({ v }: { v: JourneyVideo }) {
  const label = VIDEO_KINDS.find((k) => k.id === v.kind)?.label ?? "";
  const body = (
    <>
      <span className="jy-vchip-kind">{label}</span>
      <span>{v.title}</span>
    </>
  );
  return v.url ? (
    <a className="jy-vchip" href={v.url} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <span className="jy-vchip">{body}</span>
  );
}

/**
 * The video progress slot. Only shown once something is in it; until
 * then, a single "Add a video" link.
 */
function VideoProgress({
  videos,
  canAdd,
  adding,
  setAdding,
  onAdd,
  onRemove,
  whose,
}: {
  videos: JourneyVideo[];
  canAdd: boolean;
  adding: boolean;
  setAdding: (b: boolean) => void;
  onAdd: (v: { kind: JourneyVideo["kind"]; title: string; url: string | null; note: string | null }) => Promise<boolean>;
  onRemove: (id: string) => void;
  whose: string;
}) {
  const [kind, setKind] = useState<JourneyVideo["kind"]>(videos.length ? "now" : "started");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const form = adding && (
    <div className="card card-pad-sm jy-addvideo">
      <div className="script-grid">
        <label>
          <span>Which part</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as JourneyVideo["kind"])}>
            {VIDEO_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
        </label>
      </div>
      <label>
        <span>Link (Instagram, TikTok, Drive…)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" maxLength={1000} placeholder="https://" />
      </label>
      <label>
        <span>Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </label>
      <div className="script-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true);
            const ok = await onAdd({ kind, title: title.trim(), url: url.trim() || null, note: note.trim() || null });
            setBusy(false);
            if (ok) {
              setTitle("");
              setUrl("");
              setNote("");
              setAdding(false);
            }
          }}
        >
          {busy ? "Adding…" : "Add video"}
        </button>
        <button type="button" className="btn" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    </div>
  );

  if (videos.length === 0) {
    return (
      <div className="jy-videos-empty">
        {form ||
          (canAdd && (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              + Add a video to show your progress
            </button>
          ))}
      </div>
    );
  }

  return (
    <section className="jy-videos" aria-labelledby="jy-videos-h">
      <div className="cw-videos-head">
        <h2 id="jy-videos-h" className="cw-h">
          {whose} video progress
        </h2>
        {canAdd && !adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Add a video
          </button>
        )}
      </div>
      {form}
      <div className="jy-video-cols">
        {VIDEO_KINDS.map((k) => {
          const list = videos.filter((v) => v.kind === k.id);
          if (list.length === 0) return null;
          return (
            <div key={k.id} className="jy-video-col">
              <h3>{k.label}</h3>
              <ul>
                {list.map((v) => (
                  <li key={v.id} className="card card-pad-sm">
                    {v.url ? (
                      <a href={v.url} target="_blank" rel="noopener noreferrer">
                        {v.title}
                      </a>
                    ) : (
                      <strong>{v.title}</strong>
                    )}
                    <span className="jy-video-date">Added {prettyDate(v.added_at)}</span>
                    {v.note && <p>{v.note}</p>}
                    <button type="button" className="jy-video-remove" onClick={() => onRemove(v.id)} aria-label={`Remove ${v.title}`}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
