import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Where each role actually works. Kept in step with HOME_BY_ROLE in
// middleware.ts — the two answer the same question from different
// places, and if they ever disagree this page is the one that sends
// somebody to a screen they can't use.
const HOME_BY_ROLE: Record<ProfileRole, string> = {
  ceo: "/app/dashboard",
  operations_manager: "/app/dashboard",
  staff: "/app/dashboard",
  videographer: "/app/my-dashboard",
  client: "/app/portal",
};

/**
 * The front door at /app.
 *
 * There was no page here at all — only a layout — so Next returned a
 * 404 for /app itself. Nobody hit it from a browser, because you
 * always arrive at /login or at a deeper /app/* route. Adding the web
 * manifest changed that: its `start_url` is /app, so launching the app
 * from an iPhone home screen went straight to the one address in the
 * app that had nothing behind it.
 *
 * Fixed here rather than by pointing the manifest somewhere else,
 * because iOS stores `start_url` when the icon is added: changing the
 * manifest would only help people who deleted the icon and added it
 * again. Giving /app something to serve fixes the icons already on
 * people's phones.
 *
 * middleware.ts already bounces a videographer or a client away from
 * /app before this runs, so in practice this handles CEO, operations
 * manager and staff — but it covers every role regardless, since
 * relying on a redirect elsewhere is how the gap appeared in the first
 * place.
 */
export default async function AppIndexPage() {
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

  const role = (profile as { role?: ProfileRole } | null)?.role;

  redirect(role ? HOME_BY_ROLE[role] ?? "/app/dashboard" : "/login");
}
