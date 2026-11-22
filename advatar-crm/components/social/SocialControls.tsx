"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshNowAction, reviewReadingAction, saveSocialSetupAction } from "@/lib/social/actions";
import { SOCIAL_PLATFORMS, compactNumber, platformLabel, type SocialPlatform, type SocialPost } from "@/lib/social";
import type { ReviewItem, RunInfo } from "@/lib/social/team";
import type { Baseline } from "@/lib/social/dashboard";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/**
 * Refresh now: runs the scraper on GitHub for this client. While it's
 * queued or running, the page checks back every 15 seconds so the new
 * numbers appear by themselves.
 */
export function RefreshNow({ clientId, run, ready }: { clientId: string; run: RunInfo | null; ready: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const active = !!run && (run.status === "queued" || run.status === "running") && Date.now() - new Date(run.createdAt).getTime() < 30 * 60_000;

  // A message from pressing the button is about that moment; once the
  // run moves on, its own status says what happened.
  const runKey = run ? `${run.id}:${run.status}` : "";
  useEffect(() => {
    setNote(null);
  }, [runKey]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [active, router]);

  const status = !run
    ? null
    : active
      ? run.status === "queued"
        ? `Starting… (asked at ${when(run.createdAt)}). Usually 3–5 minutes.`
        : "Reading the profiles now…"
      : run.status === "done"
        ? `Last ${run.trigger === "manual" ? "refresh" : "daily update"} ${when(run.finishedAt ?? run.createdAt)}: ${run.reads} read${run.reads === 1 ? "" : "s"}${run.failures ? `, ${run.failures} failed` : ""}.`
        : run.status === "skipped"
          ? run.note ?? "The last update was skipped."
          : run.status === "failed"
            ? `The last refresh didn't run: ${run.note ?? "unknown problem"}`
            : null;

  return (
    <div className="sh-refresh">
      <button
        type="button"
        className="btn"
        disabled={pending || active || !ready}
        title={ready ? undefined : "Needs GITHUB_ACTIONS_TOKEN in Vercel"}
        onClick={() =>
          start(async () => {
            const r = await refreshNowAction(clientId);
            setNote(r.ok ? { ok: true, text: r.message ?? "Started." } : { ok: false, text: r.error });
            router.refresh();
          })
        }
      >
        {pending ? "Starting…" : active ? "Refreshing…" : "Refresh now"}
      </button>
      {note && !active ? <span className={note.ok ? "sh-note" : "sh-error"}>{note.text}</span> : status ? <span className="sh-note">{status}</span> : null}
    </div>
  );
}

/**
 * "Accounts we manage", at the top of the client's Performance tab:
 * each platform's public profile link, and its starting point (the
 * follower count on the day we started, typed in by hand).
 */
export function AccountsSetup({
  clientId,
  chosen,
  urls,
  baselines,
}: {
  clientId: string;
  chosen: SocialPlatform[];
  urls: Partial<Record<SocialPlatform, string>>;
  baselines: Partial<Record<SocialPlatform, Baseline>>;
}) {
  const initial = () =>
    Object.fromEntries(
      SOCIAL_PLATFORMS.map((p) => [p.id, { followers: baselines[p.id]?.followers != null ? String(baselines[p.id]!.followers) : "", startedOn: baselines[p.id]?.started_on ?? "" }])
    ) as Record<string, { followers: string; startedOn: string }>;
  const [on, setOn] = useState<SocialPlatform[]>(chosen);
  const [links, setLinks] = useState<Record<string, string>>({ ...urls });
  const [base, setBase] = useState(initial);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const startKey = JSON.stringify(initial());
  const dirty =
    JSON.stringify([...on].sort()) !== JSON.stringify([...chosen].sort()) ||
    SOCIAL_PLATFORMS.some((p) => (links[p.id] ?? "") !== (urls[p.id] ?? "")) ||
    JSON.stringify(base) !== startKey;

  function save() {
    setNote(null);
    start(async () => {
      const r = await saveSocialSetupAction(clientId, { platforms: on, urls: links, baselines: base });
      if (!r.ok) return setNote({ ok: false, text: r.error });
      if (r.urls) setLinks({ ...r.urls });
      setOn((prev) => Array.from(new Set([...prev, ...(Object.keys(r.urls ?? {}) as SocialPlatform[])])));
      setNote({ ok: true, text: r.message ?? "Saved." });
      router.refresh();
    });
  }

  return (
    <section className="sh-setup" aria-labelledby="sh-setup-h">
      <div className="sh-setup-head">
        <h3 id="sh-setup-h">Accounts we manage</h3>
        <p>
          Paste each public profile we post on, and its starting point: the follower count on the day we started. The numbers are read every day
          at 5pm. &ldquo;Since we started&rdquo; growth is measured from the starting point.
        </p>
      </div>
      <div className="sh-setup-grid" role="table" aria-label="Profiles and starting points">
        <div className="sh-setup-colhead" role="row">
          <span role="columnheader">Platform</span>
          <span role="columnheader">Public profile link</span>
          <span role="columnheader">Followers when we started</span>
          <span role="columnheader">Date we started</span>
        </div>
        {SOCIAL_PLATFORMS.map((p) => {
          const ticked = on.includes(p.id);
          return (
            <div key={p.id} className="sh-setup-row" role="row" style={{ ["--pc" as string]: p.rgb }} data-on={ticked ? "true" : undefined} data-platform={p.id}>
              <label className="sh-setup-tick" role="cell">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={(e) => setOn((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                />
                <span className="sh-dot" aria-hidden="true" />
                {p.label}
              </label>
              <input
                role="cell"
                className="sh-setup-url"
                value={links[p.id] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setLinks((prev) => ({ ...prev, [p.id]: v }));
                  if (v.trim() && !on.includes(p.id)) setOn((prev) => [...prev, p.id]);
                }}
                placeholder={p.placeholder}
                aria-label={`${p.label} profile link`}
              />
              <input
                role="cell"
                className="sh-setup-url sh-setup-num"
                inputMode="numeric"
                value={base[p.id].followers}
                onChange={(e) => setBase((prev) => ({ ...prev, [p.id]: { ...prev[p.id], followers: e.target.value } }))}
                placeholder="e.g. 1204"
                aria-label={`${p.label} followers when we started`}
              />
              <input
                role="cell"
                type="date"
                className="sh-setup-url"
                value={base[p.id].startedOn}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBase((prev) => ({ ...prev, [p.id]: { ...prev[p.id], startedOn: e.target.value } }))}
                aria-label={`${p.label} date we started`}
              />
            </div>
          );
        })}
      </div>
      <div className="sh-setup-foot">
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save"}
        </button>
        {note && <span className={note.ok ? "sh-note" : "sh-error"}>{note.text}</span>}
      </div>
    </section>
  );
}

/** Readings the safety checks held back, with the screenshot the AI read. */
export function ReviewList({ items, failedPosts }: { items: ReviewItem[]; failedPosts: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (!items.length && !failedPosts) return null;
  const decide = (id: string, d: "accept" | "reject") =>
    start(async () => {
      setError(null);
      const r = await reviewReadingAction(id, d);
      if (!r.ok) setError(r.error);
      router.refresh();
    });

  return (
    <section className="sh-review" aria-labelledby="sh-review-h">
      <h3 id="sh-review-h">Needs checking</h3>
      <p className="sh-review-sub">
        These weren&rsquo;t shown to the client. The dashboard keeps the last good numbers until a reading is accepted or a good one comes in.
      </p>
      <ul>
        {items.map((it) => {
          const followers = it.stats.find((s) => s.name === "followers" || s.name === "subscribers");
          return (
            <li key={it.id} className="sh-review-item" data-status={it.status}>
              {it.screenshot ? (
                <a href={it.screenshot} target="_blank" rel="noopener noreferrer" className="sh-review-shot" aria-label="Open the screenshot the AI read">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.screenshot} alt={`Screenshot of the ${platformLabel(it.platform)} ${it.kind}`} loading="lazy" />
                </a>
              ) : (
                <span className="sh-review-shot sh-review-noshot">No screenshot</span>
              )}
              <div className="sh-review-body">
                <strong>
                  {platformLabel(it.platform)} {it.kind === "profile" ? "profile" : "post"} · {it.status === "flagged" ? "held back" : "couldn’t be read"}
                </strong>
                <span className="sh-muted">{when(it.takenAt)}</span>
                {it.problem && <p>{it.problem}</p>}
                {followers && (
                  <p className="sh-muted">
                    The AI read &ldquo;{followers.text}&rdquo; ({followers.value?.toLocaleString("en-GB") ?? "?"}), {Math.round(followers.confidence * 100)}% sure.
                  </p>
                )}
                {it.status === "flagged" && (
                  <div className="sh-review-actions">
                    <button type="button" className="btn btn-primary" disabled={pending} onClick={() => decide(it.id, "accept")}>
                      Accept
                    </button>
                    <button type="button" className="btn" disabled={pending} onClick={() => decide(it.id, "reject")}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {failedPosts > 0 && (
        <p className="sh-muted">
          {failedPosts} post{failedPosts === 1 ? "" : "s"} couldn&rsquo;t be read in the latest update (often a login wall). Their last good numbers are kept.
        </p>
      )}
      {error && <p className="sh-error">{error}</p>}
    </section>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  const day = new Date(post.posted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  const p = SOCIAL_PLATFORMS.find((x) => x.id === post.platform)!;
  const inner = (
    <>
      <span className="sh-thumb">
        {/* Platform image links are short-lived and from their CDNs, so
            next/image has nothing useful to cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {post.thumbnail_url ? <img src={post.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="sh-thumb-blank">{post.is_video ? "▶" : "◻"}</span>}
        <span className="sh-badge" style={{ ["--pc" as string]: p.rgb }}>
          <span className="sh-dot" aria-hidden="true" />
          {p.label}
        </span>
      </span>
      <span className="sh-post-body">
        <span className="sh-post-cap">{post.caption?.trim() || "—"}</span>
        <span className="sh-post-meta">
          <span>{day}</span>
          <span title="Likes">♥ {compactNumber(post.likes)}</span>
          <span title="Comments">💬 {compactNumber(post.comments)}</span>
          <span title="Views">▶ {compactNumber(post.views)}</span>
        </span>
      </span>
    </>
  );
  return post.permalink ? (
    <a className="sh-post" href={post.permalink} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <div className="sh-post">{inner}</div>
  );
}

/** The latest three, and "View all" to open the rest. */
export function RecentPosts({ posts }: { posts: SocialPost[] }) {
  const [all, setAll] = useState(false);
  const [index, setIndex] = useState(0);
  if (!posts.length) return <p className="sh-muted">No posts have come through yet.</p>;

  if (all) {
    return (
      <>
        <div className="sh-post-grid">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
        <button type="button" className="btn sh-more" onClick={() => setAll(false)}>
          Show fewer
        </button>
      </>
    );
  }

  const latest = posts.slice(0, 3);
  return (
    <>
      <div className="sh-carousel" aria-roledescription="carousel">
        <div className="sh-track" style={{ ["--i" as string]: index }}>
          {latest.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
        {latest.length > 1 && (
          <div className="sh-dots" role="group" aria-label="Choose a post">
            {latest.map((p, i) => (
              <button key={p.id} type="button" aria-label={`Post ${i + 1}`} aria-current={i === index} onClick={() => setIndex(i)} />
            ))}
          </div>
        )}
      </div>
      {posts.length > 3 && (
        <button type="button" className="btn sh-more" onClick={() => setAll(true)}>
          View all ({posts.length})
        </button>
      )}
    </>
  );
}
