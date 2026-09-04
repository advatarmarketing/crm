"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface TemplateState {
  error: string | null;
  success: string | null;
}

/**
 * Templates are shared across the agency, so only management edits
 * them (0014_onboarding_templates.sql). Checked here for a readable
 * error and by RLS for real.
 */
async function requireManagement() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, error: "Not signed in." as string | null };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    return { supabase, user, error: "Only the CEO or an operations manager can change templates." };
  }

  return { supabase, user, error: null };
}

/**
 * Creates a template from a block of text, one task per line, in the
 * form `Task text | days`.
 *
 * A textarea rather than a row-by-row builder on purpose: this gets
 * edited rarely and in bulk, and typing seven lines is faster than
 * clicking "add row" seven times. A line with no number is treated as
 * day 0.
 */
export async function createTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  const { supabase, user, error: accessError } = await requireManagement();
  if (accessError) return { error: accessError, success: null };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const body = String(formData.get("items") ?? "");

  if (!name) return { error: "Give the template a name.", success: null };

  const items = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [text, offsetRaw] = line.split("|").map((part) => part.trim());
      const offset = Number(offsetRaw);
      return {
        text,
        offset_days: Number.isFinite(offset) && offset >= 0 ? Math.round(offset) : 0,
        position: index,
      };
    })
    .filter((item) => item.text.length > 0);

  if (items.length === 0) return { error: "Add at least one task, one per line.", success: null };

  const { data: template, error } = await supabase
    .from("task_templates")
    .insert({ name, description: description || null, created_by: user?.id ?? null })
    .select("id")
    .single();

  if (error || !template) return { error: error?.message ?? "Could not create the template.", success: null };

  const { error: itemsError } = await supabase
    .from("task_template_items")
    .insert(items.map((item) => ({ ...item, template_id: template.id })));

  if (itemsError) {
    // Don't leave a template with no tasks in it — an empty template
    // in the dropdown does nothing and looks broken.
    await supabase.from("task_templates").delete().eq("id", template.id);
    return { error: itemsError.message, success: null };
  }

  revalidatePath("/app/settings/templates");
  return { error: null, success: `Created "${name}" with ${items.length} tasks.` };
}

export async function deleteTemplate(formData: FormData) {
  const { supabase, error } = await requireManagement();
  if (error) return;

  const id = String(formData.get("templateId") ?? "");
  if (!id) return;

  // Items go with it — task_template_items cascades on delete.
  await supabase.from("task_templates").delete().eq("id", id);
  revalidatePath("/app/settings/templates");
}
