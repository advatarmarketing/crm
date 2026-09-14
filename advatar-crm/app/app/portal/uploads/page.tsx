import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadUploads, loadAssets } from "@/lib/uploads";
import { UploadsWorkspace } from "@/components/uploads/UploadsWorkspace";
import { MarkSectionSeen } from "@/components/NavBadge";

export const dynamic = "force-dynamic";

/**
 * The client's Uploads tab.
 *
 * The same workspace the team uses, with the client's own abilities —
 * watch, comment, add material — rather than a separate screen built
 * to look similar. Building a parallel one would mean every fix to
 * the comment thread had to be made twice, and the two would drift.
 *
 * What a client sees is narrowed in three places, none of them here:
 *
 *   - `submissions` shows them only videos deliberately shared with
 *     them (0025's "client read shared");
 *   - `submission_feedback` shows them only the 'client' audience, so
 *     the team's internal notes on the same video stay invisible
 *     (0028);
 *   - `client_assets` shows them only material marked shared.
 *
 * The `audience: "client"` filter below is belt and braces on top of
 * the second of those: if the policy were ever loosened by accident,
 * this page still wouldn't render an internal note.
 */
export default async function PortalUploadsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).maybeSingle();

  const clientId = (profile as { client_id?: string | null } | null)?.client_id ?? null;

  if (!clientId) return null; // see PortalLayout

  const [{ uploads, problem: uploadsProblem }, { assets, problem: assetsProblem }, { data: client }] =
    await Promise.all([
      loadUploads(supabase, { clientId, audience: "client" }),
      loadAssets(supabase, { clientId }),
      supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle(),
    ]);

  const clientRow = client as { id: string; name: string } | null;

  return (
    <main className="page page-xs">
      <MarkSectionSeen prefix="/app/portal/uploads" />

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 8px" }}>Uploads</h1>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--text-2)",
          margin: "0 0 28px",
          maxWidth: "60ch",
          lineHeight: 1.6,
        }}
      >
        Every video we&rsquo;ve sent you, with somewhere to say what you think. You can
        point at an exact moment in a video, add a screenshot, and hand over any
        footage or images of your own.
      </p>

      <UploadsWorkspace
        role="client"
        currentUserId={user.id}
        uploads={uploads}
        assets={assets}
        clients={clientRow ? [{ id: clientRow.id, name: clientRow.name }] : []}
        uploadsProblem={uploadsProblem}
        assetsProblem={assetsProblem}
        // A client has exactly one client, so there is no "which
        // client is this for?" question to ask them.
        fixedClientId={clientId}
      />
    </main>
  );
}
