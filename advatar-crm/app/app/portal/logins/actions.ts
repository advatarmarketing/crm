"use server";

import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/credentials";

/**
 * A client revealing one of their own saved passwords (0043).
 *
 * Runs as the client, so RLS returns the row only if it is theirs.
 * Only the password comes back — the team's notes on a login stay with
 * the team, so this never decrypts them.
 */
export async function revealOwnLoginAction(id: string): Promise<{ error: string | null; password?: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You’re signed out. Sign in and try again." };

  const { data, error } = await supabase
    .from("client_credentials")
    .select("client_id, secret_cipher, key_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return { error: "That login isn’t available. Message your team if you need it." };
  const row = data as unknown as { client_id: string; secret_cipher: string | null; key_id: string | null };
  if (!row.secret_cipher) return { error: null, password: null };

  const result = decryptSecret(row.secret_cipher, row.client_id, row.key_id);
  if (!result.ok) return { error: "This password can’t be shown right now. Message your team and they’ll send it to you." };
  return { error: null, password: result.plain };
}
