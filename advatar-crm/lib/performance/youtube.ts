/**
 * YouTube is the one platform that gives a video's public numbers to
 * anyone with a (free) API key, so those are fetched rather than
 * typed. Needs YOUTUBE_API_KEY in the environment.
 */

export const YOUTUBE_KEY_ENV = "YOUTUBE_API_KEY";

export const youtubeOn = () => Boolean(process.env[YOUTUBE_KEY_ENV]);

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, "");
    const ok = /^[A-Za-z0-9_-]{6,20}$/;
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return ok.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,20})/);
      const id = m ? m[1] : u.pathname === "/watch" ? u.searchParams.get("v") ?? "" : "";
      return ok.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface YoutubeNumbers {
  views: number | null;
  likes: number | null;
  comments: number | null;
}

/** Numbers for up to 50 videos per request, keyed by video id. Missing ids are private or deleted. */
export async function youtubeNumbers(ids: string[]): Promise<{ ok: true; byId: Map<string, YoutubeNumbers> } | { ok: false; error: string }> {
  const key = process.env[YOUTUBE_KEY_ENV];
  if (!key) return { ok: false, error: "YouTube isn’t connected. Add a YOUTUBE_API_KEY in Vercel’s settings." };
  const byId = new Map<string, YoutubeNumbers>();
  const unique = Array.from(new Set(ids));
  const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  try {
    for (let i = 0; i < unique.length; i += 50) {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "statistics");
      url.searchParams.set("id", unique.slice(i, i + 50).join(","));
      url.searchParams.set("key", key);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        return {
          ok: false,
          error: res.status === 400 || res.status === 403 ? "YouTube refused the YOUTUBE_API_KEY. Check it in Vercel’s settings." : `YouTube didn’t answer (${res.status}). Try again in a moment.`,
        };
      }
      const body = (await res.json()) as { items?: { id: string; statistics?: Record<string, unknown> }[] };
      for (const item of body.items ?? []) {
        byId.set(item.id, { views: num(item.statistics?.viewCount), likes: num(item.statistics?.likeCount), comments: num(item.statistics?.commentCount) });
      }
    }
  } catch {
    return { ok: false, error: "Couldn’t reach YouTube. Try again in a moment." };
  }
  return { ok: true, byId };
}
