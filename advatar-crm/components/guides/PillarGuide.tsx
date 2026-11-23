"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { prettyDay } from "@/lib/videos";
import { GUIDE_STAGES, guideHref, linesToSteps, type GuideRun, type GuideStep, type GuideView } from "@/lib/guides";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

/**
 * One pillar's Filming or Editing guide: what you need, the steps, and
 * "Start a new video" to tick through them for one video. Anyone on the
 * team for that client can edit it (0054).
 */
export function PillarGuide({ view, focusVideo }: { view: GuideView; focusVideo: string | null }) {
  const { client, pillar, stage, template } = view;
  const [guide, setGuide] = useState(view.guide);
  const [runs, setRuns] = useState<GuideRun[]>(view.runs);
  const [editing, setEditing] = useState(false);
  const [elementsText, setElementsText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [notesText, setNotesText] = useState("");
  const [newRunVideo, setNewRunVideo] = useState(focusVideo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const stageLabel = GUIDE_STAGES.find((s) => s.id === stage)!;

  if (!client) return <p className="cw-empty">That client isn&rsquo;t one of yours.</p>;
  if (!view.available) return <p className="access-note">Pillar guides start once database update 0054 has been run in Supabase.</p>;

  const videoById = new Map(view.videos.map((v) => [v.id, v]));

  function startEdit(from: { elements: string[]; steps: GuideStep[]; notes: string | null }) {
    setElementsText(from.elements.join("\n"));
    setStepsText(from.steps.map((s) => s.text).join("\n"));
    setNotesText(from.notes ?? "");
    setEditing(true);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const elements = elementsText
      .split("\n")
      .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 40);
    const steps = linesToSteps(stepsText, guide?.steps ?? [], newId);
    const { data: auth } = await supabase.auth.getUser();
    const row = { elements, steps, notes: notesText.trim() || null, updated_by: auth.user?.id ?? null };
    const res = guide
      ? await supabase.from("pillar_guides").update(row).eq("id", guide.id).select("*").single()
      : await supabase.from("pillar_guides").insert({ ...row, client_id: client!.id, pillar, stage }).select("*").single();
    setBusy(false);
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Couldn't save the guide.");
      return;
    }
    setGuide(res.data as typeof guide);
    setEditing(false);
    router.refresh();
  }

  async function startRun() {
    if (!guide) return;
    setBusy(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const res = await supabase
      .from("guide_runs")
      .insert({ guide_id: guide.id, client_id: client!.id, video_id: newRunVideo || null, started_by: auth.user?.id ?? null })
      .select("id, guide_id, video_id, done_steps, started_at, finished_at")
      .single();
    setBusy(false);
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Couldn't start it.");
      return;
    }
    setRuns((rs) => [res.data as GuideRun, ...rs]);
    router.refresh();
  }

  async function tick(run: GuideRun, stepId: string) {
    if (!guide) return;
    const done = run.done_steps.includes(stepId) ? run.done_steps.filter((d) => d !== stepId) : [...run.done_steps, stepId];
    const allDone = guide.steps.every((s) => done.includes(s.id));
    const next = { ...run, done_steps: done, finished_at: allDone ? run.finished_at ?? new Date().toISOString() : null };
    const prev = runs;
    setRuns((rs) => rs.map((r) => (r.id === run.id ? next : r)));
    const { error: e } = await supabase.from("guide_runs").update({ done_steps: done, finished_at: next.finished_at }).eq("id", run.id);
    if (e) {
      setRuns(prev);
      setError(e.message);
    }
  }

  async function removeRun(run: GuideRun) {
    if (!confirm("Remove this checklist? The guide itself stays.")) return;
    const { error: e } = await supabase.from("guide_runs").delete().eq("id", run.id);
    if (e) return setError(e.message);
    setRuns((rs) => rs.filter((r) => r.id !== run.id));
  }

  const active = runs.filter((r) => !r.finished_at);
  const finished = runs.filter((r) => r.finished_at);

  return (
    <div className="pg">
      <div className="pg-head">
        <div>
          <p className="pg-kicker">
            {client.name} · content pillar
          </p>
          <h2 className="pg-title">{pillar}</h2>
        </div>
        <div className="seg" role="group" aria-label="Guide">
          {GUIDE_STAGES.map((s) => (
            <Link key={s.id} href={guideHref(client.id, pillar, s.id, focusVideo)} className={s.id === stage ? "on" : ""} aria-current={s.id === stage ? "page" : undefined}>
              How to {s.verb} this
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <p className="cw-alert" role="alert">
          {error}
        </p>
      )}

      {editing ? (
        <div className="card card-pad-sm pg-edit">
          <h3>{guide ? `Edit the ${stageLabel.label.toLowerCase()} guide` : `New ${stageLabel.label.toLowerCase()} guide`}</h3>
          <label>
            <span>Elements needed: one per line</span>
            <textarea rows={6} value={elementsText} onChange={(e) => setElementsText(e.target.value)} />
          </label>
          <label>
            <span>Step by step: one step per line, in order</span>
            <textarea rows={10} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
          </label>
          <label>
            <span>Notes (optional): anything else to know for this kind of video</span>
            <textarea rows={3} value={notesText} onChange={(e) => setNotesText(e.target.value)} maxLength={4000} />
          </label>
          <div className="script-actions">
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save guide"}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : !guide ? (
        <div className="card card-pad-sm pg-empty">
          <p>
            No {stageLabel.label.toLowerCase()} guide for <strong>{pillar}</strong> yet. Write it together when you make the first video for this pillar: the
            elements it needs and the steps, in order.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => startEdit({ ...template, notes: null })}>
            Create guide
          </button>
          <p className="cw-sub" style={{ margin: 0 }}>
            Starts from the {stageLabel.label.toLowerCase()} template ({template.steps.length} steps), which you can change.
          </p>
        </div>
      ) : (
        <>
          <div className="pg-cols">
            <section className="card card-pad-sm" aria-labelledby="pg-el">
              <h3 id="pg-el" className="cw-h">
                Elements needed
              </h3>
              {guide.elements.length ? (
                <ul className="pg-elements">
                  {guide.elements.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : (
                <p className="cw-empty">None listed.</p>
              )}
              {guide.notes && <p className="script-notes">{guide.notes}</p>}
            </section>
            <section className="card card-pad-sm" aria-labelledby="pg-steps">
              <h3 id="pg-steps" className="cw-h">
                Step by step
              </h3>
              <ol className="pg-steps">
                {guide.steps.map((s) => (
                  <li key={s.id}>{s.text}</li>
                ))}
              </ol>
            </section>
          </div>
          <div className="script-actions">
            <button type="button" className="btn" onClick={() => startEdit(guide)}>
              Edit guide
            </button>
            <span className="cw-sub" style={{ margin: 0 }}>
              Last changed {new Date(guide.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>

          <section className="pg-runs" aria-labelledby="pg-runs-h">
            <h3 id="pg-runs-h" className="cw-h">
              Making a video with this guide
            </h3>
            <div className="pg-start">
              <label className="script-attach">
                <span className="sr-only">Which video</span>
                <select value={newRunVideo} onChange={(e) => setNewRunVideo(e.target.value)}>
                  <option value="">Not for a particular video</option>
                  {view.videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.publish ? `${prettyDay(v.publish)} · ` : ""}
                      {v.label}
                      {v.samePillar ? "" : " (other pillar)"}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-primary" onClick={startRun} disabled={busy || guide.steps.length === 0}>
                Start a new video
              </button>
            </div>

            {active.length === 0 && <p className="cw-empty">Nothing in progress. Start a new video to get a fresh checklist.</p>}
            {active.map((r) => (
              <RunCard key={r.id} run={r} steps={guide.steps} video={r.video_id ? videoById.get(r.video_id) ?? null : null} onTick={tick} onRemove={removeRun} />
            ))}
            {finished.length > 0 && (
              <details className="pg-done">
                <summary>Finished ({finished.length})</summary>
                {finished.map((r) => (
                  <RunCard key={r.id} run={r} steps={guide.steps} video={r.video_id ? videoById.get(r.video_id) ?? null : null} onTick={tick} onRemove={removeRun} />
                ))}
              </details>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function RunCard({
  run,
  steps,
  video,
  onTick,
  onRemove,
}: {
  run: GuideRun;
  steps: GuideStep[];
  video: { label: string; publish: string | null } | null;
  onTick: (run: GuideRun, stepId: string) => void;
  onRemove: (run: GuideRun) => void;
}) {
  const done = steps.filter((s) => run.done_steps.includes(s.id)).length;
  return (
    <div className="card card-pad-sm pg-run" data-finished={run.finished_at ? "" : undefined}>
      <div className="pg-run-head">
        <strong>{video ? `${video.label}${video.publish ? ` · ${prettyDay(video.publish)}` : ""}` : "Video"}</strong>
        <span className={done === steps.length ? "pill pill-ok" : "pill"}>
          {done} of {steps.length}
        </span>
        <button type="button" className="btn script-delete pg-run-remove" onClick={() => onRemove(run)}>
          Remove
        </button>
      </div>
      <div className="cw-meter-bar" aria-hidden>
        <span style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%`, background: "var(--ok-fg)" }} />
      </div>
      <ul className="pg-ticks">
        {steps.map((s) => (
          <li key={s.id}>
            <label>
              <input type="checkbox" checked={run.done_steps.includes(s.id)} onChange={() => onTick(run, s.id)} />
              <span>{s.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
