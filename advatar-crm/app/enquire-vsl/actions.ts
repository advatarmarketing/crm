"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VSL_SLUG, checkVsl, newId, type VslContent } from "@/lib/vsl";

/**
 * Saving the VSL page and uploading its logos. Only the CEO and
 * operations may: checked here against the signed-in person, then
 * written with the server's own access (the page and its logos are
 * read by visitors who are not signed in).
 */

const NEEDS_0062 = "The VSL page isn’t switched on yet: database update 0062 still needs running.";

async function editor(): Promise<{ id: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return role === "ceo" || role === "operations_manager" ? { id: user.id } : null;
}

export async function saveVslAction(content: VslContent): Promise<{ error: string | null; content?: VslContent }> {
  const me = await editor();
  if (!me) return { error: "Only the CEO or operations can edit this page. Sign in and try again." };
  const checked = checkVsl(content);
  if (!checked.ok) return { error: checked.error };

  const { error } = await createAdminClient()
    .from("site_pages")
    .upsert({ slug: VSL_SLUG, content: checked.value, updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: "slug" });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /site_pages/.test(error.message)) return { error: NEEDS_0062 };
    return { error: error.message };
  }
  revalidatePath("/enquire-vsl");
  return { error: null, content: checked.value };
}

/**
 * One logo, already evened out in the browser (lib/vsl-logo.ts), as a
 * PNG data URL. Returns its public address for the page to keep.
 */
export async function uploadVslLogoAction(dataUrl: string): Promise<{ error: string | null; url?: string }> {
  const me = await editor();
  if (!me) return { error: "Only the CEO or operations can edit this page. Sign in and try again." };
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { error: "That image couldn’t be read." };
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 2_000_000) return { error: "That logo is too large once processed. Try a smaller file." };
  // A PNG starts with these eight bytes; anything else is not what we made.
  if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { error: "That image couldn’t be read." };
  }

  const path = `vsl-logos/${newId("logo")}.png`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("site-media").upload(path, bytes, { contentType: "image/png", upsert: false });
  if (error) {
    if (/bucket/i.test(error.message) && /not found/i.test(error.message)) return { error: NEEDS_0062 };
    return { error: error.message };
  }
  const { data } = admin.storage.from("site-media").getPublicUrl(path);
  return { error: null, url: data.publicUrl };
}
