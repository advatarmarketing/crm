"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanClient } from "./sync";
import { scanConfigured } from "./scan";
import { SOCIAL_PLATFORMS, handleFromUrl, isSocialPlatform, profileUrl, type SocialPlatform, type SocialUrls } from "@/lib/social";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refresh(clientId: string) {
  revalidatePath("/app/portal/content");
  revalidatePath(`/app/clients/${clientId}`);
}

/** The CEO or this client's manager, checked by the database itself. */
async function manages(clientId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { data } = await supabase.rpc("can_manage_client", { target_client_id: clientId });
  return data === true;
}

/** Plain words for what a scan did. */
function summary(results: { platform: SocialPlatform; ok: boolean; error?: string }[]): { ok: boolean; text: string } {
  const label = (p: SocialPlatform) => SOCIAL_PLATFORMS.find((x) => x.id === p)?.label ?? p;
  const bad = results.filter((r) => !r.ok);
  if (!bad.length) return { ok: true, text: "Up to date." };
  return { ok: false, text: bad.map((r) => `${label(r.platform)}: ${r.error ?? "didn't update."}`).join(" ") };
}

export async function syncSocialNowAction(clientId: string): Promise<Result> {
  if (!(await manages(clientId))) return { ok: false, error: "Only the CEO or the client's manager can refresh this." };
  if (!scanConfigured()) return { ok: false, error: "Profile scanning isn't switched on yet: add SCRAPECREATORS_API_KEY in Vercel." };
  const results = await scanClient(createAdminClient(), clientId, { deep: true });
  refresh(clientId);
  if (!results.length) return { ok: false, error: "Add their profile links above first." };
  const s = summary(results);
  return s.ok ? { ok: true, message: s.text } : { ok: false, error: s.text };
}

/**
 * The Performance tab's "Accounts we manage": which platforms we post on
 * for this client, each one's profile link, and the day we started
 * posting (nothing before it counts on their dashboard). Saving reads
 * the profiles straight away.
 */
export async function saveSocialSetupAction(
  clientId: string,
  input: { platforms: string[]; urls: Record<string, string>; startedOn: string | null }
): Promise<Result & { urls?: SocialUrls; message?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  if (!(await manages(clientId))) return { ok: false, error: "Only the CEO or the client's manager can change this." };

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

  const { data: before } = await supabase.from("clients").select("social_urls").eq("id", clientId).maybeSingle();
  const old = (before?.social_urls ?? {}) as SocialUrls;

  const { error } = await supabase.from("clients").update({ social_platforms: platforms, social_urls: urls, posting_started_on: started }).eq("id", clientId);
  if (error) {
    return {
      ok: false,
      error: /social_urls|posting_started_on|social_platforms/.test(error.message) ? "Run database update 0050 in Supabase first." : error.message,
    };
  }

  // A link taken away stops that platform being read. A link changed to
  // a different account also clears what was read from the old one, so
  // two accounts' numbers never mix on the dashboard.
  const admin = createAdminClient();
  for (const p of SOCIAL_PLATFORMS) {
    const was = old[p.id];
    const now = urls[p.id];
    const same = (a?: string) => (a ? handleFromUrl(p.id, a) ?? a.toLowerCase() : null);
    if (!was || same(was) === same(now)) continue;
    await admin.from("social_connections").delete().eq("client_id", clientId).eq("platform", p.id);
    if (now) {
      await admin.from("social_posts").delete().eq("client_id", clientId).eq("platform", p.id);
      await admin.from("social_snapshots").delete().eq("client_id", clientId).eq("platform", p.id);
    }
  }

  // Read the profiles straight away. A problem here doesn't undo the save.
  let note: string | undefined;
  if (Object.keys(urls).length && !scanConfigured()) {
    note = "profile scanning isn't switched on yet (SCRAPECREATORS_API_KEY in Vercel), so no numbers yet.";
  } else {
    try {
      const s = summary(await scanClient(admin, clientId, { deep: true }));
      if (!s.ok) note = s.text;
    } catch {
      // Left for the daily refresh.
    }
  }
  refresh(clientId);
  return { ok: true, urls, message: note };
}
