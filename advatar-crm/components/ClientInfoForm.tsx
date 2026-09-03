"use client";

import { createClient } from "@/lib/supabase/client";
import { EditableField } from "./EditableField";
import { EditableSelect } from "./EditableSelect";
import type { Database } from "@/lib/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const STAGE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "proposal", label: "Proposal" },
  { value: "active", label: "Active" },
];

export function ClientInfoForm({ client }: { client: Client }) {
  const supabase = createClient();

  function saveField(field: keyof Client) {
    return async (next: string) => {
      const { error } = await supabase
        .from("clients")
        .update({ [field]: next })
        .eq("id", client.id);
      // A permission-denied write under RLS (e.g. a role that
      // shouldn't be editing this client) comes back as an update
      // error here — surfaced to the field, not pre-empted by a
      // client-side role check.
      return error ? { error: error.message } : undefined;
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <EditableField label="Client name" value={client.name} onSave={saveField("name")} />
        <EditableSelect
          label="Stage"
          value={client.stage}
          options={STAGE_OPTIONS}
          onSave={saveField("stage")}
        />
        <EditableField
          label="Contact name"
          value={client.contact_name ?? ""}
          onSave={saveField("contact_name")}
        />
        <EditableField
          label="Contact email"
          value={client.contact_email ?? ""}
          onSave={saveField("contact_email")}
        />
        <EditableField label="Service" value={client.service ?? ""} onSave={saveField("service")} />
        <EditableField
          label="Next action"
          value={client.next_action ?? ""}
          onSave={saveField("next_action")}
        />
      </div>
      <EditableField
        label="Notes"
        as="textarea"
        value={client.notes ?? ""}
        placeholder="Freeform notes for the team…"
        onSave={saveField("notes")}
      />
    </div>
  );
}
