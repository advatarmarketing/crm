/**
 * Proposals (0057): what a proposal is made of, and the drafted
 * starting point every new proposal begins from.
 *
 * A proposal is one JSON document (`ProposalContent`), saved on the
 * proposal row and on templates. Every word in it is editable before
 * it's sent. Prices are never stored as totals: they're worked out
 * from the lines (hours x the hourly rate, or a fixed price) by
 * lib/proposals/pricing.ts, on the server, every time.
 *
 * Safe for the browser.
 */

export type PackageId = "essentials" | "growth" | "accelerator";
export const PACKAGE_IDS: PackageId[] = ["essentials", "growth", "accelerator"];

/** Which of the three summary tabs a slide belongs to. */
export type Group = "visuals" | "ads" | "influencer";
export const GROUPS: { id: Group; label: string }[] = [
  { id: "visuals", label: "High Quality Visuals" },
  { id: "ads", label: "Ad Campaigns" },
  { id: "influencer", label: "Influencer Marketing" },
];

export type IconName =
  | "target"
  | "calendar"
  | "camera"
  | "light"
  | "mic"
  | "tripod"
  | "megaphone"
  | "chat"
  | "chart"
  | "spark"
  | "film"
  | "car"
  | "phone"
  | "star"
  | "users"
  | "handshake"
  | "search"
  | "edit"
  | "layers"
  | "print"
  | "clock"
  | "check";
export const ICONS: IconName[] = [
  "target", "calendar", "camera", "light", "mic", "tripod", "megaphone", "chat", "chart", "spark", "film",
  "car", "phone", "star", "users", "handshake", "search", "edit", "layers", "print", "clock", "check",
];

/** A picture or video. An empty `url` shows a placeholder until a Cloudinary link is pasted in. */
export interface Media {
  url: string;
  caption: string;
}

/** A small visual tile: an icon and a few words. */
export interface Point {
  icon: IconName;
  label: string;
}

/**
 * One line of a price breakdown.
 * - "hours": qty x unit hours x the hourly rate. For a plain number of
 *   hours, unit is 1 and unitLabel "hour". For "8 videos at 2 hours
 *   each", qty is 8, unit 2 and unitLabel "video".
 * - "fixed": qty x unit pounds (e.g. a half-day shoot at £300).
 * qty is per package: 0 means that package doesn't include it.
 */
export interface Line {
  id: string;
  label: string;
  mode: "hours" | "fixed";
  unit: number;
  unitLabel: string;
  qty: Record<PackageId, number>;
}

/** Something the client can add on, priced like a line. */
export interface Extra {
  id: string;
  label: string;
  mode: "hours" | "fixed";
  unit: number;
  unitLabel: string;
  max: number;
}

export interface Slide {
  id: string;
  /** Topic slides sell the benefit and carry no price. */
  kind: "topic" | "priced";
  group: Group;
  enabled: boolean;
  /** Short name used on the packages slide and summary, e.g. "Shoots". */
  short: string;
  kicker: string;
  title: string;
  headlines: string[];
  media: Media[];
  points: Point[];
  lines: Line[];
  extras: Extra[];
  /** Suggested monthly ad budget per package. Never added to the total. */
  budget?: Record<PackageId, number> | null;
  /** A small note under the breakdown, e.g. who pays for printing. */
  note?: string;
}

export interface PackageDef {
  id: PackageId;
  name: string;
  tagline: string;
  enabled: boolean;
}

export interface ProposalContent {
  v: 1;
  /** £ per hour for every "hours" line. */
  rate: number;
  /** Discount for paying 3 months upfront, in %. */
  discountPct: number;
  defaultPackage: PackageId;
  packages: PackageDef[];
  intro: { kicker: string; title: string; subtitle: string };
  slides: Slide[];
  summary: { title: string; subtitle: string };
  /** The contract, with {{placeholders}} filled in for each client. */
  contract: string;
}

/** What the client picked. */
export interface Choice {
  package: PackageId;
  plan: "monthly" | "upfront";
  /** "slideId:extraId" -> how many. */
  extras: Record<string, number>;
}

const q = (essentials: number, growth: number, accelerator: number): Record<PackageId, number> => ({ essentials, growth, accelerator });

/** Three placeholder slots with captions, ready for Cloudinary links. */
function slots(...captions: string[]): Media[] {
  return captions.map((caption) => ({ url: "", caption }));
}

export const DEFAULT_CONTRACT = `SERVICE AGREEMENT

Between Advatar ("we", "us") and {{business}} ("you"), contact {{contact}} ({{email}}). Dated {{date}}.

1. WHAT WE'LL DO
We'll deliver the {{package}} package each month, as set out below:
{{breakdown}}

2. PRICE AND PAYMENT
{{plan}}
Payments are made in advance. Prices are in pounds sterling.

3. TERM
The agreement runs for a minimum of 3 months. After that it continues month to month until either of us gives 30 days' written notice.

4. AD SPEND AND PRINTING
Money spent on adverts (for example on Meta, TikTok or Google) is paid by you, directly from your own ad accounts, and isn't part of our price. We propose the budget; you decide it. For posters and leaflets we create and manage them; printing is arranged and paid for by you.

5. SHOOTS
Shoot dates are agreed together. If a shoot is cancelled with less than 48 hours' notice, it counts as used, unless we agree otherwise.

6. APPROVALS
We'll share content for approval before it's posted. Please reply within 3 working days so the plan stays on schedule.

7. YOUR CONTENT
Once paid for, the finished content is yours to use for your business. We may show it in our portfolio unless you ask us not to.

8. CONFIDENTIALITY
We'll keep your logins and business information private and only use them to deliver this work.

By pressing continue after entering your email, you agree to this agreement.`;

export const DEFAULT_MESSAGE = `Hi {{contact}},

Great speaking with you. Here's the proposal we've put together for {{business}}. It takes about 5 minutes to go through, and you can choose the package that suits you at the end:

{{link}}

Any questions, just reply to this email.

Advatar`;

export function defaultContent(): ProposalContent {
  return {
    v: 1,
    rate: 35,
    discountPct: 15,
    defaultPackage: "growth",
    packages: [
      { id: "essentials", name: "Essentials", tagline: "Show up consistently, looking your best.", enabled: true },
      { id: "growth", name: "Growth", tagline: "More content, more reach, ads that bring people in.", enabled: true },
      { id: "accelerator", name: "Accelerator", tagline: "Every channel working together to grow fast.", enabled: true },
    ],
    intro: {
      kicker: "Your proposal",
      title: "Choose how you want to grow",
      subtitle: "Three ways to work with us. Tap one to see what's inside.",
    },
    slides: [
      {
        id: "visuals",
        kind: "topic",
        group: "visuals",
        enabled: true,
        short: "High quality visuals",
        kicker: "High Quality Visuals",
        title: "Premium visuals = premium clients",
        headlines: [
          "Professional video and photo work lifts your brand and status",
          "People judge in seconds. Look like the leader in your space",
          "Content that stops the scroll, and gets remembered",
        ],
        media: slots("Brand film", "Product shoot", "Behind the scenes", "Social campaign", "Portrait series", "Event highlight"),
        points: [
          { icon: "star", label: "Higher perceived value" },
          { icon: "users", label: "Better customers" },
          { icon: "chart", label: "More enquiries" },
        ],
        lines: [],
        extras: [],
      },
      {
        id: "strategy",
        kind: "priced",
        group: "visuals",
        enabled: true,
        short: "Strategy & planning",
        kicker: "Step 1",
        title: "Strategy and planning",
        headlines: ["We're not a come-shoot-go-home service. This is marketing."],
        media: slots("Content plan", "Mood board"),
        points: [
          { icon: "search", label: "Audience & competitor research" },
          { icon: "target", label: "Goals you can measure" },
          { icon: "layers", label: "Content pillars" },
          { icon: "edit", label: "Scripts & hooks" },
          { icon: "calendar", label: "Posting plan" },
          { icon: "chart", label: "Monthly review" },
        ],
        lines: [
          { id: "research", label: "Research & goals", mode: "hours", unit: 1, unitLabel: "hour", qty: q(2, 2, 3) },
          { id: "plan", label: "Content plan & scripts", mode: "hours", unit: 1, unitLabel: "hour", qty: q(2, 3, 4) },
          { id: "review", label: "Monthly review & reporting", mode: "hours", unit: 1, unitLabel: "hour", qty: q(1, 1, 1) },
        ],
        extras: [{ id: "workshop", label: "Extra strategy session", mode: "hours", unit: 2, unitLabel: "session", max: 4 }],
      },
      {
        id: "shooting",
        kind: "priced",
        group: "visuals",
        enabled: true,
        short: "Shoots",
        kicker: "Step 2",
        title: "Shooting the content we planned",
        headlines: ["You show up. We handle everything else."],
        media: slots("On set", "Lighting setup", "Final result"),
        points: [
          { icon: "camera", label: "Professional cameras" },
          { icon: "light", label: "Lighting" },
          { icon: "mic", label: "Audio capture (mics)" },
          { icon: "tripod", label: "Tripods & setup kit" },
          { icon: "film", label: "Directing on the day" },
          { icon: "car", label: "Travel included" },
        ],
        lines: [{ id: "halfday", label: "Half-day shoot (4 hours)", mode: "fixed", unit: 300, unitLabel: "shoot", qty: q(1, 2, 4) }],
        extras: [
          { id: "hour", label: "Extra hour on a shoot", mode: "fixed", unit: 50, unitLabel: "hour", max: 16 },
          { id: "halfday", label: "Extra half-day shoot (4 hours)", mode: "fixed", unit: 300, unitLabel: "shoot", max: 4 },
          { id: "fullday", label: "Extra full-day shoot (8 hours)", mode: "fixed", unit: 600, unitLabel: "shoot", max: 4 },
          { id: "upgrade", label: "Upgrade a half day to a full day", mode: "fixed", unit: 300, unitLabel: "shoot", max: 4 },
        ],
        note: "Half-day shoots are £250 to £350 and full days £500 to £700, depending on location and setup.",
      },
      {
        id: "editing",
        kind: "priced",
        group: "visuals",
        enabled: true,
        short: "Edited videos",
        kicker: "Step 3",
        title: "High quality edits",
        headlines: ["Every second earns its place", "Edited for each platform, built to be watched to the end"],
        media: slots("Reel", "TikTok", "Photo set"),
        points: [
          { icon: "film", label: "Pacing & hooks" },
          { icon: "spark", label: "Colour grading" },
          { icon: "chat", label: "Captions & subtitles" },
          { icon: "mic", label: "Sound design" },
        ],
        lines: [
          { id: "short", label: "Short-form videos (Reels / TikToks)", mode: "hours", unit: 2, unitLabel: "video", qty: q(4, 8, 12) },
          { id: "photos", label: "Photo selection & retouching", mode: "hours", unit: 1, unitLabel: "hour", qty: q(1, 2, 3) },
        ],
        extras: [
          { id: "video", label: "Extra short-form video", mode: "hours", unit: 2, unitLabel: "video", max: 12 },
          { id: "long", label: "Long-form video (up to 5 minutes)", mode: "hours", unit: 5, unitLabel: "video", max: 4 },
        ],
        note: "Edits are billed by the hour, worked out from the plan.",
      },
      {
        id: "social",
        kind: "priced",
        group: "visuals",
        enabled: true,
        short: "Social media management",
        kicker: "Step 4",
        title: "Social media management",
        headlines: ["Your accounts, active and answered, every day"],
        media: slots("Posting schedule", "Community replies"),
        points: [
          { icon: "calendar", label: "Posting schedule" },
          { icon: "phone", label: "Posting for you" },
          { icon: "chat", label: "Replying to comments & DMs" },
          { icon: "users", label: "Community building" },
          { icon: "chart", label: "Monthly insights" },
        ],
        lines: [
          { id: "posting", label: "Posting & scheduling", mode: "hours", unit: 1, unitLabel: "hour", qty: q(3, 4, 6) },
          { id: "community", label: "Replying to comments & DMs", mode: "hours", unit: 1, unitLabel: "hour", qty: q(3, 6, 8) },
          { id: "insights", label: "Monthly insights report", mode: "hours", unit: 1, unitLabel: "hour", qty: q(1, 1, 2) },
        ],
        extras: [{ id: "community", label: "Extra hour of comments & DMs", mode: "hours", unit: 1, unitLabel: "hour", max: 20 }],
      },
      {
        id: "ads",
        kind: "topic",
        group: "ads",
        enabled: true,
        short: "Ad campaigns",
        kicker: "Ad Campaigns",
        title: "Put your best content in front of the right people",
        headlines: ["Reach customers who've never heard of you", "Every pound tracked, every week improved"],
        media: slots("Meta ad", "TikTok ad", "Google search", "Poster"),
        points: [
          { icon: "target", label: "Precise targeting" },
          { icon: "chart", label: "Measurable results" },
          { icon: "megaphone", label: "Faster growth" },
        ],
        lines: [],
        extras: [],
      },
      ...adSlide("meta", "Meta ads", "Facebook & Instagram", q(0, 2, 2), q(0, 4, 4), q(0, 2, 3), q(0, 300, 500)),
      ...adSlide("tiktok", "TikTok ads", "TikTok", q(0, 0, 2), q(0, 0, 4), q(0, 0, 3), q(0, 0, 300)),
      ...adSlide("google", "Google ads", "Google search & YouTube", q(0, 0, 2), q(0, 0, 3), q(0, 0, 2), q(0, 0, 300)),
      {
        id: "physical",
        kind: "priced",
        group: "ads",
        enabled: true,
        short: "Posters & leaflets",
        kicker: "Ad Campaigns",
        title: "Physical ads: posters and leaflets",
        headlines: ["Be seen on the street, not just the screen"],
        media: slots("Poster", "Leaflet"),
        points: [
          { icon: "print", label: "Print-ready designs" },
          { icon: "target", label: "Where to place them" },
          { icon: "chart", label: "Tracked with QR codes" },
        ],
        lines: adLines(q(0, 0, 2), q(0, 0, 3), q(0, 0, 1)),
        extras: [{ id: "design", label: "Extra design", mode: "hours", unit: 2, unitLabel: "design", max: 6 }],
        budget: null,
        note: "We create and manage them. Printing is arranged and paid for by you.",
      },
      {
        id: "influencer",
        kind: "topic",
        group: "influencer",
        enabled: true,
        short: "Influencer marketing",
        kicker: "Influencer Marketing",
        title: "Borrow trust from people your customers already follow",
        headlines: ["Real people, real recommendations", "Reach new audiences overnight"],
        media: slots("Creator collab", "Unboxing", "Story takeover"),
        points: [
          { icon: "users", label: "New audiences" },
          { icon: "star", label: "Instant credibility" },
          { icon: "film", label: "Content you can reuse" },
        ],
        lines: [],
        extras: [],
      },
      {
        id: "influencer_work",
        kind: "priced",
        group: "influencer",
        enabled: true,
        short: "Influencer campaigns",
        kicker: "Influencer Marketing",
        title: "Sourcing, deal-making and managing",
        headlines: ["We find them, sign them and make sure they deliver"],
        media: slots("Shortlist", "Campaign live"),
        points: [
          { icon: "search", label: "Sourcing the right creators" },
          { icon: "handshake", label: "Deal-making" },
          { icon: "check", label: "Managing delivery" },
        ],
        lines: [
          { id: "sourcing", label: "Sourcing", mode: "hours", unit: 1, unitLabel: "hour", qty: q(0, 0, 4) },
          { id: "deals", label: "Deal-making", mode: "hours", unit: 1, unitLabel: "hour", qty: q(0, 0, 3) },
          { id: "managing", label: "Managing", mode: "hours", unit: 1, unitLabel: "hour", qty: q(0, 0, 4) },
        ],
        extras: [{ id: "creator", label: "Extra creator", mode: "hours", unit: 3, unitLabel: "creator", max: 6 }],
        note: "Any fee a creator charges is agreed with you first and paid separately.",
      },
    ],
    summary: { title: "Your plan", subtitle: "Everything together, in one monthly price." },
    contract: DEFAULT_CONTRACT,
  };
}

function adLines(strategy: Record<PackageId, number>, running: Record<PackageId, number>, optimising: Record<PackageId, number>): Line[] {
  return [
    { id: "strategy", label: "Strategy", mode: "hours", unit: 1, unitLabel: "hour", qty: strategy },
    { id: "running", label: "Running the ads", mode: "hours", unit: 1, unitLabel: "hour", qty: running },
    { id: "optimising", label: "Optimising afterwards", mode: "hours", unit: 1, unitLabel: "hour", qty: optimising },
  ];
}

function adSlide(
  id: string,
  title: string,
  where: string,
  strategy: Record<PackageId, number>,
  running: Record<PackageId, number>,
  optimising: Record<PackageId, number>,
  budget: Record<PackageId, number>
): Slide[] {
  return [
    {
      id,
      kind: "priced",
      group: "ads",
      enabled: true,
      short: title,
      kicker: "Ad Campaigns",
      title,
      headlines: [`Campaigns on ${where}, planned, run and improved every week`],
      media: slots(`${title}: example 1`, `${title}: example 2`),
      points: [
        { icon: "target", label: "Strategy & targeting" },
        { icon: "megaphone", label: "Running the ads" },
        { icon: "chart", label: "Optimising for results" },
      ],
      lines: adLines(strategy, running, optimising),
      extras: [{ id: "campaign", label: "Extra campaign", mode: "hours", unit: 4, unitLabel: "campaign", max: 4 }],
      budget,
      note: "Ad spend is paid by you, directly from your own account. It isn't part of our price.",
    },
  ];
}
