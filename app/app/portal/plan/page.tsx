import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlannerDocument } from "@/components/PlannerDocument";

export default async function ClientPortalPlanPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).single();

  if (!profile?.client_id) {
    // The known Phase 2 gap: a brand-new client-role signup hasn't
    // been linked to a real clients row yet.
    return (
      <main style={{ padding: "40px 32px", maxWidth: 1040, margin: "0 auto" }}>
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          Your account isn't linked to a project yet — check back once your team has set things up.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "0", maxWidth: "none" }}>
      {/* editable=false, requirePublished=true — PlannerDocument itself
          re-checks status='published' in its own fetch (Phase 5 spec:
          "double check it here too"), on top of the planners RLS
          policy from Phase 3 that already blocks a client session
          from ever getting a draft row back. */}
      <PlannerDocument
        clientId={profile.client_id}
        editable={false}
        requirePublished
        emptyMessage="Your 90-day plan isn't published yet — check back soon."
      />
    </main>
  );
}
