/**
 * Wording for Your Journey that the browser needs. Kept apart from
 * lib/journey.ts so nothing about the CEO's private settings is ever
 * part of the code a staff member's browser downloads.
 */
import type { JourneyLevel, JourneyVideo } from "@/lib/journey";

export const VIDEO_KINDS: { id: JourneyVideo["kind"]; label: string; hint: string }[] = [
  { id: "started", label: "Where I started", hint: "Your early videos" },
  { id: "now", label: "What I make now", hint: "Your best recent work" },
  { id: "next", label: "Videos I want to make next", hint: "Ones that inspire you" },
];

const pounds = (n: number) => `£${n.toLocaleString("en-GB")}`;

/** "£800–£1,200 a month", "£6,000+ a month", "Unpaid", or null when not set. */
export function earnText(l: Pick<JourneyLevel, "earn_min" | "earn_max" | "paid">): string | null {
  if (!l.paid) return "Unpaid: learning";
  const { earn_min: a, earn_max: b } = l;
  if (a == null && b == null) return null;
  if (a != null && b == null) return `${pounds(a)}+ a month`;
  if (a == null && b != null) return `Up to ${pounds(b)} a month`;
  if (a === b) return `Around ${pounds(a!)} a month`;
  return `${pounds(a!)}–${pounds(b!)} a month`;
}

/** "1–3 clients (or 1 big client)", "20+ clients", or null when not set. */
export function clientsText(l: Pick<JourneyLevel, "clients_min" | "clients_max" | "clients_note">, word: string): string | null {
  const { clients_min: a, clients_max: b } = l;
  let t: string | null = null;
  if (a != null && b == null) t = `${a}+ ${word}`;
  else if (a == null && b != null) t = `Up to ${b} ${word}`;
  else if (a != null && b != null && !(a === 0 && b === 0)) t = a === b ? `${a} ${word}` : `${a}–${b} ${word}`;
  if (t && l.clients_note) t += ` (${l.clients_note})`;
  return t;
}

