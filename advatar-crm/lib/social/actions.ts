"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mayConnect, saveMetaPage } from "./connect";
import { unseal } from "./crypto";
import { metaPages } from "./meta";
import { syncAll } from "./sync";
import { SOCIAL_PLATFORMS, isSocialPlatform, profileUrl, type SocialPlatform, type SocialUrls } from "@/lib/social";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refresh(clientId: string) {
  revalidatePath("/app/portal/content");
  revalidatePath(`/app/clients/${clientId}`);
}

/** After a Facebook login with several Pages: the one that's this client's. */
export async function chooseMetaPageAction(pendingId: string, pageId: string): Promise<Result> {
  const admin = createAdminClient();
  const { data: pending } = await admin.from("social_pending").select("*").eq("id", pendingId).maybeSingle();
  if (!pending) return { ok: false, error: "That list has expired. Please connect again." };

  const who = await mayConnect(createClient(), pending.client_id);
  if (!who.ok) return { ok: false, error: who.reason };
  if (pending.created_by !== who.userId) return { ok: false, error: "Only the person who signed in to Facebook can choose." };
  if (Date.now() - new Date(pending.created_at).getTime() > 30 * 60 * 1000) {
    await admin.from("social_pending").delete().eq("id", pendingId);
    return { ok: false, error: "That list has expired. Please connect again." };
  }

  const token = unseal(pending.user_token);
  if (!token) return { ok: false, error: "Please connect again." };

  try {
    const page = (await metaPages(token)).find((p) => p.pageId === pageId);
    if (!page) return { ok: false, error: "That Page is no longer available to this login." };
    await saveMetaPage(admin, pending.client_id, page, who.userId);
    await admin.from("social_pending").delete().eq("id", pendingId);
    await syncAll(admin, pending.client_id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connecting didn't work." };
  }
  refresh(pending.client_id);
  return { ok: true, message: "Connected. The first numbers are in, and they'll refresh every day." };
}

export async function disconnectSocialAction(clientId: string, platform: SocialPlatform): Promise<Result> {
  if (!isSocialPlatform(platform)) return { ok: false, error: "Unknown platform." };
  const who = await mayConnect(createClient(), clientId);
  if (!who.ok) return { ok: false, error: who.reason };

  // Access is thrown away; the history (snapshots, posts) is kept, so
  // reconnecting later carries on the same growth line.
  const { error } = await createAdminClient().from("social_connections").delete().eq("client_id", clientId).eq("platform", platform);
  if (error) return { ok: false, error: error.message };
  refresh(clientId);
  return { ok: true };
}

export async function syncSocialNowAction(clientId: string): Promise<Result> {
  const who = await mayConnect(createClient(), clientId);
  if (!who.ok) return { ok: false, error: who.reason };
  const results = await syncAll(createAdminClient(), clientId);
  refresh(clientId);
  const failed = results.filter((r) => !r.ok);
  if (!results.length) return { ok: false, error: "No accounts are connected yet." };
  if (failed.length) return { ok: false, error: failed[0].error ?? "One account didn't update." };
  return { ok: true, message: "Up to date." };
}

/** The team's choice of which platforms this client posts on. */
export async function setSocialPlatformsAction(clientId: string, platforms: string[]): Promise<Result> {
  // Untyped, like the rest of lib/social: the hand-written Database type
  // doesn't know 0048's columns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { data: manages } = await supabase.rpc("can_manage_client", { target_client_id: clientId });
  if (manages !== true) return { ok: false, error: "Only the CEO or the client's manager can change this." };

  const clean = Array.from(new Set(platforms.filter(isSocialPlatform)));
  const { error } = await supabase.from("clients").update({ social_platforms: clean }).eq("id", clientId);
  if (error) {
    return {
      ok: false,
      error: /social_platforms/.test(error.message) ? "Run migration 0048 in Supabase first." : error.message,
    };
  }
  refresh(clientId);
  return { ok: true };
}

/**
 * The Performance tab's "Accounts we manage": which platforms we post on
 * for this client, each one's profile link, and the day we started
 * posting (nothing before it counts on their dashboard).
 */
export async function saveSocialSetupAction(
  clientId: string,
  input: { platforms: string[]; urls: Record<string, string>; startedOn: string | null }
): Promise<Result & { urls?: SocialUrls }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { data: manages } = await supabase.rpc("can_manage_client", { target_client_id: clientId });
  if (manages !== true) return { ok: false, error: "Only the CEO or the client's manager can change this." };

  const urls: SocialUrls = {};
  for (const p of SOCIAL_PLATFORMS) {
    const typed = (input.urls[p.id] ?? "").trim();
    if (!typed) continue;
    const clean = profileUrl(p.id, typed);
    if (!clean) return { ok: false, error: `That doesn't look like a ${p.label} profile link. Paste the address of their profile, or their @name.` };
    urls[p.id] = clean;
  }
  // A profile link means we post there.
  const platforms = Array.from(new Set([...input.platforms.filter(isSocialPlatform), ...(Object.keys(urls) as SocialPlatform[])]));

  const started = input.startedOn?.trim() || null;
  if (started && !/^\d{4}-\d{2}-\d{2}$/.test(started)) return { ok: false, error: "That date isn't valid." };

  const { error } = await supabase.from("clients").update({ social_platforms: platforms, social_urls: urls, posting_started_on: started }).eq("id", clientId);
  if (error) {
    return {
      ok: false,
      error: /social_urls|posting_started_on|social_platforms/.test(error.message) ? "Run database update 0050 in Supabase first." : error.message,
    };
  }
  refresh(clientId);
  return { ok: true, urls };
}
