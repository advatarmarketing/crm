"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AccessArea } from "@/lib/team-access";

/**
 * Flips one switch for one staff member (0044). Runs as the caller, so
 * team_access's row level security makes this CEO-only whatever the
 * page shows.
 */
export async function setStaffAccessAction(
  profileId: string,
  current: { contracts: boolean; logins: boolean; money: boolean },
  area: AccessArea,
  value: boolean
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const next = { ...current, [area]: value };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("team_access").upsert(
    {
      profile_id: profileId,
      contracts: next.contracts,
      logins: next.logins,
      money: next.money,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" }
  );

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /team_access/.test(error.message)) {
      if (/does not exist|could not find/i.test(error.message)) {
        return { error: "Team access isn't switched on yet. Database update 0044 still needs running." };
      }
    }
    if (/row-level security/i.test(error.message)) return { error: "Only the CEO can change what staff can see." };
    return { error: error.message };
  }

  revalidatePath("/app/settings/access");
  return { error: null };
}

/** The one videographer switch (0047): may they send work straight to the client? */
export async function setVideographerShareAction(profileId: string, value: boolean): Promise<{ error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("videographer_access").upsert(
    { profile_id: profileId, share_with_client: value, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "profile_id" }
  );
  if (error) {
    if ((error.code === "42P01" || error.code === "PGRST205" || /videographer_access/.test(error.message)) && /does not exist|could not find/i.test(error.message)) {
      return { error: "This switch isn't on yet. Database update 0047 still needs running." };
    }
    if (/row-level security/i.test(error.message)) return { error: "Only the CEO can change this." };
    return { error: error.message };
  }
  revalidatePath("/app/settings/access");
  return { error: null };
}

/** 0053: put someone on (or take them off) your own content, both brands. */
export async function setOwnContentAction(profileId: string, value: boolean): Promise<{ error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("set_own_content_access", { target: profileId, allow: value });
  if (error) {
    if (/set_own_content_access|could not find|does not exist/i.test(error.message)) {
      return { error: "This switch isn't on yet. Database update 0053 still needs running." };
    }
    return { error: error.message };
  }
  revalidatePath("/app/settings/access");
  return { error: null };
}
