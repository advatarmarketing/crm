/**
 * The questions on /enquire, in one place.
 *
 * Shared by the page that asks them and the server action that saves
 * the answers, so the lead's notes read back in the same words the
 * person actually saw. Keeping them apart is how you end up with a
 * lead that says "budget_mid" instead of "£500 to £1,500".
 */

export interface EnquiryOption {
  id: string;
  emoji: string;
  title: string;
  description: string;
}

export const LOOKING_FOR: EnquiryOption[] = [
  { id: "viral", emoji: "🚀", title: "Go viral", description: "Reach more people" },
  { id: "professional", emoji: "💼", title: "Look professional", description: "Present my brand properly" },
  { id: "video", emoji: "🎥", title: "Video production", description: "High quality content" },
  { id: "social", emoji: "📱", title: "Social management", description: "Handle my socials for me" },
];

export const BUSINESS_TYPE: EnquiryOption[] = [
  { id: "local", emoji: "🏪", title: "Local business", description: "Shop, salon, restaurant" },
  { id: "product", emoji: "🛍️", title: "Product brand", description: "Selling products online" },
  { id: "personal", emoji: "🧑‍💼", title: "Personal brand", description: "Coach, consultant, creator" },
  { id: "charity", emoji: "🤝", title: "Charity", description: "Community or non-profit" },
];

export const BUDGET: EnquiryOption[] = [
  { id: "under_500", emoji: "💷", title: "Under £500", description: "Getting started" },
  { id: "500_1500", emoji: "💰", title: "£500 to £1,500", description: "Steady growth" },
  { id: "1500_plus", emoji: "💎", title: "£1,500+", description: "Full service" },
  { id: "unsure", emoji: "🤔", title: "Not sure yet", description: "Let's talk it through" },
];

export const TIMING: EnquiryOption[] = [
  { id: "asap", emoji: "⚡", title: "ASAP", description: "Ready to go" },
  { id: "this_month", emoji: "📅", title: "This month", description: "Within a few weeks" },
  { id: "1_3_months", emoji: "🗓️", title: "In 1 to 3 months", description: "Planning ahead" },
  { id: "exploring", emoji: "👀", title: "Just exploring", description: "Seeing what's possible" },
];

/** What the browser sends. Everything is checked again on the server. */
export interface EnquiryPayload {
  lookingFor: string[];
  lookingForOther: string;
  businessType: string | null;
  businessTypeOther: string;
  budget: string | null;
  timing: string | null;

  name: string;
  business: string;
  phone: string;
  email: string;
  instagram: string;
  website: string;
  anythingElse: string;

  /** The honeypot. A person leaves this empty; a form-filling bot does not. */
  hp: string;
}

export const EMPTY_ENQUIRY: EnquiryPayload = {
  lookingFor: [],
  lookingForOther: "",
  businessType: null,
  businessTypeOther: "",
  budget: null,
  timing: null,
  name: "",
  business: "",
  phone: "",
  email: "",
  instagram: "",
  website: "",
  anythingElse: "",
  hp: "",
};

export type EnquiryFieldErrors = Partial<
  Record<"name" | "business" | "phone" | "email", string>
>;

export type EnquiryResult =
  | { ok: true }
  | { ok: false; message: string; fields?: EnquiryFieldErrors };

/** Turns option ids back into the words the person read. */
export function labelFor(options: EnquiryOption[], id: string | null): string | null {
  if (!id) return null;
  const found = options.find((o) => o.id === id);
  return found ? `${found.title} — ${found.description}` : null;
}

export function labelsFor(options: EnquiryOption[], ids: string[]): string[] {
  return ids.map((id) => labelFor(options, id)).filter((l): l is string => l !== null);
}

/**
 * Deliberately loose. This only has to catch a typo in an OPTIONAL
 * field — anything stricter starts rejecting addresses that work, and
 * we would rather have a slightly odd address to try than turn a real
 * enquiry away over a full stop.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

/**
 * Enough digits to be a phone number, in any of the shapes people
 * write them: 07700 900123, +44 7700 900123, (0161) 496 0000.
 */
export function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

/**
 * Every answer, in the words the person read, ready to be the lead's
 * notes.
 *
 * Anything typed into an "Other" line is kept verbatim and labelled as
 * their own words — it is usually the most useful sentence in the
 * whole enquiry, and it should not look like something we offered.
 */
export function describeAnswers(p: EnquiryPayload): string {
  const lines: string[] = ["Website enquiry", ""];

  const wants = labelsFor(LOOKING_FOR, p.lookingFor);
  if (wants.length > 0 || p.lookingForOther.trim()) {
    lines.push("Looking for:");
    for (const w of wants) lines.push(`  - ${w}`);
    if (p.lookingForOther.trim()) lines.push(`  - In their words: ${p.lookingForOther.trim()}`);
    lines.push("");
  }

  const type = labelFor(BUSINESS_TYPE, p.businessType);
  if (type || p.businessTypeOther.trim()) {
    lines.push("Business:");
    if (type) lines.push(`  - ${type}`);
    if (p.businessTypeOther.trim()) lines.push(`  - In their words: ${p.businessTypeOther.trim()}`);
    lines.push("");
  }

  const budget = labelFor(BUDGET, p.budget);
  if (budget) lines.push(`Monthly budget: ${budget}`, "");

  const timing = labelFor(TIMING, p.timing);
  if (timing) lines.push(`Wants to start: ${timing}`, "");

  const contact: string[] = [];
  if (p.instagram.trim()) contact.push(`Instagram: ${p.instagram.trim()}`);
  if (p.website.trim()) contact.push(`Website: ${p.website.trim()}`);
  if (contact.length > 0) lines.push(...contact, "");

  if (p.anythingElse.trim()) lines.push("Anything else:", p.anythingElse.trim(), "");

  lines.push(`Sent ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}`);

  return lines.join("\n").trim();
}
