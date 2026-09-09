import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfilePanel, type EditableProfile } from "@/components/ProfilePanel";

export const dynamic = "force-dynamic";

/**
 * Your own name, phone and photo.
 *
 * Open to every role, like the password page beside it — a client and
 * a videographer both need somewhere to fix their own details, and
 * "profiles: update own" (0001) has always allowed exactly this write.
 */
export default async function MyProfilePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, phone, avatar_url, role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const editable: EditableProfile = {
    ...(profile as unknown as Omit<EditableProfile, "email">),
    email: user.email ?? null,
  };

  return (
    <main className="page page-xs">
      <h1 className="page-title page-title-accent">Your profile</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 32px", lineHeight: 1.6 }}>
        Your name is what everyone else in the CRM sees you as — on client
        pages, in assignments and in chat. Your photo shows in the same places.
      </p>

      <ProfilePanel profile={editable} />

      <div style={{ marginTop: 36, paddingTop: 22, borderTop: "1px solid var(--border)" }}>
        <Link href="/app/settings/password" className="btn" style={{ textDecoration: "none" }}>
          Change your password →
        </Link>
      </div>
    </main>
  );
}
