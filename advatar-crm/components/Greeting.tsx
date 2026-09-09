"use client";

import { useEffect, useState } from "react";

/**
 * "Good morning / afternoon / evening", from the reader's own clock.
 *
 * Deliberately a client component. The server renders in whatever
 * timezone Vercel's region happens to be in, which for a UK agency is
 * usually UTC — close enough in winter, an hour out in summer, and
 * plainly wrong for anyone travelling. The device knows the real
 * answer.
 *
 * The first paint uses the server's hour so the text isn't blank or
 * jumping on load; `useEffect` then corrects it to local time if the
 * two disagree. In the common case they agree and nothing visibly
 * changes.
 */
export function Greeting({
  name,
  serverHour,
}: {
  name?: string | null;
  /** The server's current hour, so SSR and first paint match. */
  serverHour: number;
}) {
  const [hour, setHour] = useState(serverHour);

  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  const part = greetingFor(hour);

  return <>{name ? `${part}, ${name}` : part}</>;
}

/**
 * Exported so a server component can produce the same wording without
 * mounting the client component — e.g. in a page <title>.
 *
 * Boundaries: morning to 12, afternoon to 18, evening after. "Good
 * evening" at 6pm reads right; "good afternoon" at 7pm does not.
 */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
