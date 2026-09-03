import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PlannerContent } from "@/lib/planner/content";

// Phase 9: "Content Hub" isn't a table of its own — it's a curated,
// read-only slice of the same `planners.content` jsonb the full
// 90-Day Plan (/app/portal/plan) renders, pulled out because a client
// checking in day-to-day cares about "what's our content strategy"
// and "what's being made right now" far more often than the full
// planner document (branding details, internal workflow steps,
// production timeline, etc). Interpreting the brief this way since
// there's no separate schema for it; picked content pillars (the
// strategy) and the slot planner's items (the concrete videos in
// production) as the two sections that best match what "Content Hub"
// would mean to a client, and left the rest of the planner to the
// dedicated 90-Day Plan page.
export default async function PortalContentHubPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).single();

  if (!profile?.client_id) {
    return null; // see PortalLayout
  }

  // Same double-check PlannerDocument's requirePublished path makes
  // (Phase 7): "planners: client read own published" RLS (Phase 3)
  // already blocks a draft planner from ever coming back to a client
  // session, this filter just keeps that guarantee explicit here too
  // instead of relying solely on the policy underneath it.
  const { data: planner } = await supabase
    .from("planners")
    .select("content")
    .eq("client_id", profile.client_id)
    .eq("status", "published")
    .maybeSingle();

  if (!planner) {
    return (
      <main style={{ padding: "40px 32px", maxWidth: 1040, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 24px" }}>
          Content Hub
        </h1>
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          Your content plan isn't published yet — check back soon.
        </p>
      </main>
    );
  }

  const content = planner.content as unknown as PlannerContent;

  return (
    <main style={{ padding: "40px 32px", maxWidth: 1040, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 24px" }}>
        Content Hub
      </h1>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>
          Content pillars
        </h2>
        {content.pillars.items.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
            No content pillars defined yet.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {content.pillars.items.map((pillar) => (
              <div
                key={pillar.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "16px 18px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>{pillar.name}</h3>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: pillar.color || "var(--text-2)" }}>
                    {pillar.pct}%
                  </span>
                </div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)", margin: "0 0 10px" }}>
                  {pillar.subtitle}
                </p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-2)", margin: "0 0 12px" }}>
                  {pillar.description}
                </p>
                {pillar.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {pillar.tags.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          textTransform: "uppercase",
                          color: "var(--text-2)",
                          border: "1px solid var(--border)",
                          borderRadius: 20,
                          padding: "3px 9px",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>
          Videos in production
        </h2>
        {content.slots.items.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
            No videos scheduled yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {content.slots.items.map((slot, i) => (
              <li
                key={slot.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
                    {slot.title}
                  </div>
                  {slot.description && (
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)" }}>{slot.description}</div>
                  )}
                </div>
                {slot.pillar && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      textTransform: "uppercase",
                      color: "var(--text-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 20,
                      padding: "3px 9px",
                      flexShrink: 0,
                    }}
                  >
                    {slot.pillar}
                  </span>
                )}
                {slot.link && (
                  <a
                    href={slot.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-1)", textDecoration: "none", flexShrink: 0 }}
                  >
                    Watch →
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
