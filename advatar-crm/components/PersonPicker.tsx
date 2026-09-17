"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface Person {
  id: string;
  name: string;
  /** Empty groups everything under one list — used for clients. */
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  operations_manager: "Operations",
  staff: "Staff",
  videographer: "Videographer",
};

/**
 * "Whose calendar am I looking at?" for CEO and operations managers.
 *
 * The choice is a query parameter rather than component state so the
 * page can be a server component that fetches only the rows it needs —
 * and so a particular person's week is a link somebody can send.
 *
 * Everyone else never sees this: their page fetches their own rows and
 * there is nothing to pick between.
 */
export function PersonPicker({
  people,
  selected,
  label = "Whose calendar",
  allLabel = "Everyone",
  allValue = "",
  param = "person",
}: {
  people: Person[];
  /** The person's id, or `allValue` for everyone. */
  selected: string;
  label?: string;
  allLabel?: string;
  /**
   * What "everyone" puts in the URL. Empty (the default) removes the
   * parameter; pages that default to *you* rather than everyone pass
   * a sentinel like "all" so the two states stay distinguishable.
   */
  allValue?: string;
  /**
   * Which query parameter this picker owns. The Calendar tab carries
   * two — one for whose diary, one for which client — and they filter
   * independently, so they cannot share a parameter.
   */
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function choose(id: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (id) params.set(param, id);
    else params.delete(param);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname ?? "");
  }

  // Grouped so a team of twenty doesn't become one undifferentiated
  // list — you nearly always know the role of the person you want.
  // Entries with no role (clients) fall into a single ungrouped list,
  // since "client" is the only thing they could be.
  const grouped = people.some((p) => p.role);
  const byRole = new Map<string, Person[]>();
  for (const p of people) {
    if (!byRole.has(p.role)) byRole.set(p.role, []);
    byRole.get(p.role)!.push(p);
  }

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        {label}
      </span>
      <select
        value={selected}
        onChange={(e) => choose(e.target.value)}
        style={{
          padding: "8px 11px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text-1)",
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          minWidth: 180,
        }}
      >
        <option value={allValue}>{allLabel}</option>
        {grouped
          ? Array.from(byRole.entries()).map(([role, group]) => (
              <optgroup key={role} label={ROLE_LABEL[role] ?? role}>
                {group.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))
          : people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
      </select>
    </label>
  );
}
