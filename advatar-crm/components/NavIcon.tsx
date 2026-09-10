/**
 * The nav's icon set.
 *
 * Drawn rather than borrowed, and drawn to one spec so the row reads as
 * a set instead of a ransom note: a 24-unit box, no fill, 1.6 stroke in
 * `currentColor`, round caps and joins, shapes built from straight runs
 * and single-radius corners.
 *
 * That spec is not arbitrary — it is what the icons already in this app
 * use (the notification bell, the burger, the visibility eye in Work
 * Chat), so these sit beside them without looking imported. Inheriting
 * `currentColor` matters too: it means an icon dims and brightens with
 * its label as the active state changes, rather than staying a fixed
 * grey while the text moves.
 *
 * Deliberately not emoji. Emoji render in each platform's own house
 * style — full colour, rounded, Apple's or Google's rather than ours —
 * and would be the one thing in the chrome that belongs to somebody
 * else's brand.
 */
export type NavIconName =
  | "dashboard"
  | "calendar"
  | "todo"
  | "clients"
  | "videographers"
  | "leads"
  | "prospects"
  | "finance"
  | "week"
  | "tools"
  | "messages"
  | "payments"
  | "logins"
  | "work"
  | "portfolio"
  | "portal"
  | "profile"
  | "password"
  | "signout";

const PATHS: Record<NavIconName, JSX.Element> = {
  // Four panes — the shape of a summary screen.
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  // A list with the first line ticked.
  todo: (
    <>
      <path d="M4 7.5l2 2 3.5-3.5" />
      <path d="M4 17l2 2 3.5-3.5" />
      <path d="M13 7.5h7M13 17h7" />
    </>
  ),
  // Two people, one behind the other.
  clients: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.3a3.2 3.2 0 0 1 0 5.4M18 14.9c1.8.7 3 2.5 3 5.1" />
    </>
  ),
  // A cine camera: body, lens, and the tape spool on top.
  videographers: (
    <>
      <rect x="2.5" y="8" width="13" height="10" rx="2" />
      <path d="M15.5 12.2l6-3.2v10l-6-3.2z" />
      <circle cx="6.5" cy="5.5" r="2" />
      <circle cx="11.5" cy="5.5" r="2" />
    </>
  ),
  // A funnel — the pipeline, narrowing.
  leads: <path d="M3 4h18l-7 8v7l-4 2v-9z" />,
  // A conversation with a waveform in it: the recorded call.
  prospects: (
    <>
      <path d="M20.5 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.3-5.4A7.5 7.5 0 1 1 20.5 12.5z" />
      <path d="M9 11v3M12 9v7M15 11.5v2" />
    </>
  ),
  // Bars on a baseline: what came in, month by month. The obvious
  // banknote was tried first and read as a film reel — a rectangle
  // with a circle in the middle of it is a projector, not money.
  finance: (
    <>
      <path d="M3 20.5h18" />
      <path d="M6.75 20.5V12.5M12 20.5V6.5M17.25 20.5V15.5" />
    </>
  ),
  // A clock — this week, at a glance.
  week: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 7v5.4l3.4 2" />
    </>
  ),
  // An open manual: guidelines and the reference behind them.
  tools: (
    <>
      <path d="M12 6.5C10.4 5.2 8.4 4.5 5.5 4.5H3v13h2.5c2.9 0 4.9.7 6.5 2" />
      <path d="M12 6.5c1.6-1.3 3.6-2 6.5-2H21v13h-2.5c-2.9 0-4.9.7-6.5 2z" />
      <path d="M12 6.5v15" />
    </>
  ),
  messages: <path d="M21 11.5a7.7 7.7 0 0 1-8.5 7.7 8.6 8.6 0 0 1-2.6-.6L4 20.5l1.5-4.6A7.5 7.5 0 0 1 12.3 4a7.7 7.7 0 0 1 8.7 7.5z" />,
  // A banknote.
  payments: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h3" />
    </>
  ),
  // A key: who gets in.
  logins: (
    <>
      <circle cx="8" cy="12" r="4.2" />
      <path d="M12.2 12H21M18 12v3.2M15 12v2.4" />
    </>
  ),
  // A clapperboard — work handed in.
  work: (
    <>
      <rect x="2.5" y="9" width="19" height="11.5" rx="2" />
      <path d="M2.9 9l2.4-4.4 4.3-.8-2.4 4.4z" />
      <path d="M9.6 8.2L12 3.8l4.3-.8-2.4 4.4" />
      <path d="M2.5 9h19" />
    </>
  ),
  // A framed picture: finished work on show.
  portfolio: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M3 16l4.5-4.2 4 3.6 3-2.6L21 17" />
    </>
  ),
  // A folder: their project, in one place.
  portal: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  password: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
  signout: (
    <>
      <path d="M9.5 20H5.5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
      <path d="M15.5 8l4 4-4 4M19.5 12H9.5" />
    </>
  ),
};

export function NavIcon({ name, size = 17 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // The label beside it already says what this is, so the icon is
      // decoration as far as a screen reader is concerned.
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
