"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimecode, type UploadChecklistItem } from "@/lib/uploads";
import { REVISION_LABELS, type PackageSettings } from "@/lib/packages";
import { playerFor } from "@/lib/video-links";
import { GUIDE_STAGES, guideHref } from "@/lib/guides";
import { ASPECTS, BOX_LABEL, aspectCss, prettyDay, type BoxState, type ContentVideo, type VideoCycle } from "@/lib/videos";
import { compact, type VideoPost } from "@/lib/performance";
import { AddPost, PostRow, type MetricsSetup } from "@/components/performance/PostRow";
import { approveVideoAction, sendVideoToClientAction, setVideoLinkAction, type VideoTextField } from "@/app/app/videos/actions";
import type { Delivery, VideoPatch } from "./VideoSchedule";

/**
 * Inside one video: what it is, the player, the revisions, and the
 * posted tick. The same parts in the same place for every video, and
 * one line at the top that says what to do next.
 */

const SCRIPT: { key: VideoTextField; label: string; rows: number; placeholder: string }[] = [
  { key: "description", label: "What it is", rows: 2, placeholder: "One or two lines on the idea" },
  { key: "hook", label: "Hook", rows: 2, placeholder: "The opening line" },
  { key: "body", label: "Body", rows: 5, placeholder: "What happens in the middle" },
  { key: "cta", label: "Call to action", rows: 2, placeholder: "What the viewer should do" },
];

const EXTRAS: { key: VideoTextField; label: string; placeholder: string }[] = [
  { key: "video_type", label: "Type of video", placeholder: "Talking head, b-roll, trend…" },
  { key: "video_set", label: "Shoot / video set", placeholder: "Video Set 1" },
  { key: "scenery", label: "Scenery (i/a)", placeholder: "i or a" },
  { key: "wms", label: "WMS", placeholder: "Initials" },
];

type StepState = "done" | "now" | "todo" | "alert";

export function VideoDetail({
  video,
  number,
  backLabel,
  state,
  status,
  delivery,
  pkg,
  pillars,
  cycles,
  editable,
  linkMode = null,
  canApprove = false,
  onClose,
  onPrev,
  onNext,
  onSave,
  onTogglePosted,
  onRemove,
  onReload,
  onError,
  posts,
  setup,
}: {
  /** Where it was posted (0046). Null before that update is run. */
  posts: VideoPost[] | null;
  setup: MetricsSetup;
  video: ContentVideo;
  /** Null for a video that is not in a month. */
  number: number | null;
  backLabel: string;
  state: BoxState;
  status: string;
  delivery: Delivery | null;
  pkg: PackageSettings | null;
  pillars: string[];
  cycles: VideoCycle[];
  editable: boolean;
  /**
   * For a videographer, who can't edit the video otherwise: "add" lets
   * them add the link and new versions, and tick off the changes asked
   * for (0058). "preview" is the CEO looking at their screen, which
   * can't save anything, so it only says where the link goes.
   */
  linkMode?: "add" | "preview" | null;
  /**
   * The CEO and operations. Approving a video is what lets the client
   * see it (0060); everyone else waits for them.
   */
  canApprove?: boolean;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onSave: (patch: VideoPatch) => void;
  onTogglePosted: () => void;
  onRemove: () => void;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const player = useRef<HTMLVideoElement>(null);
  const name = number ? `Video ${number}` : "Video";
  const upload = delivery?.upload ?? null;
  const hasVideo = Boolean(upload && upload.current_version >= 1);
  const shared = upload?.visibility === "team_and_client";
  const decision = upload?.clientDecision ?? null;
  const mode = pkg ? pkg.revisions : "unset";
  const reviews = mode !== "none";
  const source = hasVideo ? playerFor(delivery?.streamUrl, delivery?.url) : null;
  // Can add the link and work through the changes: the team, or the
  // videographer on this client.
  const linkable = editable || linkMode === "add";

  // A framed player cannot tell us its shape, so it is chosen; wide
  // hosts start wide. A direct video file sizes itself.
  const wideHost = source?.kind === "frame" && (source.via === "vimeo" || source.via === "loom" || (source.via === "youtube" && !/\/shorts\//.test(delivery?.url ?? "")));
  const shape = aspectCss(video.aspect, wideHost ? "16:9" : "9:16");
  const shapeId = ASPECTS.find((a) => a.css === shape)?.id ?? "9:16";

  const [items, setItems] = useState<UploadChecklistItem[]>(upload?.checklist ?? []);
  // New notes from the client arrive as new items on a reload.
  useEffect(() => {
    setItems(upload?.checklist ?? []);
  }, [upload?.checklist]);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [moreOpen, setMoreOpen] = useState(EXTRAS.some((f) => (video[f.key as keyof ContentVideo] as string | null)?.trim()));

  const open = items.filter((i) => !i.done);
  const scripted = Boolean(video.hook?.trim() || video.body?.trim());
  const posted = Boolean(video.posted_at);

  // One instruction, worked out from where the video is.
  const next = posted
    ? "Posted. Nothing left to do on this one."
    : !hasVideo
      ? !editable
        ? "When it’s filmed and edited, add the video link."
        : scripted
        ? "Scripted. When it’s filmed and edited, add the video link."
        : "Write the script below, or add the video link if it’s already made."
      : open.length > 0
        ? `${open.length} change${open.length === 1 ? "" : "s"} still to make. Tick each one off as it’s done.`
        : decision === "changes_requested"
          ? "Every change is ticked. Add the new version’s link and the client is told it’s ready."
          : !reviews
            ? "Ready. Post it, then tick it as posted."
            : decision === "approved"
              ? "Approved by the client. Post it, then tick it as posted."
              : shared
                ? "With the client. Waiting for them to approve or ask for changes."
                : canApprove
                  ? "The video is in. Watch it, then approve it to send it to the client."
                  : "The video is in. Waiting for the CEO or operations to approve it for the client.";

  const steps: { label: string; state: StepState }[] = [
    { label: "Script", state: scripted || hasVideo ? "done" : "now" },
    { label: "Video", state: hasVideo ? "done" : scripted ? "now" : "todo" },
    ...(reviews
      ? [
          {
            label: decision === "changes_requested" || open.length > 0 ? "Revisions" : "Client review",
            state: (!hasVideo
              ? "todo"
              : decision === "changes_requested" || open.length > 0
                ? "alert"
                : decision === "approved" || posted
                  ? "done"
                  : "now") as StepState,
          },
        ]
      : []),
    { label: "Posted", state: posted ? "done" : hasVideo && (!reviews || decision === "approved") && open.length === 0 ? "now" : "todo" },
  ];

  async function saveLink() {
    setBusy(true);
    onError(null);
    const res = await setVideoLinkAction(video.id, link, name).catch(() => ({ error: "That didn’t save. Check your connection and try again." }));
    if (res.error) {
      setBusy(false);
      return onError(res.error);
    }
    await onReload();
    setBusy(false);
    setLink("");
    setLinking(false);
  }

  async function share(on: boolean) {
    if (!upload) return;
    setBusy(true);
    onError(null);
    const res = on ? await approveVideoAction(upload.id) : await sendVideoToClientAction(upload.id, false);
    if (res.error) onError(res.error);
    else await onReload();
    setBusy(false);
  }

  async function tick(item: UploadChecklistItem) {
    const nextDone = !item.done;
    const before = items;
    setItems((rows) => rows.map((r) => (r.id === item.id ? { ...r, done: nextDone } : r)));
    const { error } = await supabase
      .from("submission_checklist")
      .update({ done: nextDone, done_at: nextDone ? new Date().toISOString() : null } as never)
      .eq("id", item.id);
    if (error) {
      setItems(before);
      return onError(error.message);
    }
    onReload();
  }

  async function addTask() {
    const text = task.trim();
    if (!text || !upload) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("submission_checklist")
      .insert({ submission_id: upload.id, text: text.slice(0, 500), feedback_id: null, version: upload.current_version } as never)
      .select("id, text, done, version, source, feedback_id, created_at")
      .single();
    setBusy(false);
    if (error || !data) return onError(error?.message ?? "Could not add that.");
    const row = data as { id: string; text: string; done?: boolean; version: number | null; source?: string; feedback_id: string | null; created_at: string };
    setItems((rows) => [
      ...rows,
      { id: row.id, text: row.text, done: Boolean(row.done), version: row.version, source: row.source === "client" ? "client" : "team", feedbackId: row.feedback_id, created_at: row.created_at },
    ]);
    setTask("");
    onReload();
  }

  const field = (key: VideoTextField) => (video[key as keyof ContentVideo] as string | null) ?? "";
  const blurSave = (key: VideoTextField, value: string) => value.trim() !== field(key).trim() && onSave({ [key]: value });

  const roundsLimit = pkg?.revisions === "full" ? pkg.revision_rounds : null;
  const notes = upload?.notes ?? [];

  return (
    <article className={`vd vbox--${state} fade-in`}>
      <nav className="vd-nav">
        <button type="button" className="back-link" onClick={onClose}>
          ← {backLabel}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous video">
          ←
        </button>
        <button type="button" className="btn" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next video">
          →
        </button>
      </nav>

      <header className="vd-hero">
        <div className="vd-hero-top">
          <span className="vd-number">{name}</span>
          <span className="vd-state">
            <span className="vbox-dot" aria-hidden />
            {BOX_LABEL[state]}
          </span>
        </div>
        {editable ? (
          <input
            className="vd-title"
            aria-label="What this video is"
            placeholder="What is this video?"
            defaultValue={video.title ?? ""}
            onBlur={(e) => blurSave("title", e.target.value)}
          />
        ) : (
          <h2 className="vd-title">{video.title?.trim() || "Untitled"}</h2>
        )}

        <div className="vd-meta">
          <label>
            <span className="vm-label">Content pillar</span>
            {editable ? (
              <>
                <input
                  list={`vd-pillars-${video.id}`}
                  placeholder="Choose or type"
                  defaultValue={video.pillar ?? ""}
                  onBlur={(e) => blurSave("pillar", e.target.value)}
                />
                <datalist id={`vd-pillars-${video.id}`}>
                  {pillars.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </>
            ) : (
              <span>{video.pillar || "None yet"}</span>
            )}
            {/* 0054: the team's guide for this kind of video. Only the
                team ever opens this view (a client's grid links to
                their own Videos page instead). */}
            {video.pillar?.trim() && (
              <span className="vd-guides">
                {GUIDE_STAGES.map((g) => (
                  <a key={g.id} href={guideHref(video.client_id, video.pillar!.trim(), g.id, video.id)}>
                    How to {g.verb} this →
                  </a>
                ))}
              </span>
            )}
          </label>
          <label>
            <span className="vm-label">Goes out</span>
            {editable ? (
              <input type="date" value={video.publish_on ?? ""} onChange={(e) => onSave({ publish_on: e.target.value || null })} />
            ) : (
              <span>{video.publish_on ? prettyDay(video.publish_on) : "No date yet"}</span>
            )}
          </label>
          {editable && cycles.length > 0 && (
            <label>
              <span className="vm-label">Month</span>
              <select value={video.cycle_id ?? ""} onChange={(e) => onSave({ cycle_id: e.target.value || null })}>
                {!video.cycle_id && <option value="">Not in a month</option>}
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    Month {c.number}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <ol className="vd-steps" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s.label} className={`is-${s.state}`} aria-current={s.state === "now" || s.state === "alert" ? "step" : undefined}>
              <span aria-hidden>{s.state === "done" ? "✓" : i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>

        <p className="vd-next" role="status">
          <strong>Next:</strong> {next}
        </p>
      </header>

      <div className="vd-cols">
        <div className="vd-col">
          <section className="card card-pad vd-card">
            <h3 className="vm-sub">The video</h3>
            {source?.kind === "native" ? (
              <video
                ref={player}
                src={source.src}
                controls
                playsInline
                preload="metadata"
                className="vd-player is-native"
                style={video.aspect ? { aspectRatio: shape } : undefined}
              />
            ) : source?.kind === "frame" ? (
              <iframe
                src={source.src}
                title={`${name} player`}
                loading="lazy"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="vd-player"
                style={{ aspectRatio: shape }}
              />
            ) : source?.kind === "link" ? (
              <div className="vd-empty">
                <p>This link can’t be played here.</p>
                <a href={source.href} target="_blank" rel="noopener noreferrer" className="btn">
                  Open the video ↗
                </a>
              </div>
            ) : (
              <div className="vd-empty">
                <span className="vd-empty-icon" aria-hidden>
                  ▶
                </span>
                <p>No video yet.</p>
                {linkable && !linking && (
                  <button type="button" className="btn btn-primary" onClick={() => setLinking(true)}>
                    + Add the video link
                  </button>
                )}
                {linkMode === "preview" && <p className="vm-hint">The videographer adds the video link here from their own login.</p>}
              </div>
            )}

            {linkable && linking && (
              <div className="vd-link fade-in">
                <label>
                  <span className="vm-label">{hasVideo ? "Link to the new version" : "Video link or embed code"}</span>
                  <textarea
                    rows={2}
                    autoFocus
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="Paste the link, or the embed code"
                  />
                </label>
                <p className="vm-hint">
                  Works with Google Drive (shared as “Anyone with the link”), Cloudinary, YouTube, Vimeo and Loom.
                  {hasVideo && shared
                    ? canApprove
                      ? " The client is told a new version is ready."
                      : " It goes back to the CEO and operations to approve before the client sees it."
                    : ""}
                </p>
                <div className="onboard-actions">
                  <button type="button" className="btn btn-primary" onClick={saveLink} disabled={busy || !link.trim()}>
                    {busy ? "Saving…" : hasVideo ? `Save as version ${(upload?.current_version ?? 1) + 1}` : "Show the player"}
                  </button>
                  <button type="button" className="btn" onClick={() => setLinking(false)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {hasVideo && upload && (
              <>
                <div className="vd-row">
                  <span className="pill">Version {upload.current_version}</span>
                  {delivery?.url && (
                    <a href={delivery.url} target="_blank" rel="noopener noreferrer" className="vm-link">
                      Open link ↗
                    </a>
                  )}
                  {editable && posts !== null && source?.kind !== "link" && (
                    <label className="vd-shape">
                      <span className="sr-only">Shape of the video</span>
                      <select value={shapeId} onChange={(e) => onSave({ aspect: e.target.value })} aria-label="Shape of the video">
                        {ASPECTS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <span style={{ flex: 1 }} />
                  {linkable && !linking && (
                    <button type="button" className="btn" onClick={() => setLinking(true)}>
                      + Add a new version
                    </button>
                  )}
                </div>
                <div className={shared ? "vd-share is-on" : "vd-share"}>
                  <p>
                    {shared ? (
                      <>
                        <strong>✓ Approved.</strong> The client can watch this on their Videos page.
                      </>
                    ) : (
                      <>
                        <strong>Waiting for approval.</strong> Only the team can see this.{" "}
                        {canApprove ? "Approving it sends it to the client." : "The client sees it once the CEO or operations approve it."}
                      </>
                    )}
                  </p>
                  {canApprove &&
                    (shared ? (
                      <button type="button" className="vm-link" onClick={() => share(false)} disabled={busy}>
                        Hide from the client
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" onClick={() => share(true)} disabled={busy}>
                        {busy ? "Approving…" : "Approve and send to the client"}
                      </button>
                    ))}
                </div>
              </>
            )}
          </section>

          <section className="card card-pad vd-card vd-posted">
            <h3 className="vm-sub">Posted</h3>
            {editable ? (
              <button type="button" className={posted ? "vd-post is-on" : "vd-post"} aria-pressed={posted} onClick={onTogglePosted}>
                <span className="vd-post-tick" aria-hidden>
                  ✓
                </span>
                {posted ? `Posted ${video.posted_at ? prettyDay(video.posted_at.slice(0, 10)) : ""}` : "Tick when it’s posted"}
              </button>
            ) : (
              <p className="vm-hint">{posted ? "Posted." : "Not posted yet."}</p>
            )}
            {posted && editable && <p className="vm-hint">Click again to untick.</p>}
          </section>

          {posts !== null && (posted || posts.length > 0) && (
            <section className="card card-pad vd-card">
              <h3 className="vm-sub">Where it’s posted, and how it did</h3>
              {posts.length > 0 && (
                <p className="vd-views">
                  <strong>{compact(posts.reduce((n, p) => n + (p.views ?? 0), 0))}</strong> views across {posts.length} platform{posts.length === 1 ? "" : "s"}
                </p>
              )}
              {posts.length === 0 && (
                <p className="vm-hint">
                  {editable ? "Add the link on each platform it went out on. Its views, likes, comments and shares are then recorded here and counted on the Performance tab." : "No links added yet."}
                </p>
              )}
              {posts.map((p) => (
                <PostRow key={p.id} post={p} editable={editable} setup={setup} onChanged={onReload} />
              ))}
              {editable && <AddPost videoId={video.id} taken={posts.map((p) => p.platform)} onAdded={onReload} />}
            </section>
          )}
        </div>

        <div className="vd-col">
          <section className="card card-pad vd-card vd-rev">
            <h3 className="vm-sub">Revisions</h3>
            <div className="vd-guide">
              <strong>{mode === "unset" ? "No package chosen yet" : REVISION_LABELS[mode].title}</strong>
              <p>
                {mode === "unset"
                  ? `Until a package is chosen, the client can approve or ask for changes with no limit.${editable ? " Choose one on the Package tab." : ""}`
                  : mode === "full"
                    ? `The client can approve, or leave notes and ask for changes${
                        roundsLimit ? `, up to ${roundsLimit} round${roundsLimit === 1 ? "" : "s"} per video` : ", with no limit on rounds"
                      }. Each note they leave becomes a tick-box here.`
                    : mode === "approve"
                      ? "The client can approve each video but can’t ask for changes here. If they message a change, add it below as a task."
                      : "No client review on this package: we post for them. Use the list below for the team’s own fixes."}
              </p>
              {mode === "full" && roundsLimit && hasVideo && (
                <p className="vd-rounds">
                  <span className="vd-rounds-dots" aria-hidden>
                    {Array.from({ length: Math.min(roundsLimit, 20) }, (_, i) => (
                      <i key={i} className={i < (delivery?.roundsUsed ?? 0) ? "is-used" : ""} />
                    ))}
                  </span>
                  {Math.min(delivery?.roundsUsed ?? 0, roundsLimit)} of {roundsLimit} round{roundsLimit === 1 ? "" : "s"} used
                </p>
              )}
            </div>

            {hasVideo && reviews && (
              <p className="vd-verdict">
                {decision === "approved" ? (
                  <span className="pill pill-ok">✓ Approved by the client</span>
                ) : decision === "changes_requested" ? (
                  <span className="pill pill-violet">The client asked for changes</span>
                ) : shared ? (
                  <span className="pill pill-info">Waiting for the client</span>
                ) : (
                  <span className="pill">Waiting for approval</span>
                )}
              </p>
            )}

            {!hasVideo ? (
              <p className="vm-hint">Revisions start once the video link is added.</p>
            ) : (
              <>
                {items.length > 0 && (
                  <>
                    <div className="vd-check-head">
                      <span className="vm-label" style={{ margin: 0 }}>
                        Changes to make
                      </span>
                      <span className="vm-hint">
                        {items.length - open.length} of {items.length} done
                      </span>
                    </div>
                    <div className="meter" aria-hidden>
                      <div
                        className={open.length === 0 ? "meter-fill meter-fill-ok" : "meter-fill meter-fill-violet"}
                        style={{ width: `${Math.round(((items.length - open.length) / items.length) * 100)}%` }}
                      />
                    </div>
                    <ul className="vd-checks">
                      {[...open, ...items.filter((i) => i.done)].map((item) => (
                        <li key={item.id} className={item.done ? "is-done" : ""}>
                          <label>
                            <input type="checkbox" checked={item.done} onChange={() => tick(item)} disabled={!linkable} />
                            <span>{item.text}</span>
                          </label>
                          <span className={item.source === "client" ? "pill pill-violet" : "pill"}>
                            {item.source === "client" ? "Client" : "Team"}
                            {item.version ? ` · v${item.version}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {items.length === 0 && <p className="vm-hint">No changes asked for. When the client leaves notes, they appear here as a checklist.</p>}

                {linkable && (
                  <form
                    className="vd-add"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addTask();
                    }}
                  >
                    <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Add a change yourself" aria-label="Add a change" maxLength={500} />
                    <button type="submit" className="btn" disabled={busy || !task.trim()}>
                      Add
                    </button>
                  </form>
                )}

                {notes.length > 0 && (
                  <details className="vd-notes" open={decision === "changes_requested"}>
                    <summary>Notes in full ({notes.length})</summary>
                    <ul>
                      {notes.map((n) => (
                        <li key={n.id}>
                          <p>
                            {n.timecode_seconds !== null &&
                              (source?.kind === "native" ? (
                                <button
                                  type="button"
                                  className="pill pill-accent vd-time"
                                  title="Jump to this moment"
                                  onClick={() => {
                                    if (player.current) player.current.currentTime = n.timecode_seconds!;
                                  }}
                                >
                                  {formatTimecode(n.timecode_seconds)}
                                </button>
                              ) : (
                                <span className="pill vd-time">{formatTimecode(n.timecode_seconds)}</span>
                              ))}
                            {n.body}
                          </p>
                          <span className="vm-hint">
                            {n.audience === "client" ? "Client thread" : "Team only"} · {n.authorName ?? "Someone"}
                            {n.version ? ` · on version ${n.version}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>

          <section className="card card-pad vd-card">
            <h3 className="vm-sub">Script</h3>
            {SCRIPT.map((f) =>
              editable ? (
                <label key={f.key} className="vd-field">
                  <span className="vm-label">{f.label}</span>
                  <textarea rows={f.rows} defaultValue={field(f.key)} placeholder={f.placeholder} onBlur={(e) => blurSave(f.key, e.target.value)} />
                </label>
              ) : field(f.key).trim() ? (
                <div key={f.key} className="vd-field">
                  <span className="vm-label">{f.label}</span>
                  <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{field(f.key)}</p>
                </div>
              ) : null
            )}
            {!editable && !SCRIPT.some((f) => field(f.key).trim()) && <p className="vm-hint">No script written yet.</p>}

            {editable && !moreOpen && (
              <button type="button" className="vm-link" onClick={() => setMoreOpen(true)}>
                + Type, shoot and scenery
              </button>
            )}
            {(moreOpen || !editable) && (
              <div className="vd-extras">
                {EXTRAS.map((f) =>
                  editable ? (
                    <label key={f.key} className="vd-field">
                      <span className="vm-label">{f.label}</span>
                      <input defaultValue={field(f.key)} placeholder={f.placeholder} onBlur={(e) => blurSave(f.key, e.target.value)} />
                    </label>
                  ) : field(f.key).trim() ? (
                    <div key={f.key} className="vd-field">
                      <span className="vm-label">{f.label}</span>
                      <span>{field(f.key)}</span>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </section>

          {editable && (
            <p className="vd-remove">
              {confirmRemove ? (
                <>
                  Remove {name} for good?{" "}
                  <button type="button" className="btn btn-danger" onClick={onRemove}>
                    Yes, remove it
                  </button>{" "}
                  <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" className="vm-link" onClick={() => setConfirmRemove(true)}>
                  Remove this video
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
