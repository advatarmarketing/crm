"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileRole } from "@/lib/supabase/types";

export interface CreateLoginState {
  error: string | null;
  success: string | null;
  /**
   * The temporary password, returned once so it can be shown on
   * screen and copied. Never stored anywhere — if it's lost, the CEO
   * resets it, which issues a new one.
   */
  tempPassword: string | null;
}

/** Roles each role is allowed to create. */
const CREATABLE_BY: Record<string, ProfileRole[]> = {
  // The CEO can create anything, including another CEO.
  ceo: ["ceo", "operations_manager", "staff", "videographer", "client"],
  // An operations manager runs the day-to-day team, so it can create
  // the people it manages — but not another manager, and not a CEO.
  // Widening this is one line if that turns out to be wrong.
  operations_manager: ["staff", "videographer", "client"],
};

/**
 * Words picked to be easy to read aloud down a phone: no
 * l/I/O/0 confusion, nothing that needs spelling out.
 */
const PASSWORD_WORDS = [
  "amber", "anchor", "beacon", "bridge", "camera", "canyon", "cedar", "cobalt",
  "copper", "crimson", "delta", "ember", "falcon", "granite", "harbour", "hazel",
  "indigo", "island", "jasper", "junction", "kestrel", "lantern", "marble", "meadow",
  "nectar", "nimbus", "orchard", "outpost", "pebble", "pewter", "quartz", "quiver",
  "ribbon", "rustic", "saffron", "signal", "summit", "tandem", "thicket", "tundra",
  "velvet", "vessel", "walnut", "willow", "zenith", "zephyr",
];

/**
 * Generates a temporary password of the shape `camera-walnut-4827`.
 *
 * Three separated parts so it survives being read out or written on
 * paper, which is how this will actually be handed over. randomInt is
 * the crypto-grade generator, not Math.random.
 */
function generateTempPassword(): string {
  const a = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)];
  let b = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)];
  while (b === a) b = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)];
  const digits = String(randomInt(1000, 10000));
  return `${a}-${b}-${digits}`;
}

/**
 * Confirms the caller may manage logins, and returns their role.
 *
 * Every action below starts here. The page already checks the role
 * before rendering, but a server action is reachable directly, so the
 * page's check is not the boundary — this is.
 */
async function requireLoginManager(): Promise<
  { role: ProfileRole; error: null } | { role: null; error: string }
> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { role: null, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role?: string } | null)?.role as ProfileRole | undefined;

  if (!role || !CREATABLE_BY[role]) {
    return { role: null, error: "Only the CEO or an operations manager can manage logins." };
  }

  return { role, error: null };
}

/**
 * Creates a login end to end: the Supabase auth user, and its
 * profiles row with the right role and client link.
 *
 * Deliberately creates the account with a temporary password and
 * `email_confirm: true` rather than sending an invite email. Invite
 * and reset emails go out through Supabase's built-in mailer, which
 * is rate-limited to a handful an hour on a project with no custom
 * SMTP set up, and they need a "set your password" page to land on.
 * Handing over a temporary password works today, with nothing else
 * configured, and the person changes it themselves at
 * Settings → Password after signing in.
 */
export async function createLogin(
  _prev: CreateLoginState,
  formData: FormData
): Promise<CreateLoginState> {
  const caller = await requireLoginManager();
  if (caller.error) return { error: caller.error, success: null, tempPassword: null };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as ProfileRole;
  const clientId = String(formData.get("client_id") ?? "").trim();

  if (!fullName) return { error: "Enter the person's name.", success: null, tempPassword: null };
  if (!email) return { error: "Enter an email address.", success: null, tempPassword: null };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That doesn't look like an email address.", success: null, tempPassword: null };
  }

  const allowed = CREATABLE_BY[caller.role!] ?? [];
  if (!allowed.includes(role)) {
    return { error: "You can't create a login with that role.", success: null, tempPassword: null };
  }

  // A client login that isn't linked to a client record can't see
  // anything — the portal reads profiles.client_id to decide what to
  // show. Better to refuse than to create an account that silently
  // shows an empty portal.
  if (role === "client" && !clientId) {
    return { error: "Choose which client this login belongs to.", success: null, tempPassword: null };
  }

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created?.user) {
    const message = createError?.message ?? "";
    return {
      error: /already|registered|exists/i.test(message)
        ? "There's already a login with that email address."
        : message || "Could not create the login.",
      success: null,
      tempPassword: null,
    };
  }

  // handle_new_user() (0001) has already inserted a profiles row with
  // role='client' and whatever full_name the metadata carried. Set
  // the real role and client link now. If this fails the auth user
  // exists with the wrong role, so the account is removed again
  // rather than left half-made.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role,
      full_name: fullName,
      client_id: role === "client" ? clientId : null,
    })
    .eq("id", created.user.id);

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      error: `Could not set the role, so the login was removed again: ${profileError.message}`,
      success: null,
      tempPassword: null,
    };
  }

  revalidatePath("/app/settings/logins");

  return {
    error: null,
    success: `Login created for ${fullName} (${email}).`,
    tempPassword,
  };
}

/**
 * Issues a new temporary password for an existing login.
 *
 * Same reasoning as createLogin: this changes the password directly
 * and hands it back to be read out, rather than depending on an
 * email that may never arrive.
 */
export async function resetLoginPassword(
  profileId: string
): Promise<{ error: string | null; tempPassword: string | null }> {
  const caller = await requireLoginManager();
  if (caller.error) return { error: caller.error, tempPassword: null };

  const admin = createAdminClient();

  // An operations manager must not be able to reset the CEO's
  // password — that would be a way to take over the account.
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();

  const targetRole = (target as { role?: string } | null)?.role as ProfileRole | undefined;
  if (!targetRole) return { error: "That login no longer exists.", tempPassword: null };

  const allowed = CREATABLE_BY[caller.role!] ?? [];
  if (!allowed.includes(targetRole)) {
    return { error: "You can't reset the password for that login.", tempPassword: null };
  }

  const tempPassword = generateTempPassword();

  const { error } = await admin.auth.admin.updateUserById(profileId, {
    password: tempPassword,
  });

  if (error) return { error: error.message, tempPassword: null };

  revalidatePath("/app/settings/logins");
  return { error: null, tempPassword };
}

/** Sets or corrects the name shown for a login. */
export async function updateLoginName(
  profileId: string,
  fullName: string
): Promise<{ error: string | null }> {
  const caller = await requireLoginManager();
  if (caller.error) return { error: caller.error };

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

  revalidatePath("/app/settings/logins");
  return { error: null };
}
