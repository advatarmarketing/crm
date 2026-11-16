"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  STAGE_LABEL,
  loadVideos,
  monthBounds,
  prettyDay,
  todayKey,
  videoLabel,
  videoStage,
  type ContentVideo,
  type LinkedUpload,
} from "@/lib/videos";
import {
  addVideoAction,
  deleteVideoAction,
  generateMonthAction,
  setPostedAction,
  updateVideoAction,
  type VideoTextField,
} from "@/app/app/videos/actions";

/**
 * The team's view of one client's video schedule: every video going
 * out this month, its pillar, its brief, and where it has got to.
 *
 * A video needs a date and a pillar and nothing else. Hook, body, CTA
 * and the rest open under "Brief" for the videos that have one; a
 * video without a script is still a video on the schedule.
 */

const mono: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const BRIEF_FIELDS: { key: VideoTextField; label: string; multiline?: boolean; placeholder: string }[] = [
  { key: "video_type", label: "Type of video", placeholder: "Talking head, b-roll, trend…" },
  { key: "description", label: "What it is", multiline: true, placeholder: "One or two lines on the idea" },
  { key: "hook", label: "Hook", multiline: true, placeholder: "The opening line" },
  { key: "body", label: "Body", multiline: true, placeholder: "What happens in the middle" },
  { key: "cta", label: "Call to action", placeholder: "What the viewer should do" },
  { key: "wms", label: "WMS", placeholder: "Initials" },
  { key: "scenery", label: "Scenery (i/a)", placeholder: "i or a" },
  { key: "video_set", label: "Shoot / video set", placeholder: "Video Set 1" },
];

function stageTone(tone: string): string {
  return tone === "ok" ? "pill pill-ok" : tone === "warn" ? "pill pill-warn" : tone === "info" ? "pill pill-info" : tone === "accent" ? "pill pill-accent" : "pill";
}

function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function VideoSchedule({
  clientId,
  editable,
  hasPackage,
}: {
  clientId: string;
  editable: boolean;
  /** False when the client has no package yet — nothing to generate from. */
  hasPackage: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(() => `${todayKey().slice(0, 7)}-01`);
  const [videos, setVideos] = useState<ContentVideo[]>([]);
  const [uploads, setUploads] = useState<Map<string, LinkedUpload>>(new Map());
  const [uploadChoices, setUploadChoices] = useState<{ id: string; title: string; kind: string }[]>([]);
  const [pillars, setPillars] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { from, to } = monthBounds(month);

  const load = useCallback(async () => {
    setLoading(true);
    const [res, subs, planner] = await Promise.all([
      loadVideos(supabase, { clientId, from, to, undated: true }),
      supabase.from("submissions").select("id, title, kind, created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("planners").select("content").eq("client_id", clientId).maybeSingle(),
    ]);
    setVideos(res.videos);
    setUploads(res.uploads);
    setAvailable(res.available);
    // kind arrives with 0042; without it the list still works.
    const subRows = (subs.data ?? []) as { id: string; title: string; kind?: string }[];
    setUploadChoices(subRows.map((s) => ({ id: s.id, title: s.title, kind: s.kind ?? "video" })));
    const items = ((planner.data as { content?: { pillars?: { items?: { name?: string }[] } } } | null)?.content?.pillars?.items ?? []) as {
      name?: string;
    }[];
    setPillars(items.map((p) => String(p.name ?? "").trim()).filter(Boolean));
    setLoading(false);
  }, [supabase, clientId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const dated = videos.filter((v) => v.publish_on);
  const undated = videos.filter((v) => !v.publish_on);
  const today = todayKey();
  const monthLabel = new Date(`${from}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  function patchLocal(id: string, patch: Partial<ContentVideo>) {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  async function save(id: string, patch: Parameters<typeof updateVideoAction>[1]) {
    setError(null);
    const before = videos.find((v) => v.id === id);
    patchLocal(id, patch as Partial<ContentVideo>);
    const res = await updateVideoAction(id, patch);
    if (res.error) {
      setError(res.error);
      if (before) patchLocal(id, before);
    } else if ("submission_id" in patch) {
      load();
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await generateMonthAction(clientId, from);
    setBusy(false);
    if (res.error) return setError(res.error);
    setNotice(res.added ? `${res.added} video${res.added === 1 ? "" : "s"} added to ${monthLabel}.` : `${monthLabel} already has every posting day filled.`);
    load();
  }

  async function add() {
    setBusy(true);
    setError(null);
    const res = await addVideoAction(clientId, today >= from && today <= to ? today : from);
    setBusy(false);
    if (res.error || !res.video) return setError(res.error ?? "Could not add a video.");
    setVideos((prev) => [...prev, res.video!].sort((a, b) => (a.publish_on ?? "9").localeCompare(b.publish_on ?? "9")));
    setOpen(res.video.id);
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await deleteVideoAction(id);
    setBusy(false);
    setConfirmDelete(null);
    if (res.error) return setError(res.error);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }

  async function togglePosted(v: ContentVideo) {
    const next = !v.posted_at;
    patchLocal(v.id, { posted_at: next ? new Date().toISOString() : null });
    const res = await setPostedAction(v.id, next);
    if (res.error) {
      setError(res.error);
      patchLocal(v.id, { posted_at: v.posted_at });
    }
  }

  if (!available && !loading) {
    return (
      <div className="card card-pad" style={{ maxWidth: 760 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 8px" }}>Videos</h2>
        <p style={{ fontSize: 13.5, color: "var(--text-3)", lineHeight: 1.6, margin: 0 }}>
          The video schedule isn’t switched on yet. Database update <strong>0042</strong> needs running in Supabase. Until
          then the content plan works as it does today.
        </p>
      </div>
    );
  }

  const row = (v: ContentVideo) => {
    const stage = videoStage(v, v.submission_id ? uploads.get(v.submission_id) : null);
    const label = STAGE_LABEL[stage];
    const late = v.publish_on && v.publish_on < today && stage === "planned";
    const isOpen = open === v.id;
    const filledBrief = BRIEF_FIELDS.filter((f) => (v[f.key as keyof ContentVideo] as string | null)?.trim()).length;

    return (
      <li
        key={v.id}
        className="card card-pad-sm"
        data-video-id={v.id}
        style={{ display: "flex", flexDirection: "column", gap: 10, borderLeft: late ? "3px solid var(--danger-fg, #c0392b)" : undefined }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {editable ? (
            <input
              type="date"
              aria-label="Goes out on"
              value={v.publish_on ?? ""}
              onChange={(e) => save(v.id, { publish_on: e.target.value || null })}
              style={{ width: 150 }}
            />
          ) : (
            <span style={{ ...mono, minWidth: 90 }}>{v.publish_on ? prettyDay(v.publish_on) : "No date yet"}</span>
          )}

          {editable ? (
            <>
              <input
                list={`pillars-${clientId}`}
                aria-label="Pillar"
                placeholder="Pillar (required)"
                defaultValue={v.pillar ?? ""}
                key={`pillar-${v.id}-${v.pillar ?? ""}`}
                onBlur={(e) => e.target.value.trim() !== (v.pillar ?? "") && save(v.id, { pillar: e.target.value })}
                style={{ width: 170, borderColor: v.pillar ? undefined : "var(--warn-fg, #b7791f)" }}
              />
              <input
                aria-label="Title"
                placeholder="Title (optional)"
                defaultValue={v.title ?? ""}
                key={`title-${v.id}-${v.title ?? ""}`}
                onBlur={(e) => e.target.value.trim() !== (v.title ?? "") && save(v.id, { title: e.target.value })}
                style={{ flex: "1 1 180px", minWidth: 140 }}
              />
            </>
          ) : (
            <span style={{ flex: "1 1 180px", fontSize: 14 }}>
              <strong>{videoLabel(v)}</strong>
              {v.pillar && v.title ? <span style={{ color: "var(--text-3)" }}> · {v.pillar}</span> : null}
            </span>
          )}

          <span className={stageTone(label.tone)}>{late ? "Late — not uploaded" : label.team}</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {editable ? (
            <select
              aria-label="Upload"
              value={v.submission_id ?? ""}
              onChange={(e) => save(v.id, { submission_id: e.target.value || null })}
              style={{ maxWidth: 280 }}
            >
              <option value="">No upload linked</option>
              {uploadChoices.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.kind !== "video" ? `[${u.kind}] ` : ""}
                  {u.title}
                </option>
              ))}
            </select>
          ) : v.submission_id && uploads.get(v.submission_id) ? (
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>Upload: {uploads.get(v.submission_id)!.title}</span>
          ) : null}
          {v.submission_id && (
            <Link href={`/app/uploads?client=${clientId}`} className="btn" style={{ textDecoration: "none" }}>
              Open upload
            </Link>
          )}
          <button type="button" className="btn" onClick={() => setOpen(isOpen ? null : v.id)} aria-expanded={isOpen}>
            Brief{filledBrief ? ` (${filledBrief})` : ""}
          </button>
          {editable && (
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={Boolean(v.posted_at)} onChange={() => togglePosted(v)} />
              Posted
            </label>
          )}
          {editable &&
            (confirmDelete === v.id ? (
              <>
                <button type="button" className="btn" onClick={() => remove(v.id)} disabled={busy}>
                  Yes, remove it
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmDelete(v.id)} aria-label="Remove video">
                Remove
              </button>
            ))}
        </div>

        {isOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {BRIEF_FIELDS.map((f) => {
              const value = (v[f.key as keyof ContentVideo] as string | null) ?? "";
              if (!editable && !value.trim()) return null;
              return (
                <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: f.multiline ? "1 / -1" : undefined }}>
                  <span style={mono}>{f.label}</span>
                  {!editable ? (
                    <span style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{value}</span>
                  ) : f.multiline ? (
                    <textarea
                      rows={2}
                      defaultValue={value}
                      placeholder={f.placeholder}
                      onBlur={(e) => e.target.value.trim() !== value && save(v.id, { [f.key]: e.target.value })}
                    />
                  ) : (
                    <input
                      defaultValue={value}
                      placeholder={f.placeholder}
                      onBlur={(e) => e.target.value.trim() !== value && save(v.id, { [f.key]: e.target.value })}
                    />
                  )}
                </label>
              );
            })}
            {!editable && filledBrief === 0 && <span style={{ fontSize: 13, color: "var(--text-3)" }}>No brief written for this one.</span>}
          </div>
        )}
      </li>
    );
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <datalist id={`pillars-${clientId}`}>
        {pillars.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" className="btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          ←
        </button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: 0, minWidth: 170 }}>{monthLabel}</h2>
        <button type="button" className="btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
          →
        </button>
        <span style={{ flex: 1 }} />
        {editable && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={generate}
              disabled={busy || !hasPackage}
              title={hasPackage ? undefined : "Choose this client's package first"}
            >
              Fill {monthLabel} from the package
            </button>
            <button type="button" className="btn" onClick={add} disabled={busy}>
              + Add a video
            </button>
          </>
        )}
      </div>

      {editable && !hasPackage && (
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 14px" }}>
          Choose this client’s package (Package tab) to fill a month in one go from their posting days. You can still add
          videos one at a time.
        </p>
      )}
      {editable && hasPackage && pillars.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 14px" }}>
          The content plan has no pillars yet, so new videos will need one picking by hand.
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--danger-fg, #c0392b)", fontSize: 14, margin: "0 0 12px" }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 12px" }}>
          {notice}
        </p>
      )}

      {loading ? (
        <p style={{ color: "var(--text-3)" }}>Loading…</p>
      ) : dated.length === 0 ? (
        <p className="card card-pad-sm" style={{ color: "var(--text-3)", margin: "0 0 20px" }}>
          Nothing scheduled for {monthLabel} yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
          {dated.map(row)}
        </ul>
      )}

      {undated.length > 0 && (
        <section>
          <h3 style={{ ...mono, margin: "0 0 10px" }}>Not given a day yet ({undated.length})</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {undated.map(row)}
          </ul>
        </section>
      )}
    </div>
  );
}
