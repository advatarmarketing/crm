import "server-only";
import type { FetchedAccount, FetchedPost } from "./meta";
import { TokenProblem } from "./meta";

/**
 * TikTok Login Kit + Display API (v2).
 *
 * TikTok's access token lasts 24 hours and its refresh token a year, so
 * the sync refreshes before every run when the access token is close to
 * expiring, and saves whatever new pair TikTok hands back.
 */
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"];

const API = "https://open.tiktokapis.com/v2";

export function tiktokAuthorizeUrl(redirectUri: string, state: string): string {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY!.trim());
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  openId: string;
}

async function tokenCall(form: Record<string, string>): Promise<TikTokTokens> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!.trim(),
      client_secret: process.env.TIKTOK_CLIENT_SECRET!.trim(),
      ...form,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    open_id?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token || !body.refresh_token) {
    throw new TokenProblem(body.error_description || body.error || `TikTok returned ${res.status}.`);
  }
  const now = Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(now + (body.expires_in ?? 86400) * 1000).toISOString(),
    refreshExpiresAt: new Date(now + (body.refresh_expires_in ?? 31536000) * 1000).toISOString(),
    openId: body.open_id ?? "",
  };
}

export function tiktokExchangeCode(code: string, redirectUri: string) {
  return tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
}

export function tiktokRefresh(refreshToken: string) {
  return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
}

async function api<T>(path: string, token: string, init?: { body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  const code = body.error?.code;
  if (code && code !== "ok") {
    if (/access_token|scope/i.test(code)) throw new TokenProblem(body.error?.message || code);
    throw new Error(body.error?.message || code);
  }
  if (!res.ok) throw new Error(`TikTok returned ${res.status}.`);
  return body.data as T;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

type TtVideo = {
  id: string;
  create_time: number;
  cover_image_url?: string;
  share_url?: string;
  title?: string;
  video_description?: string;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
};

const VIDEO_FIELDS = "id,create_time,cover_image_url,share_url,title,video_description,like_count,comment_count,share_count,view_count";

/**
 * `wantedIds` are TikTok video ids the team has linked to a video. The
 * newest 40 are always read; any linked video older than that is asked
 * for by id, so its numbers keep updating however old it is.
 */
export async function tiktokData(token: string, wantedIds: string[] = []): Promise<{ account: FetchedAccount; posts: FetchedPost[] }> {
  const info = await api<{
    user?: {
      display_name?: string;
      username?: string;
      avatar_url?: string;
      follower_count?: number;
      following_count?: number;
      video_count?: number;
    };
  }>("/user/info/?fields=open_id,display_name,username,avatar_url,follower_count,following_count,likes_count,video_count", token);

  const posts: FetchedPost[] = [];
  const toPost = (v: TtVideo): FetchedPost => ({
    externalId: v.id,
    postedAt: new Date(v.create_time * 1000).toISOString(),
    caption: v.title || v.video_description || null,
    thumbnail: v.cover_image_url ?? null,
    permalink: v.share_url ?? null,
    isVideo: true,
    likes: num(v.like_count),
    comments: num(v.comment_count),
    views: num(v.view_count),
    shares: num(v.share_count),
  });
  let cursor: number | undefined;
  // Two pages of 20 — the newest 40 videos — is plenty for a 90-day view.
  for (let page = 0; page < 2; page++) {
    const list = await api<{ videos?: TtVideo[]; cursor?: number; has_more?: boolean }>(`/video/list/?fields=${VIDEO_FIELDS}`, token, {
      body: cursor ? { max_count: 20, cursor } : { max_count: 20 },
    });
    for (const v of list.videos ?? []) posts.push(toPost(v));
    if (!list.has_more || !list.cursor) break;
    cursor = list.cursor;
  }

  // Older linked videos, by id, 20 at a time (TikTok's limit).
  const have = new Set(posts.map((x) => x.externalId));
  const missing = Array.from(new Set(wantedIds)).filter((id) => !have.has(id));
  for (let i = 0; i < missing.length; i += 20) {
    const q = await api<{ videos?: TtVideo[] }>(`/video/query/?fields=${VIDEO_FIELDS}`, token, {
      body: { filters: { video_ids: missing.slice(i, i + 20) } },
    });
    for (const v of q.videos ?? []) posts.push(toPost(v));
  }

  const u = info.user ?? {};
  return {
    account: {
      name: u.display_name ?? null,
      handle: u.username ? `@${u.username}` : null,
      avatar: u.avatar_url ?? null,
      followers: num(u.follower_count),
      following: num(u.following_count),
      postsCount: num(u.video_count),
    },
    posts,
  };
}
