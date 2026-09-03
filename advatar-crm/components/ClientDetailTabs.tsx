"use client";

import { useState } from "react";
import { AvatarUpload } from "./AvatarUpload";
import { ClientInfoForm } from "./ClientInfoForm";
import { ClientFinanceField } from "./ClientFinanceField";
import { DocumentsList } from "./DocumentsList";
import { TaskList } from "./TaskList";
import { PlannerDocument } from "./PlannerDocument";
import { AssignedTeamPanel, type AssignedTeamMember, type AssignableProfile } from "./AssignedTeamPanel";
import type { Database } from "@/lib/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Document = Database["public"]["Tables"]["documents"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

const TABS = [
  { id: "info", label: "Info" },
  { id: "plan", label: "90-Day Plan" },
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
}: {
  client: Client;
  documents: Document[];
  tasks: Task[];
  monthlyValue: number | null | undefined; // undefined = no client_finance row visible (staff)
  initialTab?: TabId;
  teamMembers: AssignedTeamMember[];
  assignableProfiles: AssignableProfile[];
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
        <div style={{ maxWidth: 720 }}>
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Info</h2>
            <ClientInfoForm client={client} />
            {monthlyValue !== undefined && (
              <div style={{ marginTop: 16 }}>
                <ClientFinanceField clientId={client.id} initialValue={monthlyValue} />
              </div>
            )}
          </section>

          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Tasks</h2>
            <TaskList initialTasks={tasks} />
          </section>

          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Documents</h2>
            <DocumentsList initialDocuments={documents} />
          </section>

          {/* This page is only ever reached by ceo/staff — see the
              note at the top of AssignedTeamPanel.tsx — so there's no
              separate role check gating this section. */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>Assigned Team</h2>
            <AssignedTeamPanel clientId={client.id} initialAssignments={teamMembers} assignableProfiles={assignableProfiles} />
          </section>
        </div>
      )}

      {/* Mounted only while this tab is active — avoids paying for the
          planner's fetch + Realtime subscription on every client
          detail page load, only when staff actually opens the tab. */}
      {tab === "plan" && <PlannerDocument clientId={client.id} editable={true} />}
    </div>
  );
}
