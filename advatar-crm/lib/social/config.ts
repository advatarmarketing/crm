import "server-only";
import { siteUrl } from "@/lib/site-url";
import type { SocialPlatform } from "@/lib/social";

/** Graph API version. Meta retires versions after about two years. */
export const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || "v23.0"}`;

export function metaConfigured(): boolean {
  return !!(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim());
}

export function tiktokConfigured(): boolean {
  return !!(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim());
}

export function providerFor(p: SocialPlatform): "meta" | "tiktok" {
  return p === "tiktok" ? "tiktok" : "meta";
}

export function configuredFor(p: SocialPlatform): boolean {
  return providerFor(p) === "meta" ? metaConfigured() : tiktokConfigured();
}

/**
 * The address Meta and TikTok send people back to. It has to match,
 * character for character, what is registered on their developer
 * sites — so it comes from NEXT_PUBLIC_SITE_URL (or Vercel's production
 * domain), not from whichever preview address someone happened to use.
 */
export function callbackUrl(provider: "meta" | "tiktok", requestOrigin: string): string {
  return `${siteUrl() ?? requestOrigin}/api/social/callback/${provider}`;
}
