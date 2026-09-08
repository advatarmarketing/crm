import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SopChecklist } from "@/components/SopChecklist";
import { loadSopsWithChecklists } from "@/lib/sops";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * SOPs and tutorials, presented as checklists to work through while
 * editing.
 *
 * Open to videographers and staff — each sees what's aimed at their
 * own role plus anything marked for everyone, which `resources`' RLS
 * (0018) already enforces; the audience filter in the loader just
 * keeps the page to one tab's worth.
 *
 * The ticks are personal (0021): your progress through an SOP is your
 * working state for the video you're on, so the same checklist can be
 * used by two people at once, and "Uncheck all" resets only your own.
 */
export default async function GuidelinesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role?: string } | null)?.role as ProfileRole | undefined;

  if (!role || role === "client") {
    redirect("/login");
  }

  // Management sees the videographer set here, since that's what this
  // page is for — they manage the content itself from a
  // videographer's admin page.
  const audience = role === "staff" ? "staff" : "videographer";

  const sops = await loadSopsWithChecklists(supabase, user.id, audience);

  const withSteps = sops.filter((s) => s.steps.length > 0);
  const reference = sops.filter((s) => s.steps.length === 0);

  return (
    <main className="page page-xs">
      <h1 className="page-title" style={{ marginBottom: 6 }}>
        Guidelines
      </h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 28px", lineHeight: 1.6 }}>
        Work through these while you edit. Your ticks are yours alone — nobody
        else sees them — and each checklist has an <strong>Uncheck all</strong>{" "}
        button so you can reuse it on the next video.
      </p>

      {sops.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-3)" }}>
          No guidelines have been added yet. Your account manager adds them from
          the Videographers area.
        </p>
      ) : (
        <>
          {withSteps.length > 0 && (
            <section style={{ marginBottom: 36 }}>
              <h2 style={heading}>Checklists</h2>
              <p style={eyebrow}>Tick as you go</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {withSteps.map((sop, i) => (
                  <SopChecklist key={sop.id} sop={sop} userId={user.id} defaultOpen={i === 0} />
                ))}
              </div>
            </section>
          )}

          {reference.length > 0 && (
            <section>
              <h2 style={heading}>Reference</h2>
              <p style={eyebrow}>No steps to tick — read or watch</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reference.map((sop) => (
                  <SopChecklist key={sop.id} sop={sop} userId={user.id} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const heading = {
  fontFamily: "var(--font-display)",
  fontSize: 22,
  margin: "0 0 4px",
};

const eyebrow = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-3)",
  margin: "0 0 14px",
};
