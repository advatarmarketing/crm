/**
 * One place that decides how a person's name is written on screen.
 *
 * The rule, from the brief: never blank, never "Unnamed", and never
 * an email address standing in for a name. Those all leak database
 * state into the interface — an email in place of a name tells the
 * reader something has gone wrong without telling them what.
 *
 * Names are required when a login is created and backfilled for every
 * existing account (0022), so the fallback here should never actually
 * be reached. It exists because a page crashing — or printing
 * "undefined" — is a far worse failure than printing a neutral
 * placeholder, and this is the single place that decision is made.
 */
const PLACEHOLDER = "Team member";

export function displayName(fullName: string | null | undefined, fallback = PLACEHOLDER): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return fallback;

  // A name that is really an email is a data problem, not a name.
  // Show the local part in a readable form rather than the address:
  // "jordan.smith@x.com" is not something to greet somebody by.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return prettifyEmailLocalPart(trimmed);
  }

  return trimmed;
}

/** Just the first name, for greetings. */
export function firstName(fullName: string | null | undefined, fallback = PLACEHOLDER): string {
  const full = displayName(fullName, fallback);
  return full.split(/\s+/)[0] || full;
}

/** Up to two initials, for avatars. */
export function initials(fullName: string | null | undefined): string {
  const full = displayName(fullName, "");
  if (!full) return "?";
  return (
    full
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * "jordan.smith@advatar.co" -> "Jordan Smith".
 *
 * Used to backfill a name for an account created before names were
 * required, and as the last-resort display path above. Separators in
 * the local part become spaces; trailing digits are dropped, since
 * "jordan2" is an account suffix rather than part of anyone's name.
 */
export function prettifyEmailLocalPart(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/[._\-+]+/g, " ")
    .replace(/\d+$/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));

  return words.join(" ") || PLACEHOLDER;
}
