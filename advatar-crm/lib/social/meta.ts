import "server-only";
import { GRAPH } from "./config";

/**
 * Meta Graph API: Facebook Pages and the Instagram professional
 * account linked to a Page.
 *
 * How access works: the person signs in with Facebook and approves the
 * permissions below; we swap the short code for a long-lived user
 * token and, from it, the Page's own token. A Page token made from a
 * long-lived user token does not expire, so there is nothing to
 * refresh on a timer — if it stops working (password changed, access
 * removed) the sync marks the account "needs reconnecting".
 */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
];

export class TokenProblem extends Error {}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; type?: string } } & T;
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    // 190: the token is no good any more. 10/200-299: permission removed.
    if (e.code === 190 || e.code === 10 || (e.code && e.code >= 200 && e.code < 300) || e.type === "OAuthException") {
      throw new TokenProblem(e.message ?? "Facebook no longer accepts this connection.");
    }
    throw new Error(e.message ?? `Facebook returned ${res.status}.`);
  }
  return body;
}

export function metaAuthorizeUrl(redirectUri: string, state: string): string {
  const v = GRAPH.split("/").pop();
  const url = new URL(`https://www.facebook.com/${v}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID!.trim());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  // A "Business" type app signs in with a saved Facebook Login for
  // Business configuration (which lists the permissions) rather than
  // a list of scopes. Either works; the configuration wins when set.
  const configId = process.env.META_LOGIN_CONFIG_ID?.trim();
  if (configId) url.searchParams.set("config_id", configId);
  else url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

export async function metaExchangeCode(code: string, redirectUri: string): Promise<string> {
  const short = await graph<{ access_token: string }>("/oauth/access_token", {
    client_id: process.env.META_APP_ID!.trim(),
    client_secret: process.env.META_APP_SECRET!.trim(),
    redirect_uri: redirectUri,
    code,
  });
  const long = await graph<{ access_token: string }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!.trim(),
    client_secret: process.env.META_APP_SECRET!.trim(),
    fb_exchange_token: short.access_token,
  });
  return long.access_token;
}

export interface MetaPageOption {
  pageId: string;
  pageName: string;
  pageToken: string;
  pagePicture: string | null;
  igId: string | null;
  igUsername: string | null;
  igPicture: string | null;
}

export async function metaPages(userToken: string): Promise<MetaPageOption[]> {
  const res = await graph<{
    data: {
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
      instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
    }[];
  }>("/me/accounts", {
    access_token: userToken,
    fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
    limit: "100",
  });
  return (res.data ?? []).map((p) => ({
    pageId: p.id,
    pageName: p.name,
    pageToken: p.access_token,
    pagePicture: p.picture?.data?.url ?? null,
    igId: p.instagram_business_account?.id ?? null,
    igUsername: p.instagram_business_account?.username ?? null,
    igPicture: p.instagram_business_account?.profile_picture_url ?? null,
  }));
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

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A single insight, or null if Meta doesn't offer it for this post. */
async function insight(id: string, token: string, metrics: string[]): Promise<number | null> {
  for (const metric of metrics) {
    try {
      const res = await graph<{ data?: { values?: { value?: number }[]; total_value?: { value?: number } }[] }>(
        `/${id}/insights`,
        { access_token: token, metric }
      );
      const row = res.data?.[0];
      const value = num(row?.total_value?.value) ?? num(row?.values?.[0]?.value);
      if (value != null) return value;
    } catch {
      // Not offered for this post type, or under this API version: try
      // the next name. A dead token is caught by the account call.
    }
  }
  return null;
}

export async function instagramData(igId: string, token: string): Promise<{ account: FetchedAccount; posts: FetchedPost[] }> {
  const a = await graph<{ username?: string; name?: string; followers_count?: number; follows_count?: number; media_count?: number; profile_picture_url?: string }>(
    `/${igId}`,
    { access_token: token, fields: "username,name,followers_count,follows_count,media_count,profile_picture_url" }
  );
  const media = await graph<{
    data: {
      id: string;
      caption?: string;
      media_type?: string;
      media_product_type?: string;
      thumbnail_url?: string;
      media_url?: string;
      permalink?: string;
      timestamp: string;
      like_count?: number;
      comments_count?: number;
    }[];
  }>(`/${igId}/media`, {
    access_token: token,
    fields: "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count",
    limit: "50",
  });

  const posts: FetchedPost[] = [];
  for (const [i, m] of (media.data ?? []).entries()) {
    const isVideo = m.media_type === "VIDEO" || m.media_product_type === "REELS";
    posts.push({
      externalId: m.id,
      postedAt: m.timestamp,
      caption: m.caption ?? null,
      thumbnail: m.thumbnail_url ?? (m.media_type === "VIDEO" ? null : m.media_url ?? null),
      permalink: m.permalink ?? null,
      isVideo,
      likes: num(m.like_count),
      comments: num(m.comments_count),
      // Views cost one call per post; the newest 25 are what the
      // dashboard ranks, which keeps a daily sync well inside limits.
      views: i < 25 ? await insight(m.id, token, ["views", "plays", "video_views"]) : null,
      shares: null,
    });
  }

  return {
    account: {
      name: a.name ?? a.username ?? null,
      handle: a.username ? `@${a.username}` : null,
      avatar: a.profile_picture_url ?? null,
      followers: num(a.followers_count),
      following: num(a.follows_count),
      postsCount: num(a.media_count),
    },
    posts,
  };
}

export async function facebookData(pageId: string, token: string): Promise<{ account: FetchedAccount; posts: FetchedPost[] }> {
  const a = await graph<{ name?: string; username?: string; followers_count?: number; fan_count?: number; picture?: { data?: { url?: string } } }>(
    `/${pageId}`,
    { access_token: token, fields: "name,username,followers_count,fan_count,picture{url}" }
  );
  const feed = await graph<{
    data: {
      id: string;
      created_time: string;
      message?: string;
      permalink_url?: string;
      full_picture?: string;
      attachments?: { data?: { media_type?: string }[] };
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    }[];
  }>(`/${pageId}/posts`, {
    access_token: token,
    fields:
      "id,created_time,message,permalink_url,full_picture,attachments{media_type},reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares",
    limit: "50",
  });

  const posts: FetchedPost[] = [];
  for (const [i, p] of (feed.data ?? []).entries()) {
    const type = p.attachments?.data?.[0]?.media_type ?? "";
    const isVideo = /video|reel/i.test(type);
    posts.push({
      externalId: p.id,
      postedAt: p.created_time,
      caption: p.message ?? null,
      thumbnail: p.full_picture ?? null,
      permalink: p.permalink_url ?? null,
      isVideo,
      likes: num(p.reactions?.summary?.total_count),
      comments: num(p.comments?.summary?.total_count),
      views: isVideo && i < 25 ? await insight(p.id, token, ["post_media_view", "post_video_views"]) : null,
      shares: num(p.shares?.count) ?? 0,
    });
  }

  return {
    account: {
      name: a.name ?? null,
      handle: a.username ? `@${a.username}` : null,
      avatar: a.picture?.data?.url ?? null,
      followers: num(a.followers_count) ?? num(a.fan_count),
      following: null,
      postsCount: null,
    },
    posts,
  };
}
