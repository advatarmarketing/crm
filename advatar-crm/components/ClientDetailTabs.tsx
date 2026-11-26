"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AvatarUpload } from "./AvatarUpload";
import { ClientInfoForm } from "./ClientInfoForm";
import { ClientFinanceField, type BillingFrequency } from "./ClientFinanceField";
import { DocumentsList } from "./DocumentsList";
import { TaskList } from "./TaskList";
import { PlannerDocument } from "./PlannerDocument";
import { AssignedTeamPanel, type AssignedTeamMember, type AssignableProfile } from "./AssignedTeamPanel";
import { BrandKitPanel } from "./BrandKitPanel";
import { emptyBrandKit, type BrandKit } from "@/lib/brand-kit";
import { ClientTeamThread, type TeamMessage } from "./ClientTeamThread";
import { ClientFinancePanel, type ClientInvoice } from "./ClientFinancePanel";
import { DocumentUpload } from "./DocumentUpload";
import { FathomLinkPanel, type LinkedMeeting } from "./FathomLinkPanel";
import { ActivityTimeline, type ActivityEntry } from "./ActivityTimeline";
import { ClientCalendarPanel } from "./ClientCalendarPanel";
import { OnboardingChecklist, type ChecklistItem, type TemplateOption } from "./OnboardingChecklist";
import { CredentialsPanel } from "./CredentialsPanel";
import { PackagePanel } from "./PackagePanel";
import { VideoSchedule } from "./videos/VideoSchedule";
import { PerformancePanel } from "./performance/PerformancePanel";
import { ClientAccountPanel } from "./ClientAccountPanel";
import type { ClientPackage, PackagePreset } from "@/lib/packages";
import type { Gap } from "@/lib/onboarding/gaps";
import type { CredentialSummary } from "@/app/app/clients/[id]/credential-actions";
import type { Database } from "@/lib/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Document = Database["public"]["Tables"]["documents"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

const TABS = [
  // 0053: what needs doing for this client, and when. First, because
  // it's what you open a client to find out.
  { id: "dashboard", label: "Dashboard" },
  { id: "info", label: "Info" },
  // 0041: what this client gets and when we post. Everything the
  // client later sees — review buttons, extras, the video schedule —
  // is decided from here.
  { id: "package", label: "Package" },
  // 0042: the video schedule — every video going out, by date.
  { id: "videos", label: "Videos" },
  // 0046: how the posted videos did, and the reports made from that.
  { id: "performance", label: "Performance" },
  { id: "plan", label: "Content Plan" },
  // 0053: the script library; a script can be put on a planned video.
  { id: "scripts", label: "Scripts" },
  // Only rendered for the people 0039 lets near a login — management
  // and assigned staff. A videographer who typed ?tab=passwords
  // would land on Info, and would see an empty list even if they
  // didn't, because the table is empty for them.
  { id: "passwords", label: "Passwords" },
  // Sits beside the plan because it is the half of the plan that has
  // dates on it. The shooting schedule that used to be typed into the
  // content plan was removed in favour of this: a booking that can be
  // moved, that the client sees in their portal, and that raises a
  // notification, rather than a paragraph about weeks.
  { id: "calendar", label: "Calendar" },
  { id: "activity", label: "Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ClientDetailTabs({
  client,
  socialPanel,
  dashboardPanel,
  scriptsPanel,
  documents,
  tasks,
  monthlyValue,
  initialTab = "info",
  teamMembers,
  assignableProfiles,
  canAssign = false,
  assignScope = "everyone",
  invoices = [],
  meetings = [],
  activity = [],
  checklist = [],
  templates = [],
  finance,
  brandKit,
  teamMessages = [],
  currentUserId = null,
  credentials = [],
  canSeeCredentials = false,
  canSeeDocuments = true,
  credentialsAvailable = false,
  credentialsKeyProblem = null,
  suggestedCredentialsKey = "",
  isCeo = false,
  clientPackage = null,
  packagePresets = [],
  packageAvailable = false,
  canEditPackage = false,
  canEditVideos = false,
  canApproveVideos = false,
  account = null,
  gaps = null,
  justAdded = false,
  notSaved = [],
}: {
  client: Client;
  documents: Document[];
  tasks: Task[];
  monthlyValue: number | null | undefined; // undefined = no client_finance row visible (staff)
  initialTab?: TabId;
  teamMembers: AssignedTeamMember[];
  assignableProfiles: AssignableProfile[];
  /** CEO, or an operations manager on their own client (0024/0027). */
  canAssign?: boolean;
  /** "workers" narrows the wording to what a manager may actually do. */
  assignScope?: "everyone" | "workers";
  /**
   * Phase 14. Empty for anyone whose RLS can't read `invoices`
   * (staff, videographer) — the Finance section below is simply not
   * rendered in that case, rather than gated on a role check here.
   */
  invoices?: ClientInvoice[];
  /** Phase 15: meetings attached to this client, newest first. */
  meetings?: LinkedMeeting[];
  /** Phase 21: the brand kit, editable here (0020 gives management
   * and assigned staff write access; videographers only read it). */
  brandKit?: BrandKit | null;
  /** Phase 21: the internal thread — never visible to the client. */
  teamMessages?: TeamMessage[];
  currentUserId?: string | null;
  /** Phase 15: this client's history, newest first. */
  activity?: ActivityEntry[];
  /** Phase 17: onboarding steps for this client. */
  checklist?: ChecklistItem[];
  /** Phase 17: task templates available to apply. */
  templates?: TemplateOption[];
  /** 0039: this client's social media logins. Never the passwords
   * themselves — only what each row is for, and whether a password is
   * saved on it. */
  credentials?: CredentialSummary[];
  /** Management and assigned staff. False hides the tab outright. */
  canSeeCredentials?: boolean;
  /** 0044: staff whose Contracts switch is off see no Documents section. */
  canSeeDocuments?: boolean;
  /** False until database update 0039 has been run. */
  credentialsAvailable?: boolean;
  credentialsKeyProblem?: "missing" | "too-short" | null;
  suggestedCredentialsKey?: string;
  isCeo?: boolean;
  /** 0041: null when nobody has set this client's package yet. */
  clientPackage?: ClientPackage | null;
  packagePresets?: PackagePreset[];
  /** False until database update 0041 has been run. */
  packageAvailable?: boolean;
  canEditPackage?: boolean;
  /** Management on this client and assigned staff (0042). */
  canEditVideos?: boolean;
  /** CEO and operations: approving a video is what sends it to the client (0060). */
  canApproveVideos?: boolean;
  /** What is still missing (lib/onboarding/gaps.ts); null for anyone who can't fill it in. */
  gaps?: Gap[] | null;
  /** Arrived straight from adding the client. */
  justAdded?: boolean;
  /** Parts of adding the client that failed to save. */
  notSaved?: string[];
  /** The client's social results dashboard (Content Hub), server-rendered. */
  socialPanel?: ReactNode;
  /** 0053: the client's work dashboard, server-rendered. */
  dashboardPanel?: ReactNode;
  /** 0053: the script library. */
  scriptsPanel?: ReactNode;
  /** 0043: the client-facing account details; null for non-management. */
  account?: { available: boolean; paymentDay: number | null; note: string | null } | null;
  /** Phase 18: the client's payment agreement. CEO-only, so undefined for everyone else. */
  finance?: {
    monthly_value: number | null;
    billing_amount: number | null;
    billing_frequency: string | null;
    billing_notes: string | null;
  };
}) {
  const [tab, setTab] = useState<TabId>(initialTab);
  // A link to another tab of the same client (the team walkthrough, or a
  // notification) changes ?tab= without remounting this.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [planSection, setPlanSection] = useState<string | undefined>(undefined);

  // Set when the Performance tab sends someone to a video.
  const [openVideo, setOpenVideo] = useState<string | null>(null);

  const tabs = TABS.filter(
    (t) =>
      (t.id !== "passwords" || canSeeCredentials) &&
      (t.id !== "performance" || canEditVideos) &&
      (t.id !== "dashboard" || Boolean(dashboardPanel)) &&
      (t.id !== "scripts" || Boolean(scriptsPanel))
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
        <AvatarUpload clientId={client.id} initialUrl={client.avatar_url} name={client.name} />
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: 0 }}>{client.name}</h1>
      </div>

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          borderBottom: "1px solid var(--border)",
          // Four tabs no longer fit across a phone the way three did,
          // so the row scrolls sideways instead of squashing the
          // labels or pushing the last one off the edge. The
          // scrollbar is hidden: on a phone there is nothing to grab
          // anyway, and on a desktop all four fit.
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setOpenVideo(null);
            }}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${tab === t.id ? "var(--text-1)" : "transparent"}`,
              color: tab === t.id ? "var(--text-1)" : "var(--text-3)",
              padding: "10px 4px",
              cursor: "pointer",
              marginRight: 16,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Keyed by tab, so each one eases in as it is opened. */}
      <div key={tab} className="fade-in">
      {tab === "dashboard" && dashboardPanel}
      {tab === "scripts" && scriptsPanel}
      {tab === "info" && (
        <div style={{ maxWidth: 720 }} className="client-info-col">
          {justAdded && (
            <p className="access-note" role="status" style={{ marginBottom: 20 }}>
              {client.name} is set up. Their content plan is a draft until you publish it from the Content Plan tab.
              {notSaved.length > 0 && ` These didn't save, so set them up by hand: ${notSaved.join(", ")}.`}
            </p>
          )}
          {gaps && gaps.length > 0 && (
            <section className="card card-pad-sm onboard-gaps" style={{ marginBottom: 32 }} aria-label="Still to fill in">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 4px" }}>Still to fill in</h2>
              <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Not covered yet. Each one disappears from this list once it&rsquo;s filled in.
              </p>
              <ul className="todo-gaps">
                {gaps.map((g) => (
                  <li key={`${g.where}-${g.label}`}>
                    {g.where === "logins" ? (
                      <a href="/app/settings/logins">{g.label}</a>
                    ) : g.where === "info" ? (
                      <span>{g.label}</span>
                    ) : (
                      <a
                        href={`?tab=${g.where}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setPlanSection(g.section);
                          setTab(g.where as TabId);
                        }}
                      >
                        {g.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Info</h2>
            <ClientInfoForm client={client} />
            {monthlyValue !== undefined && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, margin: "0 0 12px", letterSpacing: "0.02em" }}>
                  Payment agreement
                </h3>
                <ClientFinanceField
                  clientId={client.id}
                  initialValue={monthlyValue}
                  initialAmount={finance?.billing_amount ?? null}
                  initialFrequency={(finance?.billing_frequency as BillingFrequency | null) ?? null}
                  initialNotes={finance?.billing_notes ?? null}
                />
              </div>
            )}
          </section>

          {account && (
            <section style={{ marginBottom: 36 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 4px" }}>Client account page</h2>
              <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 14px" }}>
                What {client.name} sees under Account in their portal. Mark invoices paid in Finance below.
              </p>
              <ClientAccountPanel
                clientId={client.id}
                clientName={client.name}
                initialDay={account.paymentDay}
                initialNote={account.note}
                available={account.available}
              />
            </section>
          )}

          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Onboarding</h2>
            <OnboardingChecklist clientId={client.id} items={checklist} templates={templates} />
          </section>

          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Tasks</h2>
            <TaskList initialTasks={tasks} />
          </section>

          {invoices.length > 0 || monthlyValue !== undefined ? (
            <section style={{ marginBottom: 36 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Finance</h2>
              <ClientFinancePanel clientId={client.id} invoices={invoices} />
            </section>
          ) : null}

          {canSeeDocuments && (
            <section style={{ marginBottom: 36 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Documents</h2>
              <DocumentsList initialDocuments={documents} clientId={client.id} />
              <DocumentUpload clientId={client.id} />
            </section>
          )}

          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Meetings</h2>
            <FathomLinkPanel clientId={client.id} meetings={meetings} />
          </section>

          {/* This page is only ever reached by ceo/staff — see the
              note at the top of AssignedTeamPanel.tsx — so there's no
              separate role check gating this section. */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Assigned Team</h2>
            <AssignedTeamPanel
              clientId={client.id}
              initialAssignments={teamMembers}
              assignableProfiles={assignableProfiles}
              canAssign={canAssign}
              assignScope={assignScope}
            />
          </section>

          {/* Phase 21: what the videographer reads before a shoot.
              Edited here so it stays with the rest of the client's
              record rather than living in a separate screen. */}
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Brand kit</h2>
            <BrandKitPanel initialKit={brandKit ?? emptyBrandKit(client.id)} editable />
          </section>

          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 4px" }}>Team thread</h2>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 14px" }}>
              Internal — the client cannot see this
            </p>
            <ClientTeamThread
              clientId={client.id}
              initialMessages={teamMessages}
              currentUserId={currentUserId}
            />
          </section>
        </div>
      )}

      {/* Mounted only while this tab is active — avoids paying for the
          planner's fetch + Realtime subscription on every client
          detail page load, only when staff actually opens the tab. */}
      {tab === "plan" && (
        <PlannerDocument
          clientId={client.id}
          editable={true}
          initialSection={planSection}
          videos={<VideoSchedule clientId={client.id} editable={canEditVideos} canApprove={canApproveVideos} pkg={clientPackage} />}
        />
      )}

      {/* Mounted with the tab, like the planner above — its two
          queries are only worth making when somebody looks. */}
      {tab === "calendar" && <ClientCalendarPanel clientId={client.id} />}

      {tab === "package" && (
        <PackagePanel
          clientId={client.id}
          clientName={client.name}
          initial={clientPackage}
          presets={packagePresets}
          available={packageAvailable}
          editable={canEditPackage}
        />
      )}

      {tab === "videos" && (
        <VideoSchedule key={openVideo ?? "videos"} clientId={client.id} editable={canEditVideos} canApprove={canApproveVideos} pkg={clientPackage} initialOpenId={openVideo} />
      )}

      {tab === "performance" && canEditVideos && socialPanel && (
        <section className="sh-team-wrap">
          <h2 className="sh-team-title">Social accounts</h2>
          <p className="sh-team-sub">What the client sees on their Content Hub. Numbers are read from these public profiles every day at 5pm.</p>
          {socialPanel}
        </section>
      )}

      {tab === "performance" && canEditVideos && (
        <PerformancePanel
          clientId={client.id}
          onOpenVideo={(id) => {
            setOpenVideo(id);
            setTab("videos");
          }}
        />
      )}

      {tab === "passwords" && canSeeCredentials && (
        <CredentialsPanel
          clientId={client.id}
          clientName={client.name}
          initial={credentials}
          available={credentialsAvailable}
          keyProblem={credentialsKeyProblem}
          suggestedKey={suggestedCredentialsKey}
          isCeo={isCeo}
        />
      )}

      {tab === "activity" && (
        <div style={{ maxWidth: 720 }}>
          <ActivityTimeline clientId={client.id} entries={activity} />
        </div>
      )}
      </div>
    </div>
  );
}
