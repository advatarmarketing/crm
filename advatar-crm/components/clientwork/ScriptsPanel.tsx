"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prettyDay } from "@/lib/videos";

export interface ScriptRow {
  id: string;
  title: string;
  pillar: string | null;
  hook: string | null;
  body: string | null;
  cta: string | null;
  notes: string | null;
  video_id: string | null;
  updated_at: string;
}

export interface ScriptVideo {
  id: string;
  label: string;
  publish: string | null;
}

type Draft = { title: string; pillar: string; hook: string; body: string; cta: string; notes: string };
const EMPTY: Draft = { title: "", pillar: "", hook: "", body: "", cta: "", notes: "" };

/**
 * The client's scripts (0053). Write one, then put it on a planned
 * video (its hook, body and call to action go onto the video, and
 * later edits follow it) or keep it in the library for later.
 */
export function ScriptsPanel({
  clientId,
  initialScripts,
  videos,
  pillars,
  available,
}: {
  clientId: string;
  initialScripts: ScriptRow[];
  videos: ScriptVideo[];
  pillars: string[];
  available: boolean;
}) {
  const [scripts, setScripts] = useState(initialScripts);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filter, setFilter] = useState<"all" | "library" | "attached">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const videoById = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);
  const takenBy = useMemo(() => new Map(scripts.filter((s) => s.video_id).map((s) => [s.video_id!, s])), [scripts]);

  if (!available) {
    return <p className="access-note">Scripts start once database update 0053 has been run in Supabase.</p>;
  }

  const shown = scripts.filter((s) => {
    if (filter === "library" && s.video_id) return false;
    if (filter === "attached" && !s.video_id) return false;
    const q = query.trim().toLowerCase();
    return !q || [s.title, s.pillar, s.hook, s.body, s.cta].some((x) => x?.toLowerCase().includes(q));
  });

  function open(s: ScriptRow | null) {
    setError(null);
    setEditing(s ? s.id : "new");
    setDraft(s ? { title: s.title, pillar: s.pillar ?? "", hook: s.hook ?? "", body: s.body ?? "", cta: s.cta ?? "", notes: s.notes ?? "" } : EMPTY);
  }

  async function save() {
    if (!draft.title.trim()) {
      setError("Give the script a title.");
      return;
    }
    setBusy(true);
    setError(null);
    const row = {
      title: draft.title.trim(),
      pillar: draft.pillar.trim() || null,
      hook: draft.hook.trim() || null,
      body: draft.body.trim() || null,
      cta: draft.cta.trim() || null,
      notes: draft.notes.trim() || null,
    };
    const { data: auth } = await supabase.auth.getUser();
    const res =
      editing === "new"
        ? await supabase.from("scripts").insert({ ...row, client_id: clientId, created_by: auth.user?.id ?? null, updated_by: auth.user?.id ?? null }).select("*").single()
        : await supabase.from("scripts").update({ ...row, updated_by: auth.user?.id ?? null }).eq("id", editing!).select("*").single();
    setBusy(false);
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Couldn't save the script.");
      return;
    }
    const saved = res.data as ScriptRow;
    setScripts((xs) => (editing === "new" ? [saved, ...xs] : xs.map((x) => (x.id === saved.id ? saved : x))));
    setEditing(null);
    router.refresh();
  }

  async function attach(s: ScriptRow, videoId: string | null) {
    setBusy(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any).rpc("attach_script", { target_script: s.id, target_video: videoId });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setScripts((xs) => xs.map((x) => (x.id === s.id ? { ...x, video_id: videoId } : videoId && x.video_id === videoId ? { ...x, video_id: null } : x)));
    router.refresh();
  }

  async function remove(s: ScriptRow) {
    if (!confirm(`Delete "${s.title}"? ${s.video_id ? "The words already on its video stay there." : ""}`)) return;
    const { error: e } = await supabase.from("scripts").delete().eq("id", s.id);
    if (e) {
      setError(e.message);
      return;
    }
    setScripts((xs) => xs.filter((x) => x.id !== s.id));
    router.refresh();
  }

  return (
    <div className="scripts">
      <div className="scripts-bar">
        <button type="button" className="btn btn-primary" onClick={() => open(null)}>
          + New script
        </button>
        <input className="scripts-search" type="search" placeholder="Search scripts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search scripts" />
        <div className="seg" role="group" aria-label="Show">
          {(
            [
              ["all", `All (${scripts.length})`],
              ["library", "In the library"],
              ["attached", "On a video"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="cw-alert" role="alert">
          {error}
        </p>
      )}

      {editing && (
        <div className="card card-pad-sm script-form">
          <h3>{editing === "new" ? "New script" : "Edit script"}</h3>
          <div className="script-grid">
            <label>
              <span>Title</span>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={200} autoFocus />
            </label>
            <label>
              <span>Content pillar</span>
              <input value={draft.pillar} onChange={(e) => setDraft({ ...draft, pillar: e.target.value })} list="script-pillars" maxLength={80} />
              <datalist id="script-pillars">
                {pillars.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
          </div>
          <label>
            <span>Hook</span>
            <textarea rows={2} value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} maxLength={2000} />
          </label>
          <label>
            <span>Body</span>
            <textarea rows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} maxLength={8000} />
          </label>
          <label>
            <span>Call to action</span>
            <textarea rows={2} value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} maxLength={2000} />
          </label>
          <label>
            <span>Notes for the team (not put on the video)</span>
            <textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={4000} />
          </label>
          <div className="script-actions">
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save script"}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="cw-empty">{scripts.length === 0 ? "No scripts yet. Write one, then put it on a video or keep it for later." : "No scripts match."}</p>
      ) : (
        <ul className="script-list">
          {shown.map((s) => {
            const on = s.video_id ? videoById.get(s.video_id) : null;
            return (
              <li key={s.id} className="card card-pad-sm script-card">
                <div className="script-card-head">
                  <h3>{s.title}</h3>
                  {s.pillar && <span className="pill">{s.pillar}</span>}
                  <span className={s.video_id ? "pill pill-ok" : "pill pill-info"}>
                    {s.video_id ? (on ? `On: ${on.label}${on.publish ? ` · ${prettyDay(on.publish)}` : ""}` : "On a video") : "In the library"}
                  </span>
                </div>
                {s.hook && <p className="script-hook">&ldquo;{s.hook}&rdquo;</p>}
                {s.body && <p className="script-body">{s.body.length > 280 ? `${s.body.slice(0, 280)}…` : s.body}</p>}
                {s.cta && <p className="script-cta">CTA: {s.cta}</p>}
                {s.notes && <p className="script-notes">Note: {s.notes}</p>}
                <div className="script-actions">
                  <button type="button" className="btn" onClick={() => open(s)}>
                    Edit
                  </button>
                  <label className="script-attach">
                    <span className="sr-only">Put this script on a video</span>
                    <select
                      value={s.video_id ?? ""}
                      disabled={busy}
                      onChange={(e) => attach(s, e.target.value || null)}
                    >
                      <option value="">{s.video_id ? "Take off the video (keep in library)" : "Put on a video…"}</option>
                      {videos.map((v) => {
                        const other = takenBy.get(v.id);
                        return (
                          <option key={v.id} value={v.id}>
                            {v.publish ? `${prettyDay(v.publish)} · ` : ""}
                            {v.label}
                            {other && other.id !== s.id ? ` (has "${other.title}")` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <button type="button" className="btn script-delete" onClick={() => remove(s)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
