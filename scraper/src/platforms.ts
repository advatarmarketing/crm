/**
 * What differs between the six platforms: tidying a profile link, where
 * the latest posts are listed, recognising a post link, and (where the
 * platform puts it in the post's id) the time a post was published.
 *
 * Post keys use the same "xx:id" form as the CRM (advatar-crm/lib/
 * social/match.ts) so a post link pasted on a video matches the post
 * the scraper read.
 */
export type Platform = "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "x";
export const PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube", "facebook", "linkedin", "x"];

export const LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
};

function url(input: string): URL | null {
  try {
    return new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
}

/** The page listing the latest posts, where that's not the profile itself. */
export function postsPage(platform: Platform, profile: string): string {
  if (platform === "youtube") return profile.replace(/\/(featured|videos|shorts|streams|about)\/?$/, "").replace(/\/$/, "") + "/videos";
  return profile;
}

const IG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** A post's key and tidy link, or null if the link isn't a post. */
export function postFromLink(platform: Platform, href: string, base: string, handle?: string | null): { key: string; url: string } | null {
  const u = url(new URL(href, base).toString());
  if (!u) return null;
  const host = u.hostname.replace(/^(www|m|mobile|web)\./, "");
  const path = u.pathname;

  if (platform === "instagram" && host === "instagram.com") {
    const m = path.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/);
    return m ? { key: `ig:${m[1]}`, url: `https://www.instagram.com/p/${m[1]}/` } : null;
  }
  if (platform === "tiktok" && host === "tiktok.com") {
    const m = path.match(/\/@([^/]+)\/(?:video|photo)\/(\d{8,})/);
    return m ? { key: `tt:${m[2]}`, url: `https://www.tiktok.com/@${m[1]}/video/${m[2]}` } : null;
  }
  if (platform === "youtube" && (host === "youtube.com" || host === "youtu.be")) {
    const id = u.searchParams.get("v") ?? path.match(/\/shorts\/([A-Za-z0-9_-]{6,})/)?.[1] ?? (host === "youtu.be" ? path.slice(1) : null);
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? { key: `yt:${id}`, url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (platform === "x" && (host === "x.com" || host === "twitter.com")) {
    const m = path.match(/^\/([^/]+)\/status\/(\d{6,})/);
    if (!m) return null;
    if (handle && m[1].toLowerCase() !== handle.toLowerCase()) return null;
    return { key: `x:${m[2]}`, url: `https://x.com/${m[1]}/status/${m[2]}` };
  }
  if (platform === "linkedin" && host === "linkedin.com") {
    const m = (path + u.search).match(/activity[:-](\d{10,})/);
    return m ? { key: `li:${m[1]}`, url: `https://www.linkedin.com/feed/update/urn:li:activity:${m[1]}/` } : null;
  }
  if (platform === "facebook" && (host === "facebook.com" || host === "fb.watch")) {
    const video = path.match(/\/(?:videos|reel|watch)\/(?:[^/]+\/)?(\d{6,})/) ?? (u.searchParams.get("v") ?? "").match(/^(\d{6,})$/);
    if (video) return { key: `fb:${video[1]}`, url: `https://www.facebook.com/reel/${video[1]}` };
    const story = (u.searchParams.get("story_fbid") ?? "").match(/^(pfbid\w+|\d{6,})$/);
    const post = path.match(/\/posts\/(pfbid\w+|\d{6,})/);
    const id = story?.[1] ?? post?.[1];
    if (!id) return null;
    u.hash = "";
    for (const k of Array.from(u.searchParams.keys())) if (k !== "story_fbid" && k !== "id") u.searchParams.delete(k);
    return { key: `fb:${id}`, url: u.toString() };
  }
  return null;
}

/** When the post was published, from its id, where the platform encodes it there. */
export function postedFromKey(key: string): Date | null {
  const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  try {
    if (kind === "tt") return new Date(Number(BigInt(id) >> 32n) * 1000);
    if (kind === "x") return new Date(Number((BigInt(id) >> 22n) + 1288834974657n));
    if (kind === "li") return new Date(Number(BigInt(id) >> 22n));
    if (kind === "ig") {
      if (id.length > 11) return null; // private-style long codes don't decode
      let n = 0n;
      for (const ch of id) {
        const v = IG_ALPHABET.indexOf(ch);
        if (v < 0) return null;
        n = n * 64n + BigInt(v);
      }
      return new Date(Number((n >> 23n) + 1314220021721n));
    }
  } catch {
    return null;
  }
  return null;
}

/** Sanity-check a decoded date: between 2005 and tomorrow. */
export function plausible(d: Date | null): Date | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getTime() > Date.UTC(2005, 0, 1) && d.getTime() < Date.now() + 86_400_000 ? d : null;
}

/** The handle in an X profile link, so other people's posts on the page aren't taken as theirs. */
export function xHandle(profile: string): string | null {
  const u = url(profile);
  return u ? u.pathname.split("/").filter(Boolean)[0] ?? null : null;
}
