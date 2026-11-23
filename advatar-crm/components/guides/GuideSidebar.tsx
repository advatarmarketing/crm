import Link from "next/link";
import { guideHref, samePillar, type GuideStage, type SidebarClient } from "@/lib/guides";

/**
 * Your clients and their content pillars. Picking one opens how to make
 * that kind of video. A dot means the guide for this section is
 * written; a hollow one means it isn't yet.
 */
export function GuideSidebar({
  clients,
  stage,
  selected,
}: {
  clients: SidebarClient[];
  stage: GuideStage;
  selected: { client: string | null; pillar: string | null };
}) {
  return (
    <nav className="gs" aria-label="Your clients and their content pillars">
      <p className="gs-title">Your clients</p>
      {clients.length === 0 && <p className="cw-empty">No clients yet. Once you&rsquo;re on a client, their content pillars appear here.</p>}
      {clients.map((c) => (
        <details key={c.id} className="gs-client" open={selected.client === c.id || (!selected.client && clients.length <= 6)}>
          <summary>
            {c.internal ? <span className="you-badge">YOU</span> : null} {c.name}
            <span className="gs-count">{c.pillars.length}</span>
          </summary>
          {c.pillars.length === 0 ? (
            <p className="gs-none">No content pillars in their plan yet.</p>
          ) : (
            <ul>
              {c.pillars.map((p) => {
                const on = selected.client === c.id && samePillar(selected.pillar, p.name);
                return (
                  <li key={p.name}>
                    <Link href={guideHref(c.id, p.name, stage)} aria-current={on ? "page" : undefined} className={on ? "on" : ""}>
                      <span className="gs-dot" data-has={p.has[stage] || undefined} aria-hidden />
                      {p.name}
                      <span className="sr-only">{p.has[stage] ? " (guide written)" : " (no guide yet)"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      ))}
    </nav>
  );
}
