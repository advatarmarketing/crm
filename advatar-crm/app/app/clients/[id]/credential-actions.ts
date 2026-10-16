"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import {
  credentialsKeyProblem,
  currentKeyId,
  decryptSecret,
  encryptSecret,
  KEY_ENV_NAME,
} from "@/lib/credentials";

/**
 * The Passwords tab on a client: the social media logins the team
 * needs to actually post.
 *
 * Nothing here decides who is allowed in. Every query runs through
 * the caller's own session, so `client_credentials`' row level
 * security from 0039 does — CEO everywhere, an operations manager on
 * their own clients, assigned staff on theirs, videographers and
 * clients not at all. A videographer calling revealCredential()
 * directly gets the same nothing the table gives them: the row simply
 * is not there.
 *
 * Passwords are encrypted before they reach the database and are
 * decrypted one at a time, here, when somebody asks to see one. See
 * lib/credentials.ts.
 */

/** What the tab is given for each login. No ciphertext: the browser
 * could not read it and has no use for it. */
export interface CredentialSummary {
  id: string;
  platform: string;
  label: string | null;
  username: string | null;
  url: string | null;
  hasPassword: boolean;
  hasNotes: boolean;
  /** Saved with a key that is no longer the one in use. */
  staleKey: boolean;
  updatedAt: string;
}

export interface CredentialInput {
  clientId: string;
  /** Absent for a new login. */
  id?: string | null;
  platform: string;
  label: string;
  username: string;
  url: string;
  /**
   * "keep" leaves whatever is stored alone, which is what editing the
   * handle on an existing login does — the form cannot show the
   * password, so it cannot send it back. "set" writes what is in
   * `password`, and an empty string removes it.
   */
  passwordMode: "keep" | "set";
  password: string;
  notesMode: "keep" | "set";
  notes: string;
}

export interface SaveCredentialResult {
  error: string | null;
  id?: string;
}

function trimTo(value: string | null | undefined, max: number): string | null {
  const text = (value ?? "").trim();
  if (text.length === 0) return null;
  return text.slice(0, max);
}

/** "instagram.com/247rapid" is what people paste; make it clickable. */
function tidyUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function keyErrorMessage(problem: "missing" | "too-short"): string {
  return problem === "missing"
    ? `Passwords can’t be saved yet: ${KEY_ENV_NAME} has not been set in Vercel.`
    : `Passwords can’t be saved yet: ${KEY_ENV_NAME} in Vercel is too short — it needs at least 16 characters.`;
}

export async function saveCredentialAction(input: CredentialInput): Promise<SaveCredentialResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const platform = trimTo(input.platform, 40);
  if (!platform) return { error: "Say which platform this login is for." };

  const label = trimTo(input.label, 60);
  const username = trimTo(input.username, 200);
  const url = tidyUrl(trimTo(input.url, 500));

  // Shape of the row that is written either way. The password and
  // notes columns are added below only when they are actually
  // changing, so "keep" is a genuine no-op on them rather than a
  // re-encryption of something this request never saw.
  const row: Record<string, unknown> = {
    client_id: input.clientId,
    platform,
    label,
    username,
    url,
    updated_by: user.id,
  };

  const changingSecrets = input.passwordMode === "set" || input.notesMode === "set";

  if (changingSecrets) {
    const problem = credentialsKeyProblem();
    // Only blocks when something is actually being encrypted. Clearing
    // a password, or editing a handle, still works with no key set.
    const writingSomething =
      (input.passwordMode === "set" && input.password.length > 0) ||
      (input.notesMode === "set" && input.notes.trim().length > 0);

    if (problem && writingSomething) return { error: keyErrorMessage(problem) };

    if (input.passwordMode === "set") {
      if (input.password.length === 0) {
        row.secret_cipher = null;
      } else {
        const enc = encryptSecret(input.password, input.clientId);
        if (!enc.ok) return { error: keyErrorMessage(enc.reason) };
        row.secret_cipher = enc.cipher;
      }
    }

    if (input.notesMode === "set") {
      const notes = input.notes.trim();
      if (notes.length === 0) {
        row.notes_cipher = null;
      } else {
        const enc = encryptSecret(notes, input.clientId);
        if (!enc.ok) return { error: keyErrorMessage(enc.reason) };
        row.notes_cipher = enc.cipher;
      }
    }

    // Only meaningful once something on the row is encrypted with it.
    if (row.secret_cipher || row.notes_cipher) row.key_id = currentKeyId();
  }

  const existingId = input.id?.trim() || null;

  if (existingId) {
    const { error } = await supabase
      .from("client_credentials")
      .update(row as never)
      .eq("id", existingId);

    if (error) return { error: friendly(error.message) };

    await logActivity(supabase, {
      clientId: input.clientId,
      kind: "credential_saved",
      summary: `${platform} login updated`,
      actorId: user.id,
    });

    revalidatePath(`/app/clients/${input.clientId}`);
    return { error: null, id: existingId };
  }

  const { data, error } = await supabase
    .from("client_credentials")
    .insert(row as never)
    .select("id")
    .single();

  if (error || !data) return { error: friendly(error?.message ?? "Could not save that login.") };

  await logActivity(supabase, {
    clientId: input.clientId,
    kind: "credential_saved",
    summary: `${platform} login added`,
    actorId: user.id,
  });

  revalidatePath(`/app/clients/${input.clientId}`);
  return { error: null, id: (data as { id: string }).id };
}

export async function deleteCredentialAction(
  clientId: string,
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  // Read it first, only so the timeline entry can name the platform.
  // RLS has already decided whether this row exists for this person.
  const { data: existing } = await supabase
    .from("client_credentials")
    .select("platform")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("client_credentials").delete().eq("id", id);

  if (error) return { error: friendly(error.message) };

  await logActivity(supabase, {
    clientId,
    kind: "credential_removed",
    summary: `${(existing as { platform?: string } | null)?.platform ?? "A"} login removed`,
    actorId: user.id,
  });

  revalidatePath(`/app/clients/${clientId}`);
  return { error: null };
}

export interface RevealResult {
  error: string | null;
  password?: string | null;
  notes?: string | null;
  /** Shown alongside what did come back, when only part of it did. */
  warning?: string | null;
}

/**
 * Hands back one login in the clear, to one person, once.
 *
 * Deliberately not part of the page's own data: a password that is
 * sent with the page is a password sitting in the browser's memory,
 * in its back/forward cache and in any screen share, for everyone who
 * opens the tab, whether or not they needed it.
 */
export async function revealCredentialAction(id: string): Promise<RevealResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("client_credentials")
    .select("client_id, secret_cipher, notes_cipher, key_id")
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: friendly(error.message) };
  // Either it is gone, or this person is not allowed it. Both look
  // the same on purpose.
  if (!data) return { error: "That login is no longer there." };

  const row = data as unknown as {
    client_id: string;
    secret_cipher: string | null;
    notes_cipher: string | null;
    key_id: string | null;
  };

  const password = row.secret_cipher
    ? decryptSecret(row.secret_cipher, row.client_id, row.key_id)
    : null;
  const notes = row.notes_cipher ? decryptSecret(row.notes_cipher, row.client_id, row.key_id) : null;

  // A failed password is the whole answer failing. Failed notes are
  // not: handing over the password and saying the notes could not be
  // read beats refusing both over the smaller half.
  if (password && !password.ok) return { error: unlockProblem(password.reason) };

  return {
    error: null,
    password: password ? password.plain : null,
    notes: notes && notes.ok ? notes.plain : null,
    warning: notes && !notes.ok ? `Notes: ${unlockProblem(notes.reason)}` : null,
  };
}

function unlockProblem(reason: "no-key" | "wrong-key" | "unreadable"): string {
  if (reason === "no-key") return `This can’t be unlocked — ${KEY_ENV_NAME} is not set in Vercel.`;
  if (reason === "wrong-key") {
    return "This was saved with a different key, so it can’t be unlocked any more. Type it in again to save it with the current one.";
  }
  return "This could not be read. Type it in again to replace it.";
}

/** Turns the two database errors people will actually hit into
 * sentences, and passes everything else through. */
function friendly(message: string): string {
  if (/client_credentials/.test(message) && /does not exist/i.test(message)) {
    return "Passwords aren’t switched on yet — database update 0039 still needs running.";
  }
  if (/row-level security|violates row-level/i.test(message)) {
    return "You don’t have access to this client’s logins.";
  }
  return message;
}
