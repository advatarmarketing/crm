import type { EventCategory, ScheduleEntry } from "./SchedulePanel";

// A literal, not a token: this value gets an alpha suffix appended to
// tint a card, and string-concatenating onto a var() produces invalid
// CSS. Mid grey reads acceptably on both themes' grounds.
const FALLBACK_COLOUR = "#8a8a8a";

/**
 * The next few things, as a row of dated cards.
 *
 * A compact companion to the full month grid rather than a smaller
 * copy of it: a month view answers "how busy am I", which is not the
 * question you open your dashboard with. This answers "what's next,
 * and how soon" — so each card leads with the day, and today and
 * tomorrow are named rather than dated.
 *
 * Scrolls sideways rather than wrapping. Six cards in one line stays
 * scannable; six cards in three rows is just the list again.
 */
export function UpcomingStrip({
  events,
  categories,
  limit = 6,
  emptyMessage = "Nothing booked in.",
}: {
  events: ScheduleEntry[];
  categories: EventCategory[];
  limit?: number;
  emptyMessage?: string;
}) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const shown = [...events]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, limit);

  if (shown.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: 0 }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        scrollbarWidth: "none",
        // Room for the cards' own shadow, which a tight overflow box
        // would otherwise clip along the bottom edge.
        padding: "2px 2px 6px",
      }}
    >
      {shown.map((e) => {
        const colour = categoryById.get(e.category_id ?? "")?.colour ?? FALLBACK_COLOUR;
        const when = describeDay(e.starts_at);
        return (
          <article
            key={e.id}
            style={{
              flex: "0 0 auto",
              width: 172,
              padding: "12px 14px",
              border: "1px solid var(--border)",
              borderTop: `3px solid ${colour}`,
              borderRadius: "var(--radius-md)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                // Only today gets the accent. If everything is
                // highlighted, nothing is.
                color: when.isToday ? "var(--accent)" : "var(--text-3)",
                fontWeight: when.isToday ? 700 : 400,
              }}
            >
              {when.label}
            </span>

            <span
              style={{
                display: "block",
                fontFamily: "var(--font-display)",
                fontSize: 19,
                color: "var(--text-1)",
                margin: "4px 0 6px",
                lineHeight: 1.15,
              }}
            >
              {e.all_day ? "All day" : formatTime(e.starts_at)}
            </span>

            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--text-1)",
                lineHeight: 1.4,
                // Two lines, then trail off — a card that grows to fit
                // its title breaks the row's alignment.
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {e.title}
            </span>

            {(e.clientName || e.location) && (
              <span
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-3)",
                  marginTop: 6,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {[e.clientName, e.location].filter(Boolean).join(" · ")}
              </span>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** "Today" and "Tomorrow" beat a date somebody has to work out. */
function describeDay(iso: string): { label: string; isToday: boolean } {
  const day = new Date(iso);
  day.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);

  if (days === 0) return { label: "Today", isToday: true };
  if (days === 1) return { label: "Tomorrow", isToday: false };
  if (days > 1 && days < 7) {
    return { label: day.toLocaleDateString("en-GB", { weekday: "long" }), isToday: false };
  }
  return {
    label: day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    isToday: false,
  };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
