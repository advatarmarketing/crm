import "server-only";
import { seal, unseal } from "./crypto";
import { instagramLookup, TokenProblem, type MetaPageOption } from "./meta";
import { applyToVideoPosts, saveFetched } from "./sync";
import { metaConfigured } from "./config";
import { handleFromUrl, type SocialUrls } from "@/lib/social";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * Advatar's own Instagram (0051), used to read clients' public Instagram
 * numbers from the profile link on their Performance tab. Server only:
 * the table has no policies, and its access is encrypted.
 */
export async function loadAgency(admin: Admin): Promise<{ igUserId: string; username: string | null; token: string; lastError: string | null } | null> {
  const { data, error } = await admin.from("agency_instagram").select("*").eq("id", true).maybeSingle();
  if (error || !data) return null;
  const token = unseal(data.access_token);
  return token ? { igUserId: data.ig_user_id, username: data.username, token, lastError: data.last_error } : null;
}

/** For the Performance tab: who it's connected as, never the access. */
export async function agencyStatus(admin: Admin): Promise<{ available: boolean; username: string | null; lastError: string | null }> {
  const { data, error } = await admin.from("agency_instagram").select("username, last_error").eq("id", true).maybeSingle();
  if (error) return { available: false, username: null, lastError: null };
  return { available: true, username: data?.username ?? null, lastError: data ? data.last_error : null };
}

export async function saveAgency(admin: Admin, page: MetaPageOption, userId: string) {
  if (!page.igId) throw new Error("That Facebook Page has no Instagram business account linked to it.");
  const { error } = await admin.from("agency_instagram").upsert(
    {
      id: true,
      ig_user_id: page.igId,
      username: page.igUsername,
      access_token: seal(page.pageToken),
      connected_by: userId,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(/agency_instagram/.test(error.message) ? "Run database update 0051 in Supabase first." : error.message);
}

/**
 * One client's Instagram, from their profile link. Skipped when their
 * own Instagram is connected (that gives more, views included), when
 * Instagram isn't one of their platforms, or when there's no link.
 */
export async function lookupClient(admin: Admin, clientId: string, agency?: Awaited<ReturnType<typeof loadAgency>>): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const { data: client, error } = await admin.from("clients").select("social_platforms, social_urls").eq("id", clientId).maybeSingle();
  if (error || !client) return { ok: false, skipped: true };
  const urls = (client.social_urls ?? {}) as SocialUrls;
  const handle = handleFromUrl("instagram", urls.instagram)?.slice(1);
  if (!handle || !(client.social_platforms ?? []).includes("instagram")) return { ok: true, skipped: true };

  const { data: existing } = await admin
    .from("social_connections")
    .select("id, status")
    .eq("client_id", clientId)
    .eq("platform", "instagram")
    .maybeSingle();
  if (existing && existing.status !== "lookup") return { ok: true, skipped: true };

  const a = agency === undefined ? await loadAgency(admin) : agency;
  if (!a || !metaConfigured()) return { ok: true, skipped: true };

  // The row the dashboard shows, made on first use.
  let connId = existing?.id as string | undefined;
  if (!connId) {
    const { data: made, error: makeError } = await admin
      .from("social_connections")
      .upsert({ client_id: clientId, platform: "instagram", status: "lookup", account_handle: `@${handle}`, connected_at: new Date().toISOString() }, { onConflict: "client_id,platform" })
      .select("id")
      .single();
    if (makeError || !made) return { ok: false, error: makeError?.message ?? "Couldn't save." };
    connId = made.id as string;
  }

  try {
    const data = await instagramLookup(a.igUserId, a.token, handle);
    await saveFetched(admin, { id: connId, client_id: clientId, platform: "instagram" }, data, "lookup");
    await applyToVideoPosts(admin, clientId, "instagram");
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Instagram didn't answer.";
    if (e instanceof TokenProblem) {
      await admin.from("agency_instagram").update({ last_error: "Advatar's Instagram needs connecting again." }).eq("id", true);
    }
    await admin.from("social_connections").update({ last_error: message.slice(0, 300), account_handle: `@${handle}` }).eq("id", connId);
    return { ok: false, error: message };
  }
}

/** Every client with an Instagram link and no connected Instagram (the daily job). */
export async function syncLookups(admin: Admin, clientId?: string) {
  const agency = await loadAgency(admin);
  if (!agency) return [];
  let q = admin.from("clients").select("id").contains("social_platforms", ["instagram"]);
  if (clientId) q = q.eq("id", clientId);
  const { data } = await q;
  const out: { id: string; ok: boolean; error?: string }[] = [];
  for (const row of (data ?? []) as { id: string }[]) {
    const r = await lookupClient(admin, row.id, agency);
    if (!r.skipped) out.push({ id: row.id, ...r });
  }
  return out;
}
