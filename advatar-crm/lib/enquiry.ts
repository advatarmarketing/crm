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
  /** A small flag sitting on the box. Used sparingly — one per screen. */
  badge?: string;
}

export const LOOKING_FOR: EnquiryOption[] = [
  {
    id: "full_partnership",
    emoji: "🏆",
    title: "Full Marketing Partnership",
    description: "We run your marketing end to end",
    badge: "Best Results & Revenue Booster",
  },
  { id: "social_takeover", emoji: "🚀", title: "Social Media Takeover", description: "Go viral" },
  { id: "video", emoji: "🎥", title: "Video production", description: "High quality content" },
  {
    id: "growth_partner",
    emoji: "🤝",
    title: "Growth Partner",
    description: "Our team becomes your team, with specific goals and specific solutions",
  },
];

export const BUSINESS_TYPE: EnquiryOption[] = [
  { id: "local", emoji: "🏪", title: "Local business", description: "Shop, salon, restaurant" },
  { id: "product", emoji: "🛍️", title: "Product brand", description: "Selling products online" },
  { id: "personal", emoji: "🧑‍💼", title: "Personal brand", description: "Coach, consultant, creator" },
  { id: "charity", emoji: "🤝", title: "Charity", description: "Community or non-profit" },
];

/**
 * The budget screen, which is not one list but three.
 *
 * What somebody is asking for decides what a sensible budget even
 * looks like, so the bands shown are the bands for the work they
 * picked. Nobody is asked to choose "Under £500" for a full
 * partnership, and nobody exploring a Growth Partner is shown £15,000
 * and quietly put off.
 *
 * The ids stay distinct across the three sets on purpose. A band only
 * means something next to the tier it belongs to, and reusing an id
 * would let an answer survive a change of tier and end up describing
 * a band that was never on screen.
 */
export const BUDGET: EnquiryOption[] = [
  { id: "under_500", emoji: "💷", title: "Under £500", description: "Getting started" },
  { id: "500_1500", emoji: "💰", title: "£500 to £1,500", description: "Steady growth" },
  { id: "1500_plus", emoji: "💎", title: "£1,500+", description: "Full service" },
  { id: "unsure", emoji: "🤔", title: "Not sure yet", description: "Let's talk it through" },
];

/** Full Marketing Partnership: £1,500 up to £15,000 a month. */
export const BUDGET_FULL_PARTNERSHIP: EnquiryOption[] = [
  { id: "fp_1500_3000", emoji: "💷", title: "£1,500 to £3,000", description: "Getting started" },
  { id: "fp_3000_6000", emoji: "💰", title: "£3,000 to £6,000", description: "Building momentum" },
  { id: "fp_6000_10000", emoji: "💎", title: "£6,000 to £10,000", description: "Full service" },
  { id: "fp_10000_15000", emoji: "🏆", title: "£10,000 to £15,000", description: "Everything, at pace" },
];

/** Growth Partner: £500 up to £5,000 a month. */
export const BUDGET_GROWTH_PARTNER: EnquiryOption[] = [
  { id: "gp_500_1000", emoji: "💷", title: "£500 to £1,000", description: "Getting started" },
  { id: "gp_1000_2000", emoji: "💰", title: "£1,000 to £2,000", description: "Steady growth" },
  { id: "gp_2000_3500", emoji: "💎", title: "£2,000 to £3,500", description: "Scaling up" },
  { id: "gp_3500_5000", emoji: "🏆", title: "£3,500 to £5,000", description: "Full service" },
];

/**
 * Which set of bands to show, given what they picked on the first
 * screen.
 *
 * The first screen takes one answer, so in practice only one of these
 * can be set. The precedence still matters because this reads a
 * payload, not a screen, and a payload can arrive saying anything.
 * Full Marketing Partnership wins the tie: it is the larger piece of
 * work, and showing the higher bands to somebody who asked for both is
 * the recoverable mistake — a call can bring a number down far more
 * easily than it can raise one after a lower band has been put in
 * front of them.
 */
export function budgetOptionsFor(lookingFor: string[]): EnquiryOption[] {
  if (lookingFor.includes("full_partnership")) return BUDGET_FULL_PARTNERSHIP;
  if (lookingFor.includes("growth_partner")) return BUDGET_GROWTH_PARTNER;
  return BUDGET;
}

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

  // Read back against the same set the person was shown, or a band
  // from one tier would be looked up in another and come back blank.
  const budget = labelFor(budgetOptionsFor(p.lookingFor), p.budget);
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
