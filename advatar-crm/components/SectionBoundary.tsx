"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Keeps one broken section from taking a whole page with it.
 *
 * The client pages already settle every QUERY separately, so a table
 * that doesn't exist or a policy that says no costs one section and
 * nothing else. This is the other half of that: a component that
 * THROWS while rendering — on a row shaped differently from what it
 * expects, a null where it assumed an array — was still enough to
 * blank the entire page, because a render error walks straight past
 * the query handling and out to the route's error boundary.
 *
 * That is what a videographer hit opening a client: the page itself
 * was fine, one panel inside it was not, and the whole thing came
 * back as "that page didn't load".
 *
 * Has to be a class — componentDidCatch has no hook equivalent, and
 * this is the one place in the app that needs it.
 */
export class SectionBoundary extends Component<
  {
    /** Named in the message, e.g. "brand kit". */
    what: string;
    /** Added to the log line so a report can be traced to a record. */
    context?: string;
    children: ReactNode;
  },
  { message: string | null }
> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "Unknown error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged rather than swallowed: on the server this lands in the
    // hosting logs, where it is the difference between "a page broke"
    // and a stack naming the component and the record.
    console.error(
      `[section] ${this.props.what} failed${this.props.context ? ` for ${this.props.context}` : ""}`,
      error,
      info.componentStack
    );
  }

  render() {
    if (this.state.message === null) return this.props.children;

    return (
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--danger-fg)",
          background: "var(--danger-bg)",
          border: "1px solid var(--danger-border)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 14px",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        The {this.props.what} couldn&rsquo;t be shown. Everything else on this
        page still works.
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            marginTop: 6,
            opacity: 0.85,
          }}
        >
          {this.state.message}
        </span>
      </p>
    );
  }
}
