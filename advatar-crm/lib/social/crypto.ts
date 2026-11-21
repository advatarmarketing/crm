import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Social account tokens are encrypted before they reach the database
 * (AES-256-GCM), and the table that holds them has no read policy at
 * all — only the server, using the service key, can load a row, and
 * even then it needs this key to make sense of it. A leaked database
 * backup does not leak anybody's Instagram.
 *
 * SOCIAL_TOKEN_KEY is used when set (any long random string). Without
 * it the key is derived from the Supabase service key, which is
 * already secret and already on the server, so nothing extra has to be
 * set up for this to work. Changing either one later means every
 * account has to be connected again.
 */
function key(): Buffer {
  const secret = process.env.SOCIAL_TOKEN_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No encryption key: set SOCIAL_TOKEN_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  return createHash("sha256").update(`advatar-social:${secret}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** A signed, expiring value for the OAuth `state` round trip. */
export function signState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readState<T>(state: string | null): T | null {
  if (!state) return null;
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof value.exp === "number" && value.exp < Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}
