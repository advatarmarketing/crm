import type { Metadata, Viewport } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { VSL_SLUG, readVsl, type VslContent } from "@/lib/vsl";
import { VslPage } from "./VslPage";

/**
 * The video sales letter version of the enquiry page:
 * app.advatar.co.uk/enquire-vsl
 *
 * The same enquiry form as /enquire, under a title, a video and the
 * proof that goes with it, then logos, case studies and the links to
 * the main website. Public, like /enquire (middleware only guards
 * /app). Its words and pictures are edited on the page itself by the
 * CEO or operations when they're signed in (0062).
 */

export const dynamic = "force-dynamic";

async function load(): Promise<{ content: VslContent; ready: boolean }> {
  try {
    const { data, error } = await createAdminClient().from("site_pages").select("content").eq("slug", VSL_SLUG).maybeSingle();
    if (error) return { content: readVsl(null), ready: false };
    return { content: readVsl((data as { content?: unknown } | null)?.content ?? null), ready: true };
  } catch {
    return { content: readVsl(null), ready: false };
  }
}

async function canEdit(): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (data as { role?: string } | null)?.role;
    return role === "ceo" || role === "operations_manager";
  } catch {
    return false;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await load();
  return {
    title: content.title || "Work with Advatar",
    description: content.subheading || "Tell us what you're looking for and we'll be in touch within 48 hours.",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f5f3",
  viewportFit: "cover",
};

export default async function EnquireVslPage() {
  const [{ content, ready }, editable] = await Promise.all([load(), canEdit()]);
  return <VslPage initial={content} canEdit={editable} ready={ready} />;
}
