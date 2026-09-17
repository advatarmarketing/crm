import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SopChecklist } from "@/components/SopChecklist";
import { SectionTabs, type SectionTab } from "@/components/SectionTabs";
import { ResourcesPanel, type ResourceEntry, type AudienceChoice } from "@/components/ResourcesPanel";
import { loadSopsWithChecklists } from "@/lib/sops";
import { EmptyState } from "@/components/EmptyState";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const MANAGEMENT: ProfileRole[] = ["ceo", "operations_manager"];

/**
 * Tools — everything the team needs to do the work, in two halves.
 *
 *   Guidelines — SOPs and tutorials with steps to tick through. The
 *                ticks are personal (0021): your progress is your
 *                working state for the video you're on, so two people
 *                can use the same checklist at once and "Uncheck all"
 *                resets only your own.
 *   Resources  — reference material with nothing to tick. Links,
 *                templates, notes. Read it, don't work through it.
 *
 * The split is by whether an item has checklist steps, not by a flag
 * somebody has to remember to set: an SOP with steps IS a checklist,
 * and one without is reference. Add steps to a resource and it moves
 * across on the next load, which is the behaviour you'd want.
 *
 * Everyone on the team gets this page. Management additionally gets
 * the editing controls (prompt 5), so a new SOP is a form rather than
 * a code change — and they see every audience, since they are writing
 * for the whole team rather than reading their own slice.
 */
export default async function ToolsPage() {
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

  const canManage = MANAGEMENT.includes(role);

  // What a reader sees is their own slice. Management reads the whole
  // library, because they are maintaining it — `resources`' RLS (0018)
  // allows them that already, so this only decides which audience the
  // loader asks for.
  const audience = role === "staff" ? "staff" : role === "operations_manager" ? "operations_manager" : "videographer";

  const sops = await loadSopsWithChecklists(supabase, user.id, canManage ? null : audience);

  const withSteps = sops.filter((s) => s.steps.length > 0);
  const reference = sops.filter((s) => s.steps.length === 0);

  const audienceChoices: AudienceChoice[] = [
    { value: "all", label: "Everyone" },
    { value: "videographer", label: "Videographers" },
    { value: "staff", label: "Staff" },
    { value: "operations_manager", label: "Ops managers" },
  ];

  const toEntries = (list: typeof sops): ResourceEntry[] =>
    list.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      url: s.url,
      body: s.body,
      audience_role: (s as unknown as { audience_role?: string }).audience_role ?? "all",
      assigned_to: null,
      steps: s.steps.map((step) => ({ id: step.id, text: step.text, position: step.position })),
    }));

  const guidelines = (
    <>
      {withSteps.length === 0 ? (
        <EmptyState
          title="No checklists yet"
          body={
            canManage
              ? "Add an SOP below, then give it steps — those steps become the checklist everyone works through."
              : "Your account manager adds SOPs from the Tools page. Once they do, they appear here as checklists you can work through."
          }
          compact
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {withSteps.map((sop, i) => (
            <SopChecklist key={sop.id} sop={sop} userId={user.id} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {canManage && (
        <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--border)" }}>
          <div className="section-head">
            <h3 className="section-title" style={{ fontSize: 18 }}>
              Manage the checklists
            </h3>
            <p className="section-sub">Add, edit, reorder — no code change needed</p>
          </div>
          <ResourcesPanel
            initialResources={toEntries(withSteps)}
            editable
            audienceChoices={audienceChoices}
            addLabel="+ Add a checklist"
          />
        </div>
      )}
    </>
  );

  const resources = (
    <>
      {reference.length === 0 ? (
        <EmptyState
          title="Nothing filed here yet"
          body={
            canManage
              ? "Use this for the things that aren't a checklist — brand assets, a price list, the kit inventory, a link to the shared drive."
              : "Reference material — links, templates and notes — appears here once your account manager adds it."
          }
          compact
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reference.map((sop) => (
            <SopChecklist key={sop.id} sop={sop} userId={user.id} />
          ))}
        </div>
      )}

      {canManage && (
        <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--border)" }}>
          <div className="section-head">
            <h3 className="section-title" style={{ fontSize: 18 }}>
              Manage the resources
            </h3>
            <p className="section-sub">Links, templates and notes</p>
          </div>
          {/* withChecklists is off here on purpose: adding steps to
              something in this half would move it into Guidelines on
              the next load, which is confusing to do by accident. Add
              it as a checklist over there instead. */}
          <ResourcesPanel
            initialResources={toEntries(reference)}
            editable
            audienceChoices={audienceChoices}
            defaultKind="other"
            withChecklists={false}
            addLabel="+ Add a resource"
          />
        </div>
      )}
    </>
  );

  const tabs: SectionTab[] = [
    {
      key: "guidelines",
      label: "Guidelines",
      blurb: canManage
        ? "SOPs and tutorials with steps. Everyone ticks their own copy — you see the checklist, not their progress."
        : "Work through these while you edit. Your ticks are yours alone, and each one has an Uncheck all button so you can reuse it on the next video.",
      content: guidelines,
    },
    {
      key: "resources",
      label: "Resources",
      blurb: "Reference material — links, templates and notes. Nothing to tick off.",
      content: resources,
    },
  ];

  return (
    <main className="page page-sm">
      <h1 className="page-title page-title-accent">Tools</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 26px", lineHeight: 1.6, maxWidth: "62ch" }}>
        Everything you need to do the work: the checklists you follow, and the
        reference material behind them.
      </p>

      <SectionTabs tabs={tabs} />
    </main>
  );
}
