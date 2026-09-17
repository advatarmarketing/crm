"use client";

import { useState } from "react";
import { AvatarUpload } from "./AvatarUpload";
import { ClientInfoForm } from "./ClientInfoForm";
import { ClientFinanceField, type BillingFrequency } from "./ClientFinanceField";
import { DocumentsList } from "./DocumentsList";
import { TaskList } from "./TaskList";
import { PlannerDocument } from "./PlannerDocument";
import { AssignedTeamPanel, type AssignedTeamMember, type AssignableProfile } from "./AssignedTeamPanel";
import { BrandKitPanel, emptyBrandKit, type BrandKit } from "./BrandKitPanel";
import { ClientTeamThread, type TeamMessage } from "./ClientTeamThread";
import { ClientFinancePanel, type ClientInvoice } from "./ClientFinancePanel";
import { DocumentUpload } from "./DocumentUpload";
import { FathomLinkPanel, type LinkedMeeting } from "./FathomLinkPanel";
import { ActivityTimeline, type ActivityEntry } from "./ActivityTimeline";
import { OnboardingChecklist, type ChecklistItem, type TemplateOption } from "./OnboardingChecklist";
import type { Database } from "@/lib/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Document = Database["public"]["Tables"]["documents"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

const TABS = [
  { id: "info", label: "Info" },
  { id: "plan", label: "Content Plan" },
  { id: "activity", label: "Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ClientDetailTabs({
  client,
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
  /** Phase 18: the client's payment agreement. CEO-only, so undefined for everyone else. */
  finance?: {
    monthly_value: number | null;
    billing_amount: number | null;
    billing_frequency: string | null;
    billing_notes: string | null;
  };
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

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
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
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
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div style={{ maxWidth: 720 }} className="client-info-col">
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

          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Documents</h2>
            <DocumentsList initialDocuments={documents} clientId={client.id} />
            <DocumentUpload clientId={client.id} />
          </section>

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
      {tab === "plan" && <PlannerDocument clientId={client.id} editable={true} />}

      {tab === "activity" && (
        <div style={{ maxWidth: 720 }}>
          <ActivityTimeline clientId={client.id} entries={activity} />
        </div>
      )}
    </div>
  );
}
