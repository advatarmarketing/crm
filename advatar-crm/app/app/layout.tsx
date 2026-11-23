import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { ScrollReveal } from "@/components/ScrollReveal";
import { loadMyAccess } from "@/lib/team-access";
import { PreviewNavigation } from "@/components/PreviewNavigation";
import { NotificationToasts } from "@/components/NotificationToasts";
import { TeamTour } from "@/components/TeamTour";
import { internalClientIds } from "@/lib/internal-clients";
import type { TeamTourKind } from "@/lib/team-tour";
import { VIEW_AS_HEADER } from "@/lib/view-as";
import type { AppNotification } from "@/components/NotificationBell";
import type { ProfileRole } from "@/lib/supabase/types";

// Shared shell for everything under /app/*. middleware.ts has already
// confirmed there's a session and that this role is allowed on
// whatever path was requested by the time this layout runs — this
// only re-fetches the role to decide what the nav shows, which is
// presentation, not a second enforcement layer.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!profile?.role) {
    redirect("/login");
  }

  // The bell's first page of notifications, fetched here so it paints
  // filled in rather than empty-then-populated. RLS on `notifications`
  // (0025) returns your own rows only, so there is nothing to filter.
  // A missing table (0025 not run yet) comes back as an error, not a
  // throw — the bell then simply renders empty.
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, read, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  // Set by middleware only, and only on a verified preview request. By
  // this point `supabase` is already the other person's client, so
  // everything above — their role, their nav, their notifications —
  // is genuinely theirs.
  const isPreview = headers().get(VIEW_AS_HEADER) !== null;

  // Staff whose Logins switch is off (0044) have nothing behind Passwords.
  const access = await loadMyAccess(supabase, user.id, (profile as { role?: string }).role);
  const hiddenLinks = access.logins ? [] : ["/app/passwords"];

  // The team walkthrough (welcome + tour). Sales and videographers get
  // their own once; the CEO and operations can preview either. Not
  // inside a "view their CRM" preview: that window can't save anything,
  // and the walkthrough isn't the viewer's to use up.
  const role = profile.role as ProfileRole;
  const tourKind: TeamTourKind | null = role === "videographer" ? "videography" : role === "staff" ? "sales" : null;
  const showsTour = !isPreview && (tourKind !== null || role === "ceo" || role === "operations_manager");
  const tour = showsTour ? await loadTourBits(supabase, user.id, tourKind !== null) : null;

  return (
    <div style={{ minHeight: "100vh" }}>
      <ScrollReveal />
      {isPreview && <PreviewNavigation />}
      <AppNav role={profile.role as ProfileRole} notifications={(notifications ?? []) as AppNotification[]} hidden={hiddenLinks} />
      {/* Not while previewing somebody else's login: their toasts are
          not yours to dismiss. */}
      {!isPreview && <NotificationToasts userId={user.id} />}
      {children}
      {tour && (
        <Suspense fallback={null}>
          <TeamTour kind={tourKind} autoStart={tour.firstVisit} clientId={tour.clientId} hidden={hiddenLinks} replier={tour.replier} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * What the team walkthrough needs: whether this is their first visit
 * (0048's tour_seen_at, shared with the client tour), one of their
 * clients so it can open a real client page, and whether they have the
 * Professional Replier (0056). Each part fails quietly to "no": before
 * 0048, nobody is shown it rather than everyone on every visit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTourBits(supabase: any, userId: string, ownTour: boolean) {
  const [seen, clients, replier, internal] = await Promise.all([
    ownTour ? supabase.from("profiles").select("tour_seen_at").eq("id", userId).maybeSingle() : Promise.resolve({ data: null, error: true }),
    supabase.from("clients").select("id").order("created_at", { ascending: false }).limit(20),
    ownTour ? supabase.rpc("can_use_replier") : Promise.resolve({ data: true, error: null }),
    internalClientIds(supabase).catch(() => new Set<string>()),
  ]);
  const firstVisit = ownTour && !seen.error && !(seen.data as { tour_seen_at?: string | null } | null)?.tour_seen_at;
  const clientId = ((clients.data ?? []) as { id: string }[]).find((c) => !internal.has(c.id))?.id ?? null;
  return { firstVisit, clientId, replier: !replier.error && Boolean(replier.data) };
}
