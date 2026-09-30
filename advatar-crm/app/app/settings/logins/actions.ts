"use server";

import { randomInt } from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  HOME_BY_ROLE,
  VIEW_AS_COOKIE,
  VIEW_AS_MAX_AGE_SECONDS,
  sealViewAs,
  withViewAs,
} from "@/lib/view-as";
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

/**
 * Sets a login's password to one the manager has chosen.
 *
 * This exists because nobody — not the CEO, not Supabase support, not
 * anyone with the database in front of them — can read an existing
 * password. Supabase stores a bcrypt hash, which is a one-way
 * scramble: signing in re-scrambles what was typed and compares the
 * two. There is no "show me their password" to build, so the way to
 * know somebody's password is to be the one who set it.
 *
 * That is the whole trade this makes, and it is worth stating plainly:
 * a password the CEO knows is a password that is no longer proof of
 * who did something. Where it matters that only one person could have
 * signed in, use Reset password instead and let them change it.
 */
export async function setLoginPassword(
  profileId: string,
  password: string
): Promise<{ error: string | null }> {
  const caller = await requireLoginManager();
  if (caller.error) return { error: caller.error };

  // Not trimmed. A leading or trailing space is a legitimate part of a
  // password, and quietly removing it here would set something other
  // than what is on screen — which is the one thing this must not do.
  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }

  // bcrypt only looks at the first 72 bytes, so anything longer is a
  // password whose tail does nothing. Refusing beats silently ignoring
  // half of what was typed.
  if (Buffer.byteLength(password, "utf8") > 72) {
    return { error: "That's too long — keep it under 72 characters." };
  }

  const admin = createAdminClient();

  // Same gate as resetLoginPassword: an operations manager must not be
  // able to set the CEO's password, which would be a way to take over
  // the account.
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();

  const targetRole = (target as { role?: string } | null)?.role as ProfileRole | undefined;
  if (!targetRole) return { error: "That login no longer exists." };

  const allowed = CREATABLE_BY[caller.role!] ?? [];
  if (!allowed.includes(targetRole)) {
    return { error: "You can't set the password for that login." };
  }

  const { error } = await admin.auth.admin.updateUserById(profileId, { password });

  if (error) {
    // Supabase enforces its own project-level password rules on top of
    // ours, and its wording is the useful one when they disagree.
    return { error: error.message };
  }

  revalidatePath("/app/settings/logins");
  return { error: null };
}

/**
 * Opens a read-only preview of somebody else's CRM.
 *
 * Mints a short-lived access token for them and seals it into an
 * httpOnly cookie. The browser cannot read it, and it does nothing on
 * its own: middleware only honours it on a request that also carries
 * `?_viewAs=1`, and refuses anything that isn't a read. See
 * lib/view-as.ts for the whole shape of it.
 *
 * CEO only, and never yourself. An operations manager can already set
 * a staff password; being able to silently look through their screen
 * is a different thing, and not one this hands out.
 */
export async function startViewAs(
  profileId: string
): Promise<{ error: string | null; href: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in.", href: null };

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if ((me as { role?: string } | null)?.role !== "ceo") {
    return { error: "Only the CEO can view someone else's CRM.", href: null };
  }

  if (profileId === user.id) {
    return { error: "That's your own login — you're already looking at it.", href: null };
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();

  const targetRole = (target as { role?: string } | null)?.role as ProfileRole | undefined;
  if (!targetRole) return { error: "That login no longer exists.", href: null };

  // The email on the auth record, not on the profile: it is what the
  // token is minted against, and the two can differ.
  const { data: authUser, error: lookupError } = await admin.auth.admin.getUserById(profileId);
  const email = authUser?.user?.email;

  if (lookupError || !email) {
    return { error: "That login has no email address to sign in with.", href: null };
  }

  // A magic link is generated and then spent here on the server, which
  // is how a token is obtained without knowing anyone's password and
  // without an email ever being sent. The link is consumed
  // immediately, so nothing usable is left behind.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const hashedToken = link?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    return { error: linkError?.message ?? "Could not open a preview for that login.", href: null };
  }

  // A throwaway client: no session is persisted anywhere, so this
  // never disturbs the CEO's own sign-in or writes a cookie.
  const exchange = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  const { data: exchanged, error: exchangeError } = await exchange.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });

  const accessToken = exchanged?.session?.access_token;
  if (exchangeError || !accessToken) {
    return { error: exchangeError?.message ?? "Could not open a preview for that login.", href: null };
  }

  const sealed = await sealViewAs({
    id: profileId,
    role: targetRole,
    token: accessToken,
    viewer: user.id,
    expires: Date.now() + VIEW_AS_MAX_AGE_SECONDS * 1000,
  });

  cookies().set({
    name: VIEW_AS_COOKIE,
    value: sealed,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIEW_AS_MAX_AGE_SECONDS,
  });

  // Their home page, not the CEO's — the point is to land where they
  // land.
  return { error: null, href: withViewAs(HOME_BY_ROLE[targetRole]) };
}

/** Closes the preview. Safe to call when none is open. */
export async function stopViewAs(): Promise<void> {
  cookies().set({
    name: VIEW_AS_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
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

/**
 * Sets where the CRM emails somebody.
 *
 * Management fills this in on somebody's behalf, which is the point:
 * a client who will never open the settings page still needs to be
 * told when their video is ready, and the person setting that up is
 * whoever onboarded them.
 *
 * Deliberately NOT their sign-in address. Those are two different
 * things — changing the login is how somebody signs in, and a login
 * is often a shared or made-up address. This only changes where mail
 * goes. See 0030.
 *
 * `requireLoginManager()` is the same gate the rest of this file
 * uses: CEO and operations manager only, and an operations manager
 * cannot touch a CEO's or another manager's login.
 */
export async function updateLoginNotifyEmail(
  profileId: string,
  notifyEmail: string
): Promise<{ error: string | null }> {
  const caller = await requireLoginManager();
  if (caller.error) return { error: caller.error };

  const trimmed = notifyEmail.trim();

  // Loose on purpose, and matching the database's own constraint
  // (0030) rather than trying to out-clever it. Blank clears it and
  // falls back to the login address.
  if (trimmed && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return { error: "That doesn't look like an email address. Leave it blank to use their sign-in address." };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ notify_email: trimmed || null })
    .eq("id", profileId);

  if (error) {
    // The likeliest cause by far, and one with a fix the reader can
    // act on, so it is named rather than passed through raw.
    if (error.code === "42703" || /notify_email/.test(error.message ?? "")) {
      return { error: "Run migration 0030 first — this database has no notification-email field yet." };
    }
    return { error: error.message };
  }

  revalidatePath("/app/settings/logins");
  return { error: null };
}
