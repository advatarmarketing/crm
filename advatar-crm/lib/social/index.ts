/**
 * The client results dashboard (Content Hub): shared names, colours and
 * row shapes. Safe to import anywhere — nothing secret lives here.
 *
 * Numbers only ever come from the public profiles the team linked, read
 * by lib/social/scan.ts (run by lib/social/sync.ts). Nothing here makes
 * a number up; where a profile has not given us something, the
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

/** A number of days, or "since": from the day we started posting for them. */
export type Range = RangeDays | "since";

export function parseRange(v: unknown): Range {
  if (v === "since") return "since";
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

/**
 * A profile link as the team typed it — a full URL, a bare
 * instagram.com/… address, or just @handle — tidied into a proper link.
 * Null if it can't be read as that platform's profile.
 */
export function profileUrl(platform: SocialPlatform, input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const host = { instagram: "instagram.com", facebook: "facebook.com", tiktok: "tiktok.com" }[platform];
  if (/^@?[A-Za-z0-9._-]{2,60}$/.test(raw) && !raw.includes("..")) {
    const name = raw.replace(/^@/, "");
    return platform === "tiktok" ? `https://www.tiktok.com/@${name}` : `https://www.${host}/${name}`;
  }
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const h = u.hostname.replace(/^(www|m|mobile|web)\./, "");
    if (h !== host && !(platform === "facebook" && h === "fb.com")) return null;
    u.hostname = `www.${host}`;
    u.hash = "";
    u.search = platform === "facebook" && u.pathname.startsWith("/profile.php") ? u.search : "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** The @handle in a profile link, for checking a connection is the right account. */
export function handleFromUrl(platform: SocialPlatform, url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const first = new URL(url).pathname.split("/").filter(Boolean)[0] ?? "";
    const name = first.replace(/^@/, "");
    if (!name || ["p", "reel", "reels", "profile.php", "pages", "people"].includes(name)) return null;
    if (platform === "tiktok" && !first.startsWith("@")) return null;
    return `@${name.toLowerCase()}`;
  } catch {
    return null;
  }
}

/** What the browser may know about a connection — never a token. */
/** clients.social_urls (0050): the profile link for each platform. */
export type SocialUrls = Partial<Record<SocialPlatform, string>>;

export interface SocialConnection {
  client_id: string;
  platform: SocialPlatform;
  account_name: string | null;
  account_handle: string | null;
  avatar_url: string | null;
  /** "lookup": public numbers read from the profile link (lib/social/scan.ts). "connected"/"needs_reconnect" are from the old logins. */
  status: "connected" | "needs_reconnect" | "lookup";
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
