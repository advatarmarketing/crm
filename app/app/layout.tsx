import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <AppNav role={profile.role as ProfileRole} />
      {children}
    </div>
  );
}
