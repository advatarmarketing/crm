"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileRole } from "@/lib/supabase/types";

export interface InviteState {
  error: string | null;
  success: string | null;
}

const INVITABLE_ROLES: ProfileRole[] = ["ceo", "operations_manager", "staff", "videographer"];

/**
 * CEO-only: invites a new staff/videographer/ceo user by email and
 * sets their profiles.role immediately, so they land in the right
 * place the moment they accept the invite and set a password.
 *
 * Every privileged action gets its own server-side role check like
 * this one — never trust that a page only rendering for CEOs is
 * enough, since a server action is reachable directly.
 */
export async function inviteTeamMember(
  _prevState: InviteState,
  formData: FormData
): Promise<InviteState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in.", success: null };
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "ceo") {
    return { error: "Only the CEO can invite team members.", success: null };
  }

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "") as ProfileRole;
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email) {
    return { error: "Enter an email address.", success: null };
  }

  if (!fullName) {
    return { error: "Enter the person's name.", success: null };
  }

  if (!INVITABLE_ROLES.includes(role)) {
    return { error: "Choose a valid role.", success: null };
  }

  const admin = createAdminClient();

  // The name goes into user metadata so that handle_new_user()
  // (0001_profiles.sql) copies it straight into profiles.full_name
  // when the auth.users row is created. Before this, the invite sent
  // no metadata at all, so full_name was always null and every
  // assigned team member rendered as "Unnamed".
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });

  if (inviteError || !invited.user) {
    return {
      error: inviteError?.message ?? "Could not send the invite.",
      success: null,
    };
  }

  // The on_auth_user_created trigger already inserted a profiles row
  // with role='client' for this new user — correct it now. full_name
  // is set here too rather than relying only on the trigger: the
  // trigger runs `on conflict (id) do nothing`, so if a profiles row
  // somehow already existed the name would otherwise be dropped.
  const { error: updateError } = await admin
    .from("profiles")
    .update({ role, full_name: fullName })
    .eq("id", invited.user.id);

  if (updateError) {
    return {
      error: `Invite sent, but setting the role failed: ${updateError.message}`,
      success: null,
    };
  }

  return {
    error: null,
    success: `Invited ${fullName} (${email}) as ${role}.`,
  };
}

/**
 * CEO-only: sets or corrects an existing team member's display name.
 *
 * Needed as well as the invite change above, because everyone invited
 * before that fix already exists with full_name = null and there was
 * no screen anywhere in the app that could write the column. Without
 * this, existing videographers would stay "Unnamed" forever.
 */
export async function updateTeamMemberName(
  profileId: string,
  fullName: string
): Promise<{ error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "ceo") {
    return { error: "Only the CEO can rename team members." };
  }

  const trimmed = fullName.trim();
  if (!trimmed) return { error: "Enter a name." };

  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ full_name: trimmed })
    .eq("id", profileId);

  if (error) return { error: error.message };

  // Keep auth metadata in step, so the name survives anything that
  // re-runs handle_new_user() against this user later.
  await admin.auth.admin.updateUserById(profileId, {
    user_metadata: { full_name: trimmed },
  });

  revalidatePath("/app/settings/team");
  return { error: null };
}
