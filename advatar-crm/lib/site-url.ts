import "server-only";

/**
 * The public address of this deployment, for links that leave the app.
 *
 * A link inside the CRM can be a path — the browser already knows the
 * domain. A link in an EMAIL cannot: "/app/uploads" in an inbox is a
 * dead link, and that is what every notification email would have
 * carried if the base were missing.
 *
 * Three sources, in order of how much they can be trusted to be the
 * address a person should actually land on:
 *
 *   1. NEXT_PUBLIC_SITE_URL — set by hand. Wins, because it is the
 *      only one that knows about a custom domain the team has chosen
 *      to be the real front door.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the project's production
 *      domain, set by Vercel itself. Stable across deployments.
 *   3. VERCEL_URL — this exact deployment. Changes every deploy and,
 *      on a preview, may sit behind Vercel's own login. Last resort,
 *      and better than nothing only because a preview emailing a
 *      preview link is at least internally consistent.
 *
 * Returning null rather than "" when none is available is the point:
 * an empty base produces a relative URL that looks like a link and
 * is not one. The caller drops the button instead, and the email
 * still says what happened.
 */
export function siteUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return stripTrailingSlash(withProtocol(explicit));

  // Vercel sets both of these without the protocol.
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return stripTrailingSlash(withProtocol(production));

  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return stripTrailingSlash(withProtocol(deployment));

  return null;
}

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
