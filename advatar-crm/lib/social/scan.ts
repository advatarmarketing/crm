import "server-only";
import { handleFromUrl, type SocialPlatform } from "@/lib/social";
import { postKey, socialKeys, type MatchPlatform } from "./match";

/**
 * Reading public Instagram, TikTok and Facebook numbers from a profile
 * link, through ScrapeCreators (scrapecreators.com). No Meta or TikTok
 * app, no logins: the team pastes a client's profile link on the
 * Performance tab and this reads what anyone could see on that profile.
 *
 * One request is one credit. A profile costs its own request plus one
 * per page of posts (Instagram gives 12 a page, TikTok and Facebook
 * fewer or more), so the daily refresh only goes back 30 days and the
 * first read goes back to the day we started (at most 90 days).
 *
 * Response shapes are ScrapeCreators' own (their published API config,
 * @scrapecreators/cli api-config). Every field is read defensively:
 * where a number isn't there, it's null, never a made-up zero.
 */

// Overridable only so tests can point it at a stand-in.
const BASE = process.env.SCRAPECREATORS_BASE_URL?.trim() || "https://api.scrapecreators.com";

export function scanConfigured(): boolean {
  return !!process.env.SCRAPECREATORS_API_KEY?.trim();
}

export interface FetchedAccount {
  name: string | null;
  handle: string | null;
  avatar: string | null;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
}

export interface FetchedPost {
  externalId: string;
  postedAt: string;
  caption: string | null;
  thumbnail: string | null;
  permalink: string | null;
  isVideo: boolean;
  likes: number | null;
  comments: number | null;
  views: number | null;
  shares: number | null;
}

export interface Fetched {
  account: FetchedAccount;
  posts: FetchedPost[];
}

/** A problem worth showing the team as it is. */
export class ScanProblem extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const iso = (seconds: unknown): string | null => {
  const s = num(seconds);
  return s ? new Date(s * 1000).toISOString() : null;
};

/** One request. Throws a ScanProblem with a sentence the team can act on. */
async function call(path: string, params: Record<string, string | undefined>): Promise<Json> {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) throw new ScanProblem("Profile scanning isn't switched on yet: SCRAPECREATORS_API_KEY isn't set in Vercel.");
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, { headers: { "x-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(50_000) });
  } catch {
    throw new ScanProblem("The scanning service didn't answer in time. It will try again tomorrow, or press Refresh now.");
  }
  const body: Json = await res.json().catch(() => null);
  const said = str(body?.message) ?? str(body?.error) ?? "";

  if (res.status === 401 || (res.status === 403 && /key|auth/i.test(said))) {
    throw new ScanProblem("The scanning service turned down the API key. Check SCRAPECREATORS_API_KEY in Vercel.");
  }
  if (res.status === 402 || (!res.ok && /credit/i.test(said))) {
    throw new ScanProblem("The scanning service is out of credits. Top up at scrapecreators.com and press Refresh now.");
  }
  if (body?.age_restricted) throw new ScanProblem("This profile is age-restricted, so its numbers can't be read.");
  if (/private/i.test(said)) throw new ScanProblem("This account is private, so its numbers can't be read. It needs to be public.");
  if (res.status === 404 || body?.error === "not_found" || /doesn.?t exist|not found|unavailable|restricted/i.test(said)) {
    throw new ScanProblem("That profile couldn't be found. Check the link is right and the account is public.");
  }
  if (!res.ok || body?.success === false) {
    throw new ScanProblem(`The scanning service couldn't read this just now${said ? ` (${said.slice(0, 120)})` : ""}. It will try again tomorrow.`);
  }
  return body;
}

/** How far back to read, and how many pages at most. */
export interface Depth {
  since: Date;
  maxPages: number;
}

/** Links on videos, by key, with the link itself (for one-off reads). */
export type Wanted = { key: string; url: string }[];

const SINGLE_POST_LIMIT = 10;

// ---------------------------------------------------------------- Instagram

function igPost(it: Json): FetchedPost | null {
  const code = str(it?.code);
  const at = iso(it?.taken_at);
  if (!code || !at) return null;
  const video = it?.media_type === 2 || it?.product_type === "clips";
  const thumb =
    str(it?.image_versions2?.candidates?.[0]?.url) ?? str(it?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url) ?? str(it?.display_uri);
  return {
    externalId: code,
    postedAt: at,
    caption: str(it?.caption?.text),
    thumbnail: thumb,
    permalink: `https://www.instagram.com/${video ? "reel" : "p"}/${code}/`,
    isVideo: video,
    likes: num(it?.like_count),
    comments: num(it?.comment_count),
    views: video ? num(it?.play_count) ?? num(it?.ig_play_count) ?? num(it?.view_count) : null,
    shares: num(it?.reshare_count),
  };
}

async function igSingle(code: string): Promise<FetchedPost | null> {
  const body = await call("/v1/instagram/post", { url: `https://www.instagram.com/p/${code}/` });
  const m = body?.data?.xdt_shortcode_media;
  const at = iso(m?.taken_at_timestamp);
  if (!m || !at) return null;
  const video = !!m.is_video || m.product_type === "clips";
  return {
    externalId: str(m.shortcode) ?? code,
    postedAt: at,
    caption: str(m.edge_media_to_caption?.edges?.[0]?.node?.text),
    thumbnail: str(m.thumbnail_src) ?? str(m.display_url),
    permalink: `https://www.instagram.com/${video ? "reel" : "p"}/${code}/`,
    isVideo: video,
    likes: num(m.edge_media_preview_like?.count) ?? num(m.edge_liked_by?.count),
    comments: num(m.edge_media_to_parent_comment?.count) ?? num(m.edge_media_to_comment?.count),
    views: video ? num(m.video_play_count) ?? num(m.video_view_count) : null,
    shares: null,
  };
}

async function instagram(handle: string, depth: Depth, wanted: Wanted): Promise<Fetched> {
  const body = await call("/v1/instagram/profile", { handle });
  const u = body?.data?.user;
  if (!u) throw new ScanProblem("That Instagram profile couldn't be found. Check the link.");
  if (u.is_private) throw new ScanProblem("This Instagram account is private, so its numbers can't be read. It needs to be public.");

  const account: FetchedAccount = {
    name: str(u.full_name),
    handle: u.username ? `@${String(u.username).toLowerCase()}` : `@${handle}`,
    avatar: str(u.profile_pic_url_hd) ?? str(u.profile_pic_url),
    followers: num(u.edge_followed_by?.count),
    following: num(u.edge_follow?.count),
    postsCount: num(u.media_count) ?? num(u.edge_owner_to_timeline_media?.count),
  };

  const posts = new Map<string, FetchedPost>();
  let cursor: string | undefined;
  for (let page = 0; page < depth.maxPages; page++) {
    const res = await call("/v2/instagram/user/posts", { handle, next_max_id: cursor });
    const items: Json[] = Array.isArray(res?.items) ? res.items : [];
    for (const it of items) {
      const p = igPost(it);
      if (p) posts.set(p.externalId, p);
    }
    // Pinned posts come first and can be old, so judge by the last one.
    const last = items.length ? iso(items[items.length - 1]?.taken_at) : null;
    cursor = str(res?.next_max_id) ?? undefined;
    if (!res?.more_available || !cursor || !last || new Date(last) < depth.since) break;
  }

  for (const w of wanted.filter((w) => !posts.has(w.key.slice(3))).slice(0, SINGLE_POST_LIMIT)) {
    try {
      const p = await igSingle(w.key.slice(3));
      if (p) posts.set(p.externalId, p);
    } catch {
      // That one post can wait for tomorrow.
    }
  }
  return { account, posts: Array.from(posts.values()) };
}

// ---------------------------------------------------------------- TikTok

function ttPost(v: Json, handle: string): FetchedPost | null {
  const id = str(v?.aweme_id) ?? (typeof v?.aweme_id === "number" ? String(v.aweme_id) : null);
  const at = iso(v?.create_time);
  if (!id || !at) return null;
  const s = v?.statistics ?? {};
  const who = str(v?.author?.unique_id) ?? handle;
  return {
    externalId: id,
    postedAt: at,
    caption: str(v?.desc),
    thumbnail: str(v?.video?.cover?.url_list?.[0]) ?? str(v?.video?.origin_cover?.url_list?.[0]),
    permalink: `https://www.tiktok.com/@${who}/video/${id}`,
    isVideo: true,
    likes: num(s.digg_count),
    comments: num(s.comment_count),
    views: num(s.play_count),
    shares: num(s.share_count),
  };
}

async function tiktok(handle: string, depth: Depth, wanted: Wanted): Promise<Fetched> {
  const body = await call("/v1/tiktok/profile", { handle });
  const u = body?.user;
  const stats = body?.stats ?? body?.statsV2 ?? {};
  if (!u) throw new ScanProblem("That TikTok profile couldn't be found. Check the link.");
  if (u.privateAccount || u.secret) throw new ScanProblem("This TikTok account is private, so its numbers can't be read. It needs to be public.");

  const account: FetchedAccount = {
    name: str(u.nickname),
    handle: u.uniqueId ? `@${String(u.uniqueId).toLowerCase()}` : `@${handle}`,
    avatar: str(u.avatarMedium) ?? str(u.avatarThumb),
    followers: num(stats.followerCount),
    following: num(stats.followingCount),
    postsCount: num(stats.videoCount),
  };

  const posts = new Map<string, FetchedPost>();
  let cursor: string | undefined;
  for (let page = 0; page < depth.maxPages; page++) {
    const res = await call("/v3/tiktok/profile/videos", { handle, sort_by: "latest", max_cursor: cursor });
    const items: Json[] = Array.isArray(res?.aweme_list) ? res.aweme_list : [];
    for (const v of items) {
      const p = ttPost(v, handle);
      if (p) posts.set(p.externalId, p);
    }
    const last = items.length ? iso(items[items.length - 1]?.create_time) : null;
    cursor = res?.max_cursor != null ? String(res.max_cursor) : undefined;
    if (!res?.has_more || !cursor || !last || new Date(last) < depth.since) break;
  }

  for (const w of wanted.filter((w) => !posts.has(w.key.slice(3))).slice(0, SINGLE_POST_LIMIT)) {
    try {
      const res = await call("/v2/tiktok/video", { url: `https://www.tiktok.com/@${handle}/video/${w.key.slice(3)}` });
      const p = ttPost(res?.aweme_detail, handle);
      if (p) posts.set(p.externalId, p);
    } catch {
      // Tomorrow.
    }
  }
  return { account, posts: Array.from(posts.values()) };
}

// ---------------------------------------------------------------- Facebook

async function fbSingle(link: string): Promise<FetchedPost | null> {
  const b = await call("/v1/facebook/post", { url: link });
  const id = str(b?.post_id) ?? str(b?.video?.id);
  const at = str(b?.creation_time);
  if (!id || !at) return null;
  return {
    externalId: id,
    postedAt: new Date(at).toISOString(),
    caption: str(b?.description),
    thumbnail: str(b?.video?.thumbnail) ?? str(b?.image_url),
    // The link as it was pasted, so it matches the video it came from.
    permalink: link,
    isVideo: !!b?.video,
    likes: num(b?.like_count),
    comments: num(b?.comment_count),
    views: num(b?.view_count),
    shares: num(b?.share_count),
  };
}

async function facebook(pageUrl: string, depth: Depth, wanted: Wanted): Promise<Fetched> {
  const b = await call("/v1/facebook/profile", { url: pageUrl });
  if (!b || (!b.name && !b.id)) throw new ScanProblem("That Facebook Page couldn't be found. Check the link.");

  const account: FetchedAccount = {
    name: str(b.name),
    handle: handleFromUrl("facebook", pageUrl) ?? str(b.name),
    avatar: str(b.profilePicLarge) ?? str(b.profilePicMedium) ?? str(b.profilePicSmall),
    followers: num(b.followerCount) ?? num(b.likeCount),
    following: null,
    postsCount: null,
  };

  const posts = new Map<string, FetchedPost>();
  let cursor: string | undefined;
  for (let page = 0; page < depth.maxPages; page++) {
    const res = await call("/v1/facebook/profile/posts", { url: pageUrl, cursor });
    const items: Json[] = Array.isArray(res?.posts) ? res.posts : [];
    for (const it of items) {
      const id = str(it?.id) ?? str(it?.post_id);
      const at = iso(it?.publishTime);
      if (!id || !at) continue;
      posts.set(id, {
        externalId: id,
        postedAt: at,
        caption: str(it?.text),
        thumbnail: str(it?.videoDetails?.thumbnailUrl) ?? str(it?.image?.uri) ?? str(it?.imageUrl),
        permalink: str(it?.permalink) ?? str(it?.url),
        isVideo: !!it?.videoDetails,
        likes: num(it?.reactionCount),
        comments: num(it?.commentCount),
        views: num(it?.videoViewCount),
        shares: num(it?.shareCount),
      });
    }
    const last = items.length ? iso(items[items.length - 1]?.publishTime) : null;
    cursor = str(res?.cursor) ?? undefined;
    if (!cursor || !last || new Date(last) < depth.since) break;
  }

  // Reels carry the view counts that the posts list often leaves out.
  try {
    const res = await call("/v1/facebook/profile/reels", { url: pageUrl });
    const byKey = new Map<string, FetchedPost>();
    for (const p of Array.from(posts.values())) {
      const k = postKey("facebook", p.permalink);
      if (k) byKey.set(k, p);
    }
    for (const r of (Array.isArray(res?.reels) ? res.reels : []) as Json[]) {
      const views = num(r?.view_count);
      const videoId = str(r?.video_id);
      const at = str(r?.creation_time);
      const known = videoId ? byKey.get(`fb:${videoId}`) : undefined;
      if (known) {
        if (known.views == null) known.views = views;
        continue;
      }
      const id = str(r?.post_id) ?? videoId;
      if (!id || !at || new Date(at) < depth.since) continue;
      posts.set(id, {
        externalId: id,
        postedAt: new Date(at).toISOString(),
        caption: str(r?.description),
        thumbnail: str(r?.thumbnail),
        permalink: str(r?.url),
        isVideo: true,
        likes: null,
        comments: null,
        views,
        shares: null,
      });
    }
  } catch {
    // Posts without reels' views is still worth saving.
  }

  const have = new Set<string>();
  for (const p of Array.from(posts.values())) {
    const k = postKey("facebook", p.permalink);
    if (k) have.add(k);
    have.add(`fb:${p.externalId.split("_").pop()}`);
  }
  for (const w of wanted.filter((w) => !have.has(w.key)).slice(0, SINGLE_POST_LIMIT)) {
    try {
      const p = await fbSingle(w.url);
      if (p) posts.set(p.externalId, p);
    } catch {
      // Tomorrow.
    }
  }
  return { account, posts: Array.from(posts.values()) };
}

// ---------------------------------------------------------------- entry points

/** One profile, read in full: the account's numbers and its recent posts. */
export async function scanProfile(platform: SocialPlatform, profileLink: string, depth: Depth, wanted: Wanted = []): Promise<Fetched> {
  let got: Fetched;
  if (platform === "facebook") got = await facebook(profileLink, depth, wanted);
  else {
    const handle = handleFromUrl(platform, profileLink)?.slice(1);
    if (!handle) throw new ScanProblem(`That doesn't look like a ${platform === "tiktok" ? "TikTok" : "Instagram"} profile link.`);
    got = platform === "tiktok" ? await tiktok(handle, depth, wanted) : await instagram(handle, depth, wanted);
  }
  // A page can run past the window (and pinned posts can be old): keep
  // only posts inside it, plus any linked on a video.
  const keep = new Set(wanted.map((w) => w.key));
  return {
    account: got.account,
    posts: got.posts.filter((p) => new Date(p.postedAt) >= depth.since || socialKeys(platform, p.externalId, p.permalink).some((k) => keep.has(k)) || (platform === "instagram" && keep.has(`ig:${p.externalId}`))),
  };
}

/** Single posts only, for links on videos when there's no profile link for that platform. */
export async function scanPosts(platform: MatchPlatform, wanted: Wanted): Promise<FetchedPost[]> {
  const out: FetchedPost[] = [];
  for (const w of wanted.slice(0, SINGLE_POST_LIMIT)) {
    try {
      let p: FetchedPost | null = null;
      if (platform === "instagram") p = await igSingle(w.key.slice(3));
      else if (platform === "facebook") p = await fbSingle(w.url);
      else {
        const res = await call("/v2/tiktok/video", { url: w.url });
        p = ttPost(res?.aweme_detail, "");
      }
      if (p) out.push(p);
    } catch (e) {
      // A dead key or no credits stops the lot; anything else is one post.
      if (e instanceof ScanProblem && /API key|credits|switched on/.test(e.message)) throw e;
    }
  }
  return out;
}
