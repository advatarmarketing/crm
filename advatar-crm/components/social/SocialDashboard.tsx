import Link from "next/link";
import { Sparkline } from "@/components/Sparkline";
import type { Dashboard, PlatformResult } from "@/lib/social/dashboard";
import { RANGES, SOCIAL_PLATFORMS, compactNumber, platformLabel, type Range, type SocialPost } from "@/lib/social";
import { AccountsSetup, DisconnectButton, MetaPagePicker, RecentPosts, SyncNowButton } from "./SocialControls";

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

function AccountCard({
  p,
  clientId,
  returnPath,
  canConnect,
  team = false,
}: {
  p: PlatformResult;
  clientId: string;
  returnPath: string;
  canConnect: boolean;
  /** The mismatch warning is for the team, not the client. */
  team?: boolean;
}) {
  const meta = SOCIAL_PLATFORMS.find((x) => x.id === p.platform)!;
  const provider = meta.provider;
  const connectHref = `/api/social/connect/${provider}?client=${clientId}&return=${encodeURIComponent(returnPath)}`;
  const c = p.connection;
  const needsReconnect = c?.status === "needs_reconnect";
  const lookup = c?.status === "lookup";

  return (
    <div className="sh-account" style={{ ["--pc" as string]: meta.rgb }} data-state={c ? (needsReconnect ? "warn" : "on") : "off"}>
      <div className="sh-account-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c?.avatar_url ? <img className="sh-avatar" src={c.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span className="sh-avatar sh-avatar-blank"><span className="sh-dot" /></span>}
        <span className="sh-account-name">
          <strong>{meta.label}</strong>
          <small>{c ? c.account_handle || c.account_name || "Connected" : "Not connected yet"}</small>
        </span>
        {p.url && (
          <a className="sh-profile" href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open the ${meta.label} profile`}>
            Profile ↗
          </a>
        )}
      </div>
      {p.mismatch && team && (
        <p className="sh-banner sh-banner-bad sh-mismatch">
          This is connected to {c?.account_handle}, but the profile link is a different account. Disconnect and connect the right one.
        </p>
      )}

      {c && !needsReconnect ? (
        <>
          <div className="sh-account-stat">
            <span className="sh-big">{compactNumber(p.followers)}</span>
            <span className="sh-muted">followers</span>
          </div>
          <div className="sh-account-trend">
            <Growth value={p.growth} since={p.growthSince} />
            {p.series.length > 1 && <Sparkline values={p.series.map((s) => s.followers)} color={`rgb(${meta.rgb})`} width={140} height={34} />}
          </div>
          <dl className="sh-account-dl">
            <div><dt>Likes</dt><dd>{compactNumber(p.likes)}</dd></div>
            <div><dt>Comments</dt><dd>{compactNumber(p.comments)}</dd></div>
            <div><dt>Posts</dt><dd>{p.posts}</dd></div>
          </dl>
          <div className="sh-account-foot">
            <span className="sh-muted">{c.last_synced_at ? `Updated ${when(c.last_synced_at)}` : "Waiting for first update"}</span>
            {canConnect && !lookup && <DisconnectButton clientId={clientId} platform={p.platform} />}
          </div>
          {lookup && (
            <div className="sh-lookup">
              <span>From their public profile. Views need their own account connected.</span>
              {p.available && canConnect && (
                <a className="sh-link" href={connectHref}>
                  Connect {meta.label}
                </a>
              )}
            </div>
          )}
          {lookup && team && c?.last_error && <p className="sh-banner sh-banner-bad sh-mismatch">{c.last_error}</p>}
        </>
      ) : (
        <div className="sh-account-empty">
          <p>
            {needsReconnect
              ? `${meta.label} stopped letting us read this account (a password change or removed access usually does this). Connect it again to carry on.`
              : p.available
                ? `Connect ${meta.label} to see followers, likes, comments and views here.`
                : `${meta.label} isn't switched on yet. We're setting this up.`}
          </p>
          {p.available && canConnect && (
            <a className="btn btn-primary" href={connectHref}>
              {needsReconnect ? "Reconnect" : `Connect ${meta.label}`}
            </a>
          )}
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
 * The client results dashboard: Facebook, Instagram and TikTok, from
 * their own APIs. Used on the client's Content Hub and on the team's
 * view of a client (Performance tab), so both see the same numbers.
 */
export function SocialDashboard({
  data,
  clientId,
  audience,
  basePath,
  range,
  notice,
  picker,
  canConnect = true,
  agency = null,
}: {
  data: Dashboard;
  clientId: string;
  audience: "client" | "team";
  /** The page this sits on, with any query it needs (e.g. ?tab=performance). */
  basePath: string;
  range: Range;
  notice?: { error?: string | null; connected?: string | null };
  picker?: { pendingId: string; options: { pageId: string; pageName: string; igUsername: string | null; pagePicture: string | null }[] } | null;
  /** The client, or management on this client. Others see the numbers only. */
  canConnect?: boolean;
  /** Advatar's own Instagram status, for the CEO (0051). */
  agency?: { available: boolean; username: string | null; lastError: string | null; canConnect: boolean } | null;
}) {
  const join = basePath.includes("?") ? "&" : "?";
  const returnPath = `${basePath}${join}range=${range}`;
  const team = audience === "team";
  const manage = team && canConnect;
  const live = data.platforms.filter((p) => p.connection && (p.connection.status === "connected" || p.connection.status === "lookup"));

  return (
    <div className="sh" data-tour="hub-dashboard">
      <div className="sh-head">
        <div>
          <p className="sh-updated">
            {data.lastUpdated ? `Last updated ${when(data.lastUpdated)}` : live.length ? "Waiting for the first update" : " "}
          </p>
          {data.startedOn && (
            <p className="sh-updated">Counting our work from {dayLabel(data.startedOn)} {data.startedOn.slice(0, 4)}</p>
          )}
        </div>
        <div className="sh-head-right">
          {manage && live.length > 0 && <SyncNowButton clientId={clientId} />}
          <nav className="sh-range" aria-label="Period">
            {RANGES.map((r) => (
              <Link key={r} href={`${basePath}${join}range=${r}`} aria-current={r === range ? "page" : undefined} scroll={false}>
                {r} days
              </Link>
            ))}
            {data.startedOn && (
              <Link href={`${basePath}${join}range=since`} aria-current={range === "since" ? "page" : undefined} scroll={false}>
                Since we started
              </Link>
            )}
          </nav>
        </div>
      </div>

      {notice?.error && <p className="sh-banner sh-banner-bad">{notice.error}</p>}
      {notice?.connected && !notice.error && (
        <p className="sh-banner sh-banner-good">
          {notice.connected === "agency"
            ? "Advatar’s Instagram connected. Clients’ Instagram numbers now come in from their profile links, every day."
            : `${notice.connected === "tiktok" ? "TikTok" : "Facebook and Instagram"} connected. Numbers refresh automatically every day.`}
        </p>
      )}
      {picker && <MetaPagePicker pendingId={picker.pendingId} options={picker.options} />}

      {manage && <AccountsSetup clientId={clientId} chosen={data.chosen} urls={data.urls} startedOn={data.startedOn} agency={agency} returnPath={returnPath} />}

      {data.problem && <p className="sh-banner sh-banner-bad">The results couldn&rsquo;t be loaded. {data.problem}</p>}

      {data.chosen.length === 0 ? (
        <Preview
          withAccounts
          title="Your results are on their way"
          body={
            team
              ? manage
                ? "Choose the platforms this client posts on above. Only those show on their dashboard."
                : "The CEO or this client's manager chooses which platforms show here."
              : "Followers, likes, comments and your most popular videos will appear here as soon as we’ve linked the platforms we post on for you."
          }
        />
      ) : (
        <>
          <section className="sh-accounts">
            {data.platforms.map((p) => (
              <AccountCard key={p.platform} p={p} clientId={clientId} returnPath={returnPath} canConnect={canConnect} team={team} />
            ))}
          </section>

          {live.length === 0 ? (
            <Preview
              withAccounts={false}
              title="Not connected yet"
              body={`Once ${data.chosen.map(platformLabel).join(data.chosen.length > 2 ? ", " : " and ")} ${
                data.chosen.length > 1 ? "are" : "is"
              } connected, your followers, likes, comments and best videos will show here.`}
            />
          ) : (
            <>
              <section className="sh-tiles" aria-label={data.rangeLabel}>
                <Tile label="Total followers" value={compactNumber(data.totals.followers)} sub={<Growth value={data.totals.growth} />} />
                <Tile label="Likes" value={compactNumber(data.totals.likes)} sub={data.rangeLabel} />
                <Tile
                  label="Comments"
                  value={compactNumber(data.totals.comments)}
                  sub={data.totals.avgComments != null ? `${data.totals.avgComments.toFixed(1)} per post on average` : undefined}
                />
                <Tile label="Posts published" value={String(data.totals.posts)} sub={data.rangeLabel} />
              </section>

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
