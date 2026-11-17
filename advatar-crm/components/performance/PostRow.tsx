"use client";

import { useRef, useState } from "react";
import { METRICS, METRIC_LABEL, PLATFORMS, detectPlatform, hasNumbers, platformLabel, type Metric, type PlatformId, type VideoPost } from "@/lib/performance";
import {
  addPostAction,
  fetchYoutubePostAction,
  readPostScreenshotAction,
  removePostAction,
  savePostNumbersAction,
} from "@/app/app/performance/actions";

/**
 * One place a video was posted: its link and the numbers it reached.
 *
 * Numbers get in three ways. Typed. Read off a screenshot of the
 * post's insights (choose a file, or copy the screenshot and paste it
 * onto the row). Or, for YouTube, fetched.
 */

export interface MetricsSetup {
  screenshots: boolean;
  youtube: boolean;
}

/** Shrinks a screenshot in the browser so it travels quickly and stays readable. */
async function shrink(file: Blob): Promise<{ data: string; type: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.88);
  return { data: url.slice(url.indexOf(",") + 1), type: "image/jpeg" };
}

function when(iso: string | null, source: VideoPost["metrics_source"]): string {
  if (!iso) return "No numbers yet";
  const day = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `Updated ${day}${source === "screenshot" ? " from a screenshot" : source === "youtube" ? " from YouTube" : ""}`;
}

export function PostRow({
  post,
  editable,
  setup,
  heading,
  onChanged,
}: {
  post: VideoPost;
  editable: boolean;
  setup: MetricsSetup;
  /** Shown above the row where the video is not already obvious. */
  heading?: string;
  onChanged: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  // Remounts the inputs when saved numbers change underneath them.
  const stamp = METRICS.map((m) => post[m] ?? "").join("|");

  async function typed(metric: Metric, raw: string) {
    const text = raw.replace(/[,\s]/g, "");
    const value = text === "" ? null : Number(text);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return setError("Use whole numbers only.");
    if (value === (post[metric] ?? null)) return;
    setError(null);
    const res = await savePostNumbersAction(post.id, { [metric]: value });
    if (res.error) return setError(res.error);
    onChanged();
  }

  async function screenshot(blob: Blob | null | undefined) {
    if (!blob || !blob.type.startsWith("image/")) return;
    setBusy("Reading the screenshot…");
    setError(null);
    setNote(null);
    try {
      const img = await shrink(blob);
      const res = await readPostScreenshotAction(post.id, img.data, img.type);
      if (res.error) setError(res.error);
      else {
        const got = METRICS.filter((m) => res.read?.[m] !== null && res.read?.[m] !== undefined).map((m) => METRIC_LABEL[m].toLowerCase());
        setNote(`Read ${got.join(", ")}.${res.note ? ` ${res.note}` : ""} Check them against the post.`);
        onChanged();
      }
    } catch {
      setError("That image couldn’t be opened. Try a PNG or JPEG.");
    }
    setBusy(null);
    if (file.current) file.current.value = "";
  }

  async function youtube() {
    setBusy("Fetching from YouTube…");
    setError(null);
    const res = await fetchYoutubePostAction(post.id);
    setBusy(null);
    if (res.error) return setError(res.error);
    onChanged();
  }

  async function remove() {
    const res = await removePostAction(post.id);
    if (res.error) return setError(res.error);
    onChanged();
  }

  const rgb = PLATFORMS.find((p) => p.id === post.platform)?.rgb ?? "139, 92, 246";

  return (
    <div
      className="post-row"
      style={{ ["--pc" as string]: rgb }}
      data-post-id={post.id}
      onPaste={
        editable && setup.screenshots
          ? (e) => {
              const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
              if (item) {
                e.preventDefault();
                screenshot(item.getAsFile());
              }
            }
          : undefined
      }
    >
      {heading && <p className="post-heading">{heading}</p>}
      <div className="post-top">
        <span className="post-platform">{platformLabel(post.platform)}</span>
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="post-url">
          {post.url.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
        <span className="vm-hint post-when">{when(post.metrics_at, post.metrics_source)}</span>
      </div>

      <div className="post-numbers" key={stamp}>
        {METRICS.map((m) => (
          <label key={m} className={m === "views" ? "is-main" : undefined}>
            <span className="vm-label">{METRIC_LABEL[m]}</span>
            {editable ? (
              <input inputMode="numeric" defaultValue={post[m] ?? ""} placeholder="–" aria-label={`${METRIC_LABEL[m]} on ${platformLabel(post.platform)}`} onBlur={(e) => typed(m, e.target.value)} />
            ) : (
              <strong>{post[m] === null ? "–" : post[m]!.toLocaleString("en-GB")}</strong>
            )}
          </label>
        ))}
      </div>

      {editable && (
        <div className="post-actions">
          {setup.screenshots && (
            <>
              <button type="button" className="btn" onClick={() => file.current?.click()} disabled={Boolean(busy)}>
                Read from a screenshot
              </button>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => screenshot(e.target.files?.[0])} />
            </>
          )}
          {post.platform === "youtube" && setup.youtube && (
            <button type="button" className="btn" onClick={youtube} disabled={Boolean(busy)}>
              Fetch from YouTube
            </button>
          )}
          {busy ? (
            <span className="vm-hint" role="status">
              {busy}
            </span>
          ) : setup.screenshots && !hasNumbers(post) ? (
            <span className="vm-hint">or click here and paste one (Ctrl/⌘ + V)</span>
          ) : null}
          <span style={{ flex: 1 }} />
          {confirm ? (
            <>
              <button type="button" className="btn btn-danger" onClick={remove}>
                Remove link and numbers
              </button>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="vm-link" onClick={() => setConfirm(true)}>
              Remove
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="vm-error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      {note && !error && (
        <p role="status" className="vm-hint">
          {note}
        </p>
      )}
    </div>
  );
}

/** "Add where it was posted": paste the link, the platform is recognised. */
export function AddPost({ videoId, taken, onAdded }: { videoId: string; taken: PlatformId[]; onAdded: () => void }) {
  const [link, setLink] = useState("");
  const [platform, setPlatform] = useState<PlatformId | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guessed = link.trim() ? detectPlatform(link.trim().startsWith("http") ? link.trim() : `https://${link.trim()}`) : null;
  const chosen = platform || guessed || "";
  const free = PLATFORMS.filter((p) => !taken.includes(p.id));
  if (free.length === 0) return null;

  async function add() {
    setBusy(true);
    setError(null);
    const text = link.trim();
    const res = await addPostAction(videoId, /^https?:\/\//i.test(text) || text.includes("<") ? text : `https://${text}`, (chosen || null) as PlatformId | null);
    setBusy(false);
    if (res.error) return setError(res.error);
    setLink("");
    setPlatform("");
    onAdded();
  }

  return (
    <form
      className="post-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (link.trim()) add();
      }}
    >
      <label>
        <span className="vm-label">Link to the post</span>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the Instagram, TikTok or other link" />
      </label>
      <label>
        <span className="vm-label">Platform</span>
        <select value={chosen} onChange={(e) => setPlatform(e.target.value as PlatformId)}>
          {!chosen && <option value="">Recognised from the link</option>}
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id} disabled={taken.includes(p.id)}>
              {p.label}
              {taken.includes(p.id) ? " (added)" : ""}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !link.trim()}>
        {busy ? "Adding…" : "Add link"}
      </button>
      {error && (
        <p role="alert" className="vm-error" style={{ margin: 0, gridColumn: "1 / -1" }}>
          {error}
        </p>
      )}
    </form>
  );
}
