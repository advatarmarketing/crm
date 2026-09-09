import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <AppNav role={profile.role as ProfileRole} notifications={(notifications ?? []) as AppNotification[]} />
      {children}
    </div>
  );
}
