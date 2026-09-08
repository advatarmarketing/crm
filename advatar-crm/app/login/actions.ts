"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/lib/supabase/types";

const HOME_BY_ROLE: Record<ProfileRole, string> = {
  ceo: "/app/dashboard",
  operations_manager: "/app/dashboard",
  staff: "/app/dashboard",
  videographer: "/app/my-dashboard",
  client: "/app/portal",
};

export interface LoginState {
  error: string | null;
}

/**
 * Signs the user in with Supabase and routes them by profiles.role —
 * NOT by which login tab they clicked. The Client/Staff tabs on
 * /login are a hint for which fields to show; they carry no identity
 * or role information themselves. A CEO or staff member who happens
 * to sign in from the Client tab (or vice versa) still lands on the
 * page their real role maps to.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = createClient();

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !signInData.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", signInData.user.id)
    .single();

  if (profileError || !profile) {
    // Shouldn't happen — the on_auth_user_created trigger provisions
    // a profile for every user — but fail safe rather than throw.
    await supabase.auth.signOut();
    return { error: "We couldn't find an account for this login. Contact your admin." };
  }

  redirect(HOME_BY_ROLE[profile.role as ProfileRole] ?? "/login");
}
