/**
 * Recognising the same post from two directions: the link the team
 * pasted on a video ("where it's posted"), and what Instagram, TikTok or
 * Facebook report from the connected account. Matching the two is what
 * lets a video's numbers fill themselves in every day.
 *
 * The key is the platform's own id for the post where a link carries one:
 *   Instagram  the shortcode in /p/…, /reel/…, /reels/… or /tv/…
 *   TikTok     the number in /video/…
 *   Facebook   the id in /videos/…, /reel/…, story_fbid=… or the
 *              pfbid… token in /posts/…; otherwise the tidied link.
 */
export type MatchPlatform = "instagram" | "tiktok" | "facebook";

function tidy(url: string): URL | null {
  try {
    const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
    u.hostname = u.hostname.replace(/^(www|m|mobile|web)\./, "");
    return u;
  } catch {
    return null;
  }
}

export function postKey(platform: MatchPlatform, url: string | null | undefined): string | null {
  if (!url) return null;
  const u = tidy(url);
  if (!u) return null;
  const path = u.pathname;

  if (platform === "instagram") {
    const m = path.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/);
    return m ? `ig:${m[1]}` : null;
  }

  if (platform === "tiktok") {
    const m = path.match(/\/(?:video|photo)\/(\d{8,})/) ?? u.searchParams.get("item_id")?.match(/^(\d{8,})$/);
    return m ? `tt:${m[1]}` : null;
  }

  // Facebook
  const video = path.match(/\/(?:videos|reel|watch)\/(?:[^/]+\/)?(\d{6,})/) ?? (u.searchParams.get("v") ?? "").match(/^(\d{6,})$/);
  if (video) return `fb:${video[1]}`;
  const story = (u.searchParams.get("story_fbid") ?? "").match(/^(pfbid\w+|\d{6,})$/);
  if (story) return `fb:${story[1]}`;
  const post = path.match(/\/posts\/(pfbid\w+|\d{6,})/);
  if (post) return `fb:${post[1]}`;
  return `fb:${u.hostname}${path.replace(/\/+$/, "")}`.toLowerCase();
}

/**
 * Every key a post reported by the platform can be found under. A
 * Facebook post's API id is "pageid_postid", and its permalink may use
 * either the number or a pfbid token, so both are offered.
 */
export function socialKeys(platform: MatchPlatform, externalId: string, permalink: string | null): string[] {
  const keys = new Set<string>();
  const fromLink = postKey(platform, permalink);
  if (fromLink) keys.add(fromLink);
  if (platform === "tiktok") keys.add(`tt:${externalId}`);
  if (platform === "facebook") {
    const tail = externalId.split("_").pop();
    if (tail) keys.add(`fb:${tail}`);
  }
  return Array.from(keys);
}

/** Links like vm.tiktok.com/abc that only become a /video/ link after a redirect. */
export function isShortLink(url: string): boolean {
  const u = tidy(url);
  return !!u && /^(vm|vt)\.tiktok\.com$|^fb\.watch$|^instagr\.am$/.test(u.hostname);
}
