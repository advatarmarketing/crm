import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypting and decrypting the social media logins on a client's
 * Passwords tab (0039_client_credentials.sql).
 *
 * The database never holds a readable password. It holds the output
 * of encryptSecret() below, and the key that turns that back into a
 * password is an environment variable in Vercel — somewhere Supabase
 * cannot see and a database backup does not contain. Someone who
 * walks off with the whole `client_credentials` table gets the
 * platform and the handle, which are mostly public anyway, and
 * nothing else.
 *
 * Everything here is server-only. The browser is never given
 * ciphertext — there would be no point, it could not read it — so it
 * is never given anything to attack. A password reaches a screen only
 * through revealCredential() in the Passwords tab's actions, one row
 * at a time, when somebody with access asks for it.
 */

/** The setting the key is read from. Named in error messages, so it
 * lives in one place rather than being typed out in five. */
export const KEY_ENV_NAME = "CREDENTIALS_KEY";

/** Anything shorter is a typo rather than a key. */
const MIN_KEY_LENGTH = 16;

const ENVELOPE_VERSION = "v1";

/**
 * Why a label is mixed into both hashes below: it keeps these two
 * uses of SHA-256 apart. Without it, the key fingerprint would be a
 * hash of the same bytes as the key itself, which is still not
 * reversible but is the kind of overlap that costs nothing to avoid.
 */
const KEY_LABEL = "advatar-credentials-key-v1:";
const FINGERPRINT_LABEL = "advatar-credentials-fingerprint-v1:";

export type KeyState =
  | { ok: true; key: Buffer; keyId: string }
  | { ok: false; reason: "missing" | "too-short" };

function loadKey(): KeyState {
  const raw = (process.env[KEY_ENV_NAME] ?? "").trim();

  if (raw.length === 0) return { ok: false, reason: "missing" };
  if (raw.length < MIN_KEY_LENGTH) return { ok: false, reason: "too-short" };

  // Any passphrase is accepted and hashed down to the 32 bytes
  // AES-256 needs, rather than demanding base64 of exactly 32 bytes.
  // The person setting this is pasting it into Vercel by hand, and a
  // format that rejects what they pasted is a format that ends in the
  // feature being switched off.
  const key = createHash("sha256").update(KEY_LABEL).update(raw).digest();

  const keyId = createHash("sha256")
    .update(FINGERPRINT_LABEL)
    .update(key)
    .digest("hex")
    .slice(0, 12);

  return { ok: true, key, keyId };
}

/** True once the key is set in the environment and long enough. */
export function credentialsKeyReady(): boolean {
  return loadKey().ok;
}

/** "missing" / "too-short", or null when the key is fine. */
export function credentialsKeyProblem(): "missing" | "too-short" | null {
  const state = loadKey();
  return state.ok ? null : state.reason;
}

/**
 * The fingerprint of the key currently in use, or null if there isn't
 * one. Stored alongside each password so that a key changed in Vercel
 * produces "this was saved with the previous key, re-enter it" rather
 * than a decryption error nobody can act on.
 */
export function currentKeyId(): string | null {
  const state = loadKey();
  return state.ok ? state.keyId : null;
}

/**
 * Ties a password to the client it belongs to.
 *
 * AES-GCM checks this value on the way back out, so ciphertext copied
 * from one client's row into another's — the one useful thing someone
 * with raw database access could otherwise do — fails to decrypt
 * instead of quietly revealing the first client's password under the
 * second client's name.
 */
function aad(clientId: string): Buffer {
  return Buffer.from(`advatar-credential:${ENVELOPE_VERSION}:${clientId}`, "utf8");
}

export type EncryptResult =
  | { ok: true; cipher: string; keyId: string }
  | { ok: false; reason: "missing" | "too-short" };

/**
 * Returns `v1.<iv>.<tag>.<ciphertext>`, all base64.
 *
 * The version prefix is what 0039's check constraints match on, so
 * this format is also what stops a readable password being typed into
 * the table by hand.
 */
export function encryptSecret(plain: string, clientId: string): EncryptResult {
  const state = loadKey();
  if (!state.ok) return { ok: false, reason: state.reason };

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", state.key, iv);
  cipher.setAAD(aad(clientId));

  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ok: true,
    cipher: [ENVELOPE_VERSION, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join("."),
    keyId: state.keyId,
  };
}

export type DecryptResult =
  | { ok: true; plain: string }
  | { ok: false; reason: "no-key" | "wrong-key" | "unreadable" };

/**
 * `wrong-key` is told apart from `unreadable` by the fingerprint
 * saved with the row, because the two need different answers: one
 * means "the key in Vercel was changed, type the password in again",
 * the other means something is actually wrong with the stored value.
 * Without the fingerprint both look identical from here — AES-GCM
 * fails the same way for a wrong key as for damaged ciphertext.
 */
export function decryptSecret(
  cipherText: string | null | undefined,
  clientId: string,
  savedKeyId: string | null | undefined
): DecryptResult {
  if (!cipherText) return { ok: false, reason: "unreadable" };

  const state = loadKey();
  if (!state.ok) return { ok: false, reason: "no-key" };

  if (savedKeyId && savedKeyId !== state.keyId) return { ok: false, reason: "wrong-key" };

  const parts = cipherText.split(".");
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) return { ok: false, reason: "unreadable" };

  try {
    const decipher = createDecipheriv("aes-256-gcm", state.key, Buffer.from(parts[1], "base64"));
    decipher.setAAD(aad(clientId));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));

    const plain = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");

    return { ok: true, plain };
  } catch {
    // An unflagged wrong key lands here too: a key changed before
    // anything recorded a fingerprint has nothing to compare against.
    return { ok: false, reason: savedKeyId ? "unreadable" : "wrong-key" };
  }
}

/**
 * A key for someone to paste into Vercel. Used by the Passwords tab
 * when the key is missing, so the CEO is handed one rather than told
 * to go and invent 32 random characters.
 */
export function suggestKey(): string {
  return randomBytes(32).toString("base64url");
}
