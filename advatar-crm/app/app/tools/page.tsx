import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SopChecklist } from "@/components/SopChecklist";
import { SectionTabs, type SectionTab } from "@/components/SectionTabs";
import { ResourcesPanel, type ResourceEntry, type AudienceChoice } from "@/components/ResourcesPanel";
import { loadSopsWithChecklists } from "@/lib/sops";
import { EmptyState } from "@/components/EmptyState";
import type { ProfileRole } from "@/lib/supabase/types";
import Link from "next/link";
import { GuideSidebar } from "@/components/guides/GuideSidebar";
import { PillarGuide } from "@/components/guides/PillarGuide";
import { TemplateEditor } from "@/components/guides/TemplateEditor";
import { StageSelect } from "@/components/guides/StageSelect";
import { GUIDE_STAGES, guideHref, isStage, loadGuide, loadGuideSidebar, loadTemplates, type GuideStage } from "@/lib/guides";

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
export default async function ToolsPage({
  searchParams = {},
}: {
  searchParams?: { stage?: string; client?: string; pillar?: string; video?: string };
}) {
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

  // 0054: Guidelines are split into Filming and Editing (General holds
  // anything not put in either yet), with every client's content
  // pillars down the side; a pillar opens how to make that kind of video.
  const section: GuideStage | "general" = searchParams.stage === "general" ? "general" : isStage(searchParams.stage) ? searchParams.stage : "filming";
  const stage: GuideStage = section === "general" ? "filming" : section;
  const pickedClient = searchParams.client ?? null;
  const pickedPillar = searchParams.pillar?.trim() || null;
  const [stageRes, sidebar, templates] = await Promise.all([
    supabase.from("resources").select("id, stage"),
    loadGuideSidebar(supabase),
    canManage ? loadTemplates(supabase) : Promise.resolve(null),
  ]);
  const stagesAvailable = !stageRes.error;
  const stageById = new Map(((stageRes.error ? [] : stageRes.data) ?? []).map((r: { id: string; stage: string | null }) => [r.id, r.stage]));
  const sectionOf = (id: string) => (stageById.get(id) as GuideStage | null | undefined) ?? null;
  const inSection = withSteps.filter((s) => (section === "general" ? !sectionOf(s.id) : sectionOf(s.id) === section));
  const generalCount = withSteps.filter((s) => !sectionOf(s.id)).length;
  const guideView = pickedClient && pickedPillar ? await loadGuide(supabase, pickedClient, pickedPillar, stage) : null;

  const sectionLinks = [
    ...GUIDE_STAGES.map((g) => ({
      key: g.id,
      label: g.label,
      href: guideView && pickedClient && pickedPillar ? guideHref(pickedClient, pickedPillar, g.id, searchParams.video) : `/app/tools?stage=${g.id}`,
    })),
    ...(generalCount > 0 || section === "general" ? [{ key: "general", label: `General (${generalCount})`, href: "/app/tools?stage=general" }] : []),
  ];
  const sectionLabel = section === "general" ? "General" : GUIDE_STAGES.find((g) => g.id === section)!.label;

  const guidelines = (
    <>
      <nav className="seg gl-sections" aria-label="Guidelines section">
        {sectionLinks.map((l) => (
          <Link key={l.key} href={l.href} className={l.key === section ? "on" : ""} aria-current={l.key === section ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="gl">
        <aside className="gl-side">
          <GuideSidebar clients={sidebar.clients} stage={stage} selected={{ client: pickedClient, pillar: pickedPillar }} />
        </aside>
        <div className="gl-main">
          {guideView ? (
            <>
              <p style={{ margin: "0 0 14px" }}>
                <Link href={`/app/tools?stage=${section}`}>← All {sectionLabel.toLowerCase()} guidelines</Link>
              </p>
              <PillarGuide key={`${pickedClient}-${pickedPillar}-${stage}`} view={guideView} focusVideo={searchParams.video ?? null} />
            </>
          ) : (
            <>
              <p className="cw-sub" style={{ marginTop: 0 }}>
                {section === "general"
                  ? "Checklists not yet put under Filming or Editing."
                  : `The team's ${sectionLabel.toLowerCase()} checklists. Pick a client's content pillar on the left for how to ${section === "filming" ? "film" : "edit"} that kind of video.`}
              </p>
              {inSection.length === 0 ? (
                <EmptyState
                  title={`No ${sectionLabel.toLowerCase()} checklists yet`}
                  body={
                    canManage
                      ? stagesAvailable
                        ? generalCount > 0 && section !== "general"
                          ? `Add one below, or open General and move an existing checklist here with its Section menu.`
                          : "Add one below, then give it steps. Those steps become the checklist everyone works through."
                        : "Run database update 0054 in Supabase to split the checklists into Filming and Editing."
                      : "Your account manager adds these from the Tools page."
                  }
                  compact
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {inSection.map((sop, i) => (
                    <div key={sop.id} className="gl-sop">
                      <SopChecklist sop={sop} userId={user.id} defaultOpen={i === 0} />
                      {canManage && stagesAvailable && <StageSelect id={sop.id} stage={sectionOf(sop.id)} title={sop.title} />}
                    </div>
                  ))}
                </div>
              )}

              {canManage && (
                <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--border)" }}>
                  <div className="section-head">
                    <h3 className="section-title" style={{ fontSize: 18 }}>
                      Manage the {section === "general" ? "" : `${sectionLabel.toLowerCase()} `}checklists
                    </h3>
                    <p className="section-sub">Add, edit, reorder. No code change needed.</p>
                  </div>
                  <ResourcesPanel
                    key={section}
                    initialResources={toEntries(inSection)}
                    editable
                    audienceChoices={audienceChoices}
                    addLabel={`+ Add a ${section === "general" ? "" : `${sectionLabel.toLowerCase()} `}checklist`}
                    insertDefaults={stagesAvailable && section !== "general" ? { stage: section } : undefined}
                  />
                  {templates && section !== "general" && (
                    <div style={{ marginTop: 20 }}>
                      <TemplateEditor template={templates[section]} label={sectionLabel} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
        ? "Filming and editing checklists, and how to make each client's kind of video. Everyone ticks their own copy."
        : "Filming and editing checklists, and how to make each of your clients' kinds of video. Your ticks are yours alone.",
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
    <main className="page">
      <h1 className="page-title page-title-accent">Tools</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 26px", lineHeight: 1.6, maxWidth: "62ch" }}>
        Everything you need to do the work: the checklists you follow, and the
        reference material behind them.
      </p>

      <SectionTabs tabs={tabs} />
    </main>
  );
}
