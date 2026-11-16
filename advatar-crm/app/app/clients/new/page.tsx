import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { packageFromRow, type PackagePreset } from "@/lib/packages";
import { meetingKeyMissing } from "@/lib/onboarding/meeting";
import { NewClientForm } from "../new-client-form";
import { OnboardWizard } from "./onboard-wizard";

// Reading a long meeting can take up to a minute; the server actions
// on this page run under this route's time limit.
export const maxDuration = 300;

// CEO/operations_manager only — RLS on `clients` (0010) only grants
// insert to "management", so redirecting anyone else here is a UX
// courtesy, not the real boundary (the actions' own role check, and
// the database, are what actually stop it).
export default async function NewClientPage({
  searchParams,
}: {
  searchParams: { stage?: string; quick?: string };
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

  const title = (
    <h1
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 32,
        letterSpacing: "0.02em",
        margin: "0 0 4px",
        color: "var(--text-1)",
      }}
    >
      {searchParams.stage === "lead" ? "Add lead" : "Add client"}
    </h1>
  );

  // Leads, and anyone who just wants the short form, keep it.
  if (searchParams.stage === "lead" || searchParams.quick) {
    const defaultStage = searchParams.stage === "proposal" || searchParams.stage === "active" ? searchParams.stage : "lead";
    return (
      <main className="page-narrow">
        {title}
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 32px" }}>
          Set the stage to &ldquo;Lead&rdquo; to track this as a lead first. You can move it to Proposal or Active later
          from the Leads or Clients page.
        </p>
        <NewClientForm defaultStage={defaultStage} />
      </main>
    );
  }

  // Its own query, allowed to fail: before 0041 there are no presets.
  const presetRes = await supabase.from("package_presets").select("*").order("name");
  const presets: PackagePreset[] = presetRes.error
    ? []
    : ((presetRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        ...packageFromRow(r),
      }));

  return (
    <main className="page-narrow" style={{ maxWidth: 820 }}>
      {title}
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px" }}>
        After the first meeting: choose their package, hand over the meeting, and we fill in the rest. Just tracking a
        lead? <Link href="/app/clients/new?stage=lead">Use the short form</Link>.
      </p>
      <OnboardWizard presets={presets} packagesAvailable={!presetRes.error} canRead={!meetingKeyMissing()} />
    </main>
  );
}
