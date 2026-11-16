/**
 * Turning the links the team pastes into something the client can
 * watch inside the app.
 *
 *   Google Drive — "https://drive.google.com/file/d/<id>/view?usp=…"
 *     or "…/open?id=<id>". Played through Drive's own preview frame
 *     (/preview) and downloaded through /uc?export=download. The file
 *     must be shared "Anyone with the link"; Drive shows its own
 *     "you need access" page otherwise, which is the one failure we
 *     cannot detect from here, so the upload form says so.
 *
 *   Cloudinary (or any direct video file) — played by the browser's
 *     own <video> element. That is the player that can say where it
 *     is paused, which is what makes "add a note at this point" fill
 *     the time in by itself. A Drive frame cannot: it is another site,
 *     and browsers do not let a page read inside it.
 */

export function driveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(u.hostname)) return null;
    const path = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
    if (path) return path[1];
    const id = u.searchParams.get("id");
    if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) return id;
    return null;
  } catch {
    return null;
  }
}

export function drivePreviewUrl(url: string | null | undefined): string | null {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

export function driveDownloadUrl(url: string | null | undefined): string | null {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : null;
}

/**
 * A link the browser's <video> can play directly: Cloudinary delivery
 * URLs, or anything ending in a video file extension.
 */
export function directVideoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return null;
    if (u.hostname === "res.cloudinary.com" && /\/video\/upload\//.test(u.pathname)) return u.toString();
    if (/\.(mp4|m4v|mov|webm)$/i.test(u.pathname)) return u.toString();
    return null;
  } catch {
    return null;
  }
}

/** Cloudinary's hosted player page, which can only be framed. */
export function cloudinaryPlayerUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname === "player.cloudinary.com" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** YouTube, Vimeo and Loom links, turned into the address their player frames from. */
export function hostedEmbedUrl(url: string | null | undefined): { src: string; via: "youtube" | "vimeo" | "loom" } | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\.|^m\./, "");
    const id = /^[A-Za-z0-9_-]{6,}$/;
    if (host === "youtu.be") {
      const v = u.pathname.slice(1).split("/")[0];
      return id.test(v) ? { src: `https://www.youtube-nocookie.com/embed/${v}`, via: "youtube" } : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,})/);
      const v = m ? m[1] : u.pathname === "/watch" ? u.searchParams.get("v") ?? "" : "";
      return id.test(v) ? { src: `https://www.youtube-nocookie.com/embed/${v}`, via: "youtube" } : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const m = u.pathname.match(/(?:^|\/)(\d{6,})(?:\/([a-f0-9]{6,}))?/);
      const h = u.searchParams.get("h") ?? (m ? m[2] : null);
      return m ? { src: `https://player.vimeo.com/video/${m[1]}${h ? `?h=${h}` : ""}`, via: "vimeo" } : null;
    }
    if (host === "loom.com") {
      const m = u.pathname.match(/^\/(?:share|embed)\/([a-f0-9]{16,})/);
      return m ? { src: `https://www.loom.com/embed/${m[1]}`, via: "loom" } : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * What the team pasted, down to one link. Takes a plain link, or a
 * whole "embed code" (an <iframe ...> snippet), which is what most
 * hosts hand you when you press Share > Embed.
 */
export function linkFromPaste(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const framed = text.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  let link = (framed ? framed[1] : text).trim().replace(/&amp;/g, "&");
  if (link.startsWith("//")) link = `https:${link}`;
  if (/\s/.test(link)) return null;
  try {
    const u = new URL(link);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type PlayerSource =
  | { kind: "native"; src: string } // timestamps fill in themselves
  | { kind: "frame"; src: string; via: "drive" | "cloudinary" | "youtube" | "vimeo" | "loom" } // timestamps typed
  | { kind: "link"; href: string }; // could not be embedded — open it

/** The best way to show this cut, preferring the one that knows the time. */
export function playerFor(streamUrl: string | null | undefined, url: string | null | undefined): PlayerSource | null {
  const native = directVideoUrl(streamUrl) ?? directVideoUrl(url);
  if (native) return { kind: "native", src: native };
  const cloud = cloudinaryPlayerUrl(streamUrl) ?? cloudinaryPlayerUrl(url);
  if (cloud) return { kind: "frame", src: cloud, via: "cloudinary" };
  const drive = drivePreviewUrl(url) ?? drivePreviewUrl(streamUrl);
  if (drive) return { kind: "frame", src: drive, via: "drive" };
  const hosted = hostedEmbedUrl(streamUrl) ?? hostedEmbedUrl(url);
  if (hosted) return { kind: "frame", ...hosted };
  const any = (url ?? streamUrl ?? "").trim();
  return /^https?:\/\//i.test(any) ? { kind: "link", href: any } : null;
}

/** Where the "Download" button points. */
export function downloadHref(url: string | null | undefined): string | null {
  return driveDownloadUrl(url) ?? (url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null);
}
