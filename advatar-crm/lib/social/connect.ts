import "server-only";
import { seal } from "./crypto";
import type { MetaPageOption } from "./meta";
import type { TikTokTokens } from "./tiktok";
import type { SocialPlatform } from "@/lib/social";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Stands in for a client id when connecting Advatar's own Instagram. */
export const AGENCY = "agency";

/**
 * Who may connect or disconnect a client's social accounts: the client
 * themselves, or someone who manages that client (the CEO, or the
 * operations manager on it — can_manage_client, 0029). Asked with the
 * person's own session, so the database answers, not this file.
 */
export async function mayConnect(
  supabase: Db,
  clientId: string
): Promise<{ ok: true; userId: string; isClient: boolean } | { ok: false; reason: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Please sign in again." };

  const { data: profile } = await supabase.from("profiles").select("role, client_id").eq("id", user.id).maybeSingle();

  // Advatar's own Instagram (0051): the CEO only.
  if (clientId === AGENCY) {
    return profile?.role === "ceo"
      ? { ok: true, userId: user.id, isClient: false }
      : { ok: false, reason: "Only the CEO can connect Advatar's Instagram." };
  }
  if (profile?.role === "client") {
    return profile.client_id === clientId
      ? { ok: true, userId: user.id, isClient: true }
      : { ok: false, reason: "That isn't your account." };
  }

  const { data: manages } = await supabase.rpc("can_manage_client", { target_client_id: clientId });
  return manages === true
    ? { ok: true, userId: user.id, isClient: false }
    : { ok: false, reason: "Only the CEO or the client's manager can connect accounts." };
}

/** Only ever send people back inside the app. */
export function safeReturn(path: unknown, fallback: string): string {
  return typeof path === "string" && /^\/app\/[\w\-/?=&.%]*$/.test(path) && !path.startsWith("//") ? path : fallback;
}

async function upsertConnection(
  admin: Db,
  row: { client_id: string; platform: SocialPlatform; account_name: string | null; account_handle: string | null; avatar_url: string | null },
  token: { account_id: string; access_token: string; refresh_token?: string | null; expires_at?: string | null; refresh_expires_at?: string | null },
  userId: string
): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("social_connections")
    .upsert(
      { ...row, status: "connected", connected_by: userId, connected_at: now, last_error: null },
      { onConflict: "client_id,platform" }
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the connection.");

  const { error: tokenError } = await admin.from("social_tokens").upsert(
    {
      connection_id: data.id,
      account_id: token.account_id,
      access_token: seal(token.access_token),
      refresh_token: token.refresh_token ? seal(token.refresh_token) : null,
      expires_at: token.expires_at ?? null,
      refresh_expires_at: token.refresh_expires_at ?? null,
      updated_at: now,
    },
    { onConflict: "connection_id" }
  );
  if (tokenError) throw new Error(tokenError.message);
  return data.id as string;
}

/** A Facebook Page, and the Instagram account linked to it if there is one. */
export async function saveMetaPage(admin: Db, clientId: string, page: MetaPageOption, userId: string): Promise<string[]> {
  const ids = [
    await upsertConnection(
      admin,
      { client_id: clientId, platform: "facebook", account_name: page.pageName, account_handle: null, avatar_url: page.pagePicture },
      { account_id: page.pageId, access_token: page.pageToken },
      userId
    ),
  ];
  if (page.igId) {
    ids.push(
      await upsertConnection(
        admin,
        {
          client_id: clientId,
          platform: "instagram",
          account_name: page.igUsername,
          account_handle: page.igUsername ? `@${page.igUsername}` : null,
          avatar_url: page.igPicture,
        },
        { account_id: page.igId, access_token: page.pageToken },
        userId
      )
    );
  }
  return ids;
}

export async function saveTikTok(admin: Db, clientId: string, tokens: TikTokTokens, userId: string): Promise<string> {
  return upsertConnection(
    admin,
    { client_id: clientId, platform: "tiktok", account_name: null, account_handle: null, avatar_url: null },
    {
      account_id: tokens.openId,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      refresh_expires_at: tokens.refreshExpiresAt,
    },
    userId
  );
}

/**
 * The Page list waiting after a Facebook login, for the person who
 * signed in only. The list itself is names, never tokens.
 */
export async function loadPicker(admin: Db, pendingId: string | undefined, userId: string, clientId: string) {
  if (!pendingId || !/^[0-9a-f-]{36}$/i.test(pendingId)) return null;
  const { data } = await admin.from("social_pending").select("id, client_id, created_by, options").eq("id", pendingId).maybeSingle();
  // Advatar's own Instagram has no client (client_id null).
  if (!data || data.created_by !== userId || (data.client_id !== null && data.client_id !== clientId)) return null;
  return {
    pendingId: data.id as string,
    options: (data.options ?? []) as { pageId: string; pageName: string; igUsername: string | null; pagePicture: string | null }[],
  };
}
