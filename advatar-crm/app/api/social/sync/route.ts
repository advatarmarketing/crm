import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanAll, syncYoutubeLinks } from "@/lib/social/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The daily refresh (vercel.json runs it every morning). Reads every
 * linked Instagram, TikTok and Facebook profile and the post links on
 * videos (lib/social/scan.ts), and YouTube links, and saves the day's
 * snapshot, which is what lets the dashboard show growth over time.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
 * set; anyone else is turned away. With no secret set the route refuses
 * everything rather than letting anyone spend scanning credits.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const results = await scanAll(admin);
  const youtube = await syncYoutubeLinks(admin);
  return NextResponse.json({
    read: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    videoLinksUpdated: results.reduce((n, r) => n + r.linked, 0) + youtube,
  });
}
