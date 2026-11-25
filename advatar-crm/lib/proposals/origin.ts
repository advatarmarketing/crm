import "server-only";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/site-url";

/** This site's address, for links in emails and Stripe's return pages. */
export function requestOrigin(): string {
  const configured = siteUrl();
  if (configured) return configured;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function requestMeta() {
  const h = headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
    origin: requestOrigin(),
  };
}
