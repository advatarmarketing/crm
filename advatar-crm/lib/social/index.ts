/**
 * The client results dashboard (Content Hub): shared names, colours and
 * row shapes. Safe to import anywhere — nothing secret lives here.
 *
 * Numbers only ever come from the platforms' own APIs (lib/social/
 * meta.ts and tiktok.ts, run by lib/social/sync.ts). Nothing here makes
 * a number up; where a platform has not given us something, the
 * dashboard says so instead of showing a zero.
 */
export type SocialPlatform = "instagram" | "facebook" | "tiktok";

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; rgb: string; provider: "meta" | "tiktok" }[] = [
  { id: "instagram", label: "Instagram", rgb: "214, 41, 118", provider: "meta" },
  { id: "facebook", label: "Facebook", rgb: "24, 119, 242", provider: "meta" },
  { id: "tiktok", label: "TikTok", rgb: "37, 244, 238", provider: "tiktok" },
];

export function isSocialPlatform(v: unknown): v is SocialPlatform {
  return v === "instagram" || v === "facebook" || v === "tiktok";
}

export function platformLabel(p: SocialPlatform): string {
  return SOCIAL_PLATFORMS.find((x) => x.id === p)?.label ?? p;
}

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export function parseRange(v: unknown): RangeDays {
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

/** What the browser may know about a connection — never a token. */
export interface SocialConnection {
  client_id: string;
  platform: SocialPlatform;
  account_name: string | null;
  account_handle: string | null;
  avatar_url: string | null;
  status: "connected" | "needs_reconnect";
  connected_at: string;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface SocialSnapshot {
  platform: SocialPlatform;
  day: string;
  followers: number | null;
  posts_count: number | null;
}

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  external_id: string;
  posted_at: string;
  caption: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  is_video: boolean;
  likes: number | null;
  comments: number | null;
  views: number | null;
  shares: number | null;
}

export function compactNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
