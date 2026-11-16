import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortalNav } from "@/components/PortalNav";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

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
    .select("client_id")
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

  // A new video used to open a full-screen dialog here. The pop-ups in
  // the corner (NotificationToasts, mounted in the app shell for every
  // role) now announce it instead and take the client straight to it.

  // Tabs for things this client actually has. A client with no saved
  // logins, or no invoices and no account note yet, gets no tab that
  // would open on an empty page. Each count may fail before its
  // migration runs, which reads as "nothing yet".
  const [logins, invoices, account] = await Promise.all([
    supabase.from("client_credentials").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("client_accounts").select("client_id", { count: "exact", head: true }).eq("client_id", clientId),
  ]);
  const hidden: string[] = [];
  if (logins.error || !logins.count) hidden.push("/app/portal/logins");
  if ((invoices.error || !invoices.count) && (account.error || !account.count)) hidden.push("/app/portal/account");

  return (
    <div>
      <RealtimeRefresh
        channelName={`portal:${clientId}`}
        subscriptions={[
          { table: "planners", filter: `client_id=eq.${clientId}` },
          { table: "documents", filter: `client_id=eq.${clientId}` },
          ...(thread ? [{ table: "messages", filter: `thread_id=eq.${thread.id}` }] : []),
        ]}
      />
      <PortalNav hidden={hidden} />
      {children}
    </div>
  );
}
