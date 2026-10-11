import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortalNav } from "@/components/PortalNav";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { NewUploadDialog, type NewUploadAlert } from "@/components/portal/NewUploadDialog";
import { firstName } from "@/lib/names";

// Phase 9: shared shell for every /app/portal/* page. Does the one
// check every portal page previously had to repeat on its own (Phase
// 2's known gap: a client-role signup not yet linked to a real
// `clients` row via profiles.client_id) in exactly one place, mounts
// the portal's own sub-nav, and sets up the live-update subscription
// that every page under this section benefits from.
//
// Each individual page (page.tsx, content/page.tsx, etc.) still
// re-fetches profile.client_id itself before querying anything —
// that's not wasted duplication, it's this codebase's existing
// convention (app/app/layout.tsx re-fetches `role` despite
// middleware.ts already having checked it) so that every
// page/layout's data access stands on its own regardless of where
// it's nested, the same way RLS itself doesn't trust the layer above
// it either.
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id, full_name")
    .eq("id", user.id)
    .single();

  if (!profile?.client_id) {
    return (
      <main className="page page-xs">
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          Your account isn't linked to a project yet — check back once your team has set things up.
        </p>
      </main>
    );
  }

  const clientId = profile.client_id;

  // `messages` has no `client_id` column of its own, only `thread_id`
  // (Phase 3's schema) — one thread per client, enforced by
  // `message_threads.client_id` being `unique`. So "subscribe to
  // messages for this client_id" concretely means "subscribe to this
  // client's one thread". If the thread doesn't exist yet (no staff
  // member has opened Messages for this client at all), there's
  // nothing to filter on — the `messages` subscription is simply
  // omitted rather than passed an empty/unfiltered filter, since an
  // unfiltered `messages` channel would ask Realtime to evaluate RLS
  // against every row in the table on every change instead of none.
  const { data: thread } = await supabase.from("message_threads").select("id").eq("client_id", clientId).maybeSingle();

  // Anything shared with them that they have not been shown yet.
  // Both kinds: 'submission_shared' is written when a video is handed
  // in already shared, 'upload_shared' when a team-only one is flipped
  // over later (0028). Missing either would leave one of the two
  // routes silently not telling them.
  //
  // Wrapped loosely on purpose: a portal that will not load because a
  // greeting could not be fetched is a worse portal.
  let alert: NewUploadAlert | null = null;

  try {
    const { data: unread } = await supabase
      .from("notifications")
      .select("id, href")
      .eq("user_id", user.id)
      .eq("read", false)
      .in("kind", ["submission_shared", "upload_shared"])
      .order("created_at", { ascending: false });

    const rows = (unread ?? []) as unknown as { id: string; href: string | null }[];

    if (rows.length > 0) {
      alert = {
        ids: rows.map((r) => r.id),
        href: rows[0].href ?? "/app/portal/uploads",
        firstName: firstName((profile as { full_name?: string | null }).full_name ?? null, "there"),
        count: rows.length,
      };
    }
  } catch {
    alert = null;
  }

  return (
    <div>
      <NewUploadDialog alert={alert} />
      <RealtimeRefresh
        channelName={`portal:${clientId}`}
        subscriptions={[
          { table: "planners", filter: `client_id=eq.${clientId}` },
          { table: "documents", filter: `client_id=eq.${clientId}` },
          ...(thread ? [{ table: "messages", filter: `thread_id=eq.${thread.id}` }] : []),
        ]}
      />
      <PortalNav />
      {children}
    </div>
  );
}
