import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncYoutubeLinks } from "@/lib/social/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The daily refresh of YouTube video links' numbers, through YouTube's
 * own API (YOUTUBE_API_KEY). vercel.json runs it every morning.
 *
 * Instagram, TikTok, Facebook, LinkedIn and X numbers come from the
 * scraper instead (scraper/ in the repository, run by GitHub Actions at
 * 5pm UK time).
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
 * set; anyone else is turned away.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const youtube = await syncYoutubeLinks(createAdminClient());
  return NextResponse.json({ videoLinksUpdated: youtube });
}
