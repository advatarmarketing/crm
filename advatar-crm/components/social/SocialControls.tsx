"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSocialSetupAction, syncSocialNowAction } from "@/lib/social/actions";
import { SOCIAL_PLATFORMS, compactNumber, type SocialPlatform, type SocialPost } from "@/lib/social";

export function SyncNowButton({ clientId }: { clientId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="sh-inline">
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncSocialNowAction(clientId);
            setNote(r.ok ? r.message ?? "Up to date." : r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Refreshing…" : "Refresh now"}
      </button>
      {note && <span className="sh-note">{note}</span>}
    </span>
  );
}

/**
 * "Accounts we manage", at the top of the client's Performance tab:
 * each platform's profile link and whether we post there, and the day
 * we started posting for them, so their dashboard only counts our work.
 */
export function AccountsSetup({
  clientId,
  chosen,
  urls,
  startedOn,
  scanning,
}: {
  clientId: string;
  chosen: SocialPlatform[];
  urls: Partial<Record<SocialPlatform, string>>;
  startedOn: string | null;
  /** SCRAPECREATORS_API_KEY is set, so links get read. */
  scanning: boolean;
}) {
  const [on, setOn] = useState<SocialPlatform[]>(chosen);
  const [links, setLinks] = useState<Record<string, string>>({ ...urls });
  const [date, setDate] = useState(startedOn ?? "");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const dirty =
    JSON.stringify([...on].sort()) !== JSON.stringify([...chosen].sort()) ||
    SOCIAL_PLATFORMS.some((p) => (links[p.id] ?? "") !== (urls[p.id] ?? "")) ||
    date !== (startedOn ?? "");

  function save() {
    setNote(null);
    start(async () => {
      const r = await saveSocialSetupAction(clientId, { platforms: on, urls: links, startedOn: date || null });
      if (!r.ok) return setNote({ ok: false, text: r.error });
      if (r.urls) setLinks({ ...r.urls });
      setOn((prev) => Array.from(new Set([...prev, ...(Object.keys(r.urls ?? {}) as SocialPlatform[])])));
      setNote(r.message ? { ok: false, text: `Saved, but: ${r.message}` } : { ok: true, text: "Saved." });
      router.refresh();
    });
  }

  return (
    <section className="sh-setup" aria-labelledby="sh-setup-h">
      <div className="sh-setup-head">
        <h3 id="sh-setup-h">Accounts we manage</h3>
        <p>Paste their profile on each platform we post on, and when we started. Their public numbers are read from these links every day; only posts from the start date on count.</p>
      </div>
      <div className="sh-setup-rows">
        {SOCIAL_PLATFORMS.map((p) => {
          const ticked = on.includes(p.id);
          return (
            <div key={p.id} className="sh-setup-row" style={{ ["--pc" as string]: p.rgb }} data-on={ticked ? "true" : undefined}>
              <label className="sh-setup-tick">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={(e) => setOn((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                />
                <span className="sh-dot" aria-hidden="true" />
                {p.label}
              </label>
              <input
                className="sh-setup-url"
                value={links[p.id] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setLinks((prev) => ({ ...prev, [p.id]: v }));
                  if (v.trim() && !on.includes(p.id)) setOn((prev) => [...prev, p.id]);
                }}
                placeholder={p.id === "tiktok" ? "tiktok.com/@theirname" : p.id === "instagram" ? "instagram.com/theirname" : "facebook.com/theirpage"}
                aria-label={`${p.label} profile link`}
              />
            </div>
          );
        })}
      </div>
      {!scanning && (
        <p className="sh-agency">
          <span className="sh-agency-text">
            <strong>Profile scanning isn&rsquo;t switched on yet.</strong> Add SCRAPECREATORS_API_KEY in Vercel and redeploy. The links are
            saved in the meantime.
          </span>
        </p>
      )}

      <div className="sh-setup-foot">
        <label className="sh-setup-date">
          <span>First posting date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving and reading profiles…" : "Save"}
        </button>
        {note && <span className={note.ok ? "sh-note" : "sh-error"}>{note.text}</span>}
      </div>
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
