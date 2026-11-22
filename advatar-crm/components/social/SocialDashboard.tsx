import Link from "next/link";
import { Sparkline } from "@/components/Sparkline";
import type { Dashboard, PlatformResult } from "@/lib/social/dashboard";
import { RANGES, SOCIAL_PLATFORMS, compactNumber, platformLabel, type Range, type SocialPost } from "@/lib/social";
import { AccountsSetup, RecentPosts, RefreshNow, ReviewList } from "./SocialControls";
import type { TeamSide } from "@/lib/social/team";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function signed(n: number | null): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${compactNumber(Math.abs(n))}`;
}

function Growth({ value, since }: { value: number | null; since?: string | null }) {
  if (value == null) return <span className="sh-growth sh-muted">Growth shows after a second day of data</span>;
  return (
    <span className="sh-growth" data-dir={value > 0 ? "up" : value < 0 ? "down" : "flat"}>
      {signed(value)}
      {since ? <span className="sh-muted"> since {dayLabel(since)}</span> : null}
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="sh-tile">
      <span className="sh-tile-label">{label}</span>
      <span className="sh-tile-value">{value}</span>
      {sub ? <span className="sh-tile-sub">{sub}</span> : null}
    </div>
  );
}

const NA = "Not available from this platform";

/** A number, or a calm note when the platform doesn't show it. */
function Num({ n }: { n: number | null }) {
  return n == null ? <span className="sh-na">{NA}</span> : <>{compactNumber(n)}</>;
}

function AccountCard({ p, team }: { p: PlatformResult; team: boolean }) {
  const meta = SOCIAL_PLATFORMS.find((x) => x.id === p.platform)!;
  const c = p.connection;
  const waiting = !p.url
    ? team
      ? `Add their ${meta.label} profile link above.`
      : `Not linked yet.`
    : team
      ? c?.last_error
        ? `Not read yet: ${c.last_error}`
        : "Linked. The first numbers come in at the next 5pm update, or press Refresh now."
      : `Linked. Your ${meta.label} numbers will appear here after the next daily update.`;

  return (
    <div className="sh-account" style={{ ["--pc" as string]: meta.rgb }} data-state={p.read ? "on" : "off"} data-platform={p.platform}>
      <div className="sh-account-head">
        <span className="sh-avatar sh-avatar-blank">
          <span className="sh-dot" />
        </span>
        <span className="sh-account-name">
          <strong>{meta.label}</strong>
          <small>{p.url ? p.handle || "Linked" : "Not linked yet"}</small>
        </span>
        {p.url && (
          <a className="sh-profile" href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open the ${meta.label} profile`}>
            Profile ↗
          </a>
        )}
      </div>

      {p.read ? (
        <>
          <div className="sh-account-stat">
            <span className="sh-big">{compactNumber(p.followers)}</span>
            <span className="sh-muted">{p.platform === "youtube" ? "subscribers" : "followers"}</span>
          </div>
          <div className="sh-account-trend">
            <Growth value={p.growth} since={p.growthSince} />
            {p.series.length > 1 && <Sparkline values={p.series.map((s) => s.followers)} color={`rgb(${meta.rgb})`} width={140} height={34} />}
          </div>
          <dl className="sh-account-dl">
            <div><dt>Likes</dt><dd><Num n={p.likes} /></dd></div>
            <div><dt>Comments</dt><dd><Num n={p.comments} /></dd></div>
            <div><dt>Posts</dt><dd>{p.posts == null && p.postsPending ? <span className="sh-na">After a second daily reading</span> : <Num n={p.posts} />}</dd></div>
          </dl>
          <div className="sh-account-foot">
            <span className="sh-muted">{p.lastReadAt ? `Updated ${when(p.lastReadAt)}` : ""}</span>
          </div>
        </>
      ) : (
        <div className="sh-account-empty">
          <p>{waiting}</p>
        </div>
      )}
    </div>
  );
}

/**
 * What the dashboard will look like, faded, behind a short message —
 * so an empty Content Hub shows what's coming rather than a blank box.
 * Labels only: every number is a grey bar, never a made-up figure.
 */
function Preview({ title, body, withAccounts }: { title: string; body: string; withAccounts: boolean }) {
  const bar = (w: number | string, h = 12) => <span className="shp-bar" style={{ width: w, height: h }} />;
  return (
    <div className="shp">
      <div className="shp-ghost" aria-hidden="true">
        {withAccounts && (
          <div className="sh-accounts">
            {SOCIAL_PLATFORMS.map((p) => (
              <div key={p.id} className="sh-account" style={{ ["--pc" as string]: p.rgb }}>
                <div className="sh-account-head">
                  <span className="sh-avatar sh-avatar-blank">
                    <span className="sh-dot" />
                  </span>
                  <span className="sh-account-name">
                    <strong>{p.label}</strong>
                    {bar(70, 9)}
                  </span>
                </div>
                <div className="sh-account-stat">{bar(110, 26)}</div>
                <svg className="shp-line" viewBox="0 0 140 34" preserveAspectRatio="none">
                  <path d="M0 30 C 25 28, 40 24, 60 21 S 100 12, 140 4" fill="none" stroke={`rgb(${p.rgb})`} strokeWidth="2" />
                </svg>
              </div>
            ))}
          </div>
        )}
        <div className="sh-tiles">
          {["Total followers", "Likes", "Comments", "Posts published"].map((l) => (
            <div key={l} className="sh-tile">
              <span className="sh-tile-label">{l}</span>
              {bar("60%", 24)}
            </div>
          ))}
        </div>
        <div className="sh-section">
          <h3>Recent posts</h3>
          <div className="sh-track shp-posts">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sh-post">
                <span className="sh-thumb" />
                <span className="sh-post-body">
                  {bar("90%", 10)}
                  {bar("55%", 10)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="sh-section">
          <h3>Most popular videos</h3>
          <div className="sh-lines">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sh-line">
                <span className="sh-rank">{i + 1}</span>
                <span className="sh-thumb-blank" />
                <span className="sh-line-main">{bar(`${70 - i * 12}%`, 10)}</span>
                <span className="sh-line-nums">{bar(40, 12)}</span>
                <span className="sh-line-nums sh-hide-sm">{bar(34, 12)}</span>
                <span className="sh-line-nums sh-hide-sm">{bar(34, 12)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="shp-msg">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

function PostLine({ post, rank }: { post: SocialPost; rank: number }) {
  const meta = SOCIAL_PLATFORMS.find((x) => x.id === post.platform)!;
  const body = (
    <>
      <span className="sh-rank">{rank}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {post.thumbnail_url ? <img src={post.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="sh-thumb-blank">▶</span>}
      <span className="sh-line-main">
        <span className="sh-line-cap">{post.caption?.trim() || "—"}</span>
        <span className="sh-line-sub" style={{ ["--pc" as string]: meta.rgb }}>
          <span className="sh-dot" aria-hidden="true" /> {meta.label} ·{" "}
          {new Date(post.posted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}
        </span>
      </span>
      <span className="sh-line-nums">
        <strong>{compactNumber(post.views)}</strong>
        <small>views</small>
      </span>
      <span className="sh-line-nums sh-hide-sm">
        <strong>{compactNumber(post.likes)}</strong>
        <small>likes</small>
      </span>
      <span className="sh-line-nums sh-hide-sm">
        <strong>{compactNumber(post.comments)}</strong>
        <small>comments</small>
      </span>
    </>
  );
  return post.permalink ? (
    <a className="sh-line" href={post.permalink} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="sh-line">{body}</div>
  );
}

/**
 * The client results dashboard: Instagram, TikTok, YouTube, Facebook,
 * LinkedIn and X, from the scraper's daily readings of their public
 * profiles. Used on the client's Content Hub and on the team's view of a
 * client (Performance tab), so both see the same numbers.
 */
export function SocialDashboard({
  data,
  clientId,
  audience,
  basePath,
  range,
  team: side = null,
}: {
  data: Dashboard;
  clientId: string;
  audience: "client" | "team";
  /** The page this sits on, with any query it needs (e.g. ?tab=performance). */
  basePath: string;
  range: Range;
  /** The team's extras: setup, Refresh now, review. Never for clients. */
  team?: TeamSide | null;
}) {
  const join = basePath.includes("?") ? "&" : "?";
  const team = audience === "team";
  const manage = team && !!side;
  const live = data.platforms.filter((p) => p.read);

  return (
    <div className="sh" data-tour="hub-dashboard">
      <div className="sh-head">
        <div>
          {data.startedOn && <p className="sh-updated">Counting our work from {dayLabel(data.startedOn)} {data.startedOn.slice(0, 4)}</p>}
        </div>
        <div className="sh-head-right">
          <nav className="sh-range" aria-label="Period">
            {RANGES.map((r) => (
              <Link key={r} href={`${basePath}${join}range=${r}`} aria-current={r === range ? "page" : undefined} scroll={false}>
                {r} days
              </Link>
            ))}
            <Link href={`${basePath}${join}range=since`} aria-current={range === "since" ? "page" : undefined} scroll={false}>
              Since we started
            </Link>
          </nav>
        </div>
      </div>

      {manage && side!.budget != null && side!.budget >= 0.8 && (
        <p className="sh-banner sh-banner-bad">
          {side!.budget >= 1
            ? "This month's AI budget is used up, so the daily update is paused. The CEO can raise it on the Finance tab."
            : `${Math.round(side!.budget * 100)}% of this month's AI budget is used. At 100% the daily update pauses until the budget is raised or the month ends.`}
        </p>
      )}

      {manage && (
        <>
          <AccountsSetup clientId={clientId} chosen={data.chosen} urls={data.urls} baselines={data.baselines} />
          <RefreshNow clientId={clientId} run={side!.lastRun} ready={side!.refreshReady} />
          <ReviewList items={side!.review} failedPosts={side!.failedPosts} />
        </>
      )}

      {data.problem && <p className="sh-banner sh-banner-bad">The results couldn&rsquo;t be loaded. {data.problem}</p>}

      {data.chosen.length === 0 ? (
        <Preview
          withAccounts
          title="Your results are on their way"
          body={
            team
              ? manage
                ? "Paste this client's profile links above. Their numbers are read every day at 5pm."
                : "The team adds the profile links that show here."
              : "Followers, likes, comments and your most popular videos will appear here as soon as we’ve linked the platforms we post on for you."
          }
        />
      ) : (
        <>
          <section className="sh-accounts">
            {data.platforms.map((p) => (
              <AccountCard key={p.platform} p={p} team={team} />
            ))}
          </section>

          {live.length === 0 ? (
            <Preview
              withAccounts={false}
              title="Numbers on their way"
              body={`Once ${data.chosen.map(platformLabel).join(data.chosen.length > 2 ? ", " : " and ")} ${
                data.chosen.length > 1 ? "have" : "has"
              } been read, followers, likes, comments and the best videos will show here. That happens every day at 5pm.`}
            />
          ) : (
            <>
              <section className="sh-tiles" aria-label={data.rangeLabel}>
                <Tile label="Total followers" value={compactNumber(data.totals.followers)} sub={<Growth value={data.totals.growth} />} />
                <Tile label="Likes" value={data.totals.likes == null ? "—" : compactNumber(data.totals.likes)} sub={data.totals.likes == null ? NA : data.rangeLabel} />
                <Tile
                  label="Comments"
                  value={data.totals.comments == null ? "—" : compactNumber(data.totals.comments)}
                  sub={data.totals.comments == null ? NA : data.totals.avgComments != null ? `${data.totals.avgComments.toFixed(1)} per post on average` : data.rangeLabel}
                />
                <Tile
                  label="Posts published"
                  value={data.totals.posts == null ? "—" : String(data.totals.posts)}
                  sub={data.totals.posts == null ? (data.totals.postsPending ? "Shows after a second daily reading" : NA) : data.rangeLabel}
                />
              </section>
              <p className="sh-updated sh-updated-under">{data.lastUpdated ? `Last updated: ${when(data.lastUpdated)}` : " "}</p>

              {data.mostCommented && (
                <section className="sh-section">
                  <h3>Most commented</h3>
                  <PostLine post={data.mostCommented} rank={1} />
                </section>
              )}

              <section className="sh-section">
                <h3>Recent posts</h3>
                <RecentPosts posts={data.recent} />
              </section>

              <section className="sh-section">
                <h3>Most popular videos</h3>
                {data.topVideos.length ? (
                  <div className="sh-lines">
                    {data.topVideos.map((p, i) => (
                      <PostLine key={p.id} post={p} rank={i + 1} />
                    ))}
                  </div>
                ) : (
                  <p className="sh-muted">No videos with view counts {data.rangeLabel} yet.</p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
