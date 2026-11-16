import type { ReactNode } from "react";

/**
 * A template, unlike a layout, is mounted afresh on every navigation,
 * which is what lets each page ease in (see .page-enter in
 * globals.css). The nav above it lives in the layout and does not
 * move.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
