import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentsList } from "@/components/DocumentsList";

// Phase 9: reuses the same DocumentsList component built for the
// ceo/staff client-detail page (Phase 4) and the videographer's
// read-only view (Phase 7), same reasoning as that videographer view:
// "documents: client read own" (Phase 3) is select-only for this
// role, so `editable={false}` renders a plain status badge instead of
// a dropdown that would just fail and revert if a client tried to use
// it.
export default async function PortalDocumentsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).single();

  if (!profile?.client_id) {
    return null; // see PortalLayout
  }

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("client_id", profile.client_id)
    .order("created_at", { ascending: false });

  return (
    <main style={{ padding: "40px 32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 24px" }}>
        Documents
      </h1>
      <DocumentsList initialDocuments={documents ?? []} editable={false} />
    </main>
  );
}
