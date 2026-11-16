"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { describePackage, normalizePackage, type PackageSettings } from "@/lib/packages";

/**
 * The Package tab on a client (0041).
 *
 * Nothing here decides who may change what. Every query runs through
 * the caller's own session, so 0041's row level security does: the
 * CEO everywhere, an operations manager on their own clients, nobody
 * else. Staff and videographers read a package; a write from them
 * changes nothing and comes back as an error.
 */

export interface PackageResult {
  error: string | null;
}

function friendly(message: string, code?: string): string {
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    (/client_packages|package_presets/.test(message) && /does not exist|could not find/i.test(message))
  ) {
    return "Packages aren’t switched on yet — database update 0041 still needs running.";
  }
  if (code === "23505" || /package_presets_name_unique/.test(message)) {
    return "There is already a saved package with that name.";
  }
  if (code === "23503" && /preset/.test(message)) {
    return "That saved package has just been deleted. Choose another, or save without one.";
  }
  if (/row-level security|violates row-level/i.test(message)) {
    return "Only the CEO, or an operations manager on this client, can change a package.";
  }
  return message;
}

export async function saveClientPackageAction(
  clientId: string,
  input: Partial<PackageSettings>,
  presetId: string | null
): Promise<PackageResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const parsed = normalizePackage(input);
  if (!parsed.ok) return { error: parsed.error };

  // `select` after the upsert so a write RLS silently filtered out
  // (an update that matched no visible row) is reported, not
  // mistaken for success.
  const { data, error } = await supabase
    .from("client_packages")
    .upsert(
      { client_id: clientId, preset_id: presetId, ...parsed.value, updated_by: user.id } as never,
      { onConflict: "client_id" }
    )
    .select("client_id");

  if (error) return { error: friendly(error.message, error.code) };
  if (!data || (data as unknown[]).length === 0) {
    return { error: friendly("violates row-level security") };
  }

  await logActivity(supabase, {
    clientId,
    kind: "package_changed",
    summary: `Package set: ${describePackage(parsed.value)}`,
    actorId: user.id,
  });

  revalidatePath(`/app/clients/${clientId}`);
  return { error: null };
}

export async function savePresetAction(
  name: string,
  input: Partial<PackageSettings>
): Promise<PackageResult & { id?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length === 0) return { error: "Give the package a name." };
  if (clean.length > 60) return { error: "Keep the name under 60 characters." };

  const parsed = normalizePackage(input);
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await supabase
    .from("package_presets")
    .insert({ name: clean, ...parsed.value } as never)
    .select("id")
    .single();

  if (error || !data) return { error: friendly(error?.message ?? "Could not save that package.", error?.code) };

  revalidatePath("/app/clients", "layout");
  return { error: null, id: (data as { id: string }).id };
}

export async function deletePresetAction(id: string): Promise<PackageResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Clients set up from this preset keep their settings — the copy is
  // theirs. 0041 only clears the label (on delete set null).
  const { data, error } = await supabase.from("package_presets").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!data || (data as unknown[]).length === 0) {
    return { error: "That package could not be deleted — it may already be gone." };
  }

  revalidatePath("/app/clients", "layout");
  return { error: null };
}
