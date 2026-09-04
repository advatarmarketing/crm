"use server";

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

  if (!email) {
    return { error: "Enter an email address.", success: null };
  }

  if (!INVITABLE_ROLES.includes(role)) {
    return { error: "Choose a valid role.", success: null };
  }

  const admin = createAdminClient();

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email);

  if (inviteError || !invited.user) {
    return {
      error: inviteError?.message ?? "Could not send the invite.",
      success: null,
    };
  }

  // The on_auth_user_created trigger already inserted a profiles row
  // with role='client' for this new user — correct it now.
  const { error: updateError } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", invited.user.id);

  if (updateError) {
    return {
      error: `Invite sent, but setting the role failed: ${updateError.message}`,
      success: null,
    };
  }

  return {
    error: null,
    success: `Invited ${email} as ${role}.`,
  };
}
