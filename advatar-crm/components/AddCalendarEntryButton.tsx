"use client";

/**
 * The + at the top of the Calendar tab.
 *
 * It does not own the form — SchedulePanel further down the page does,
 * and that panel already knows how to add an entry. This tells it to
 * open, scroll itself into view and take the cursor, through a custom
 * DOM event. A prop would mean lifting the form's state up through a
 * server component, which cannot hold it.
 */
export function AddCalendarEntryButton({ disabledReason }: { disabledReason?: string }) {
  const disabled = Boolean(disabledReason);

  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={disabled}
      title={disabledReason ?? "Add something to the calendar"}
      aria-label="Add something to the calendar"
      onClick={() => document.dispatchEvent(new CustomEvent("advatar:add-calendar-entry"))}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add
    </button>
  );
}
