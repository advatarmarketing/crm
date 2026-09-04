import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewClientForm } from "../new-client-form";

// CEO/operations_manager only — RLS on `clients` (0010) only grants
// insert to "management", so redirecting anyone else here is a UX
// courtesy, not the real boundary (createClientRecord's own role
// check, and the database, are what actually stop it).
export default async function NewClientPage({
  searchParams,
}: {
  searchParams: { stage?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    redirect("/app/dashboard");
  }

  const defaultStage = searchParams.stage === "proposal" || searchParams.stage === "active"
    ? searchParams.stage
    : "lead";

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 24px" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          letterSpacing: "0.02em",
          margin: "0 0 4px",
          color: "var(--text-1)",
        }}
      >
        Add client
      </h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 32px" }}>
        Set the stage to "Lead" to track this as a lead first — you can move it to Proposal or
        Active later from the Leads or Clients page.
      </p>
      <NewClientForm defaultStage={defaultStage} />
    </main>
  );
}
