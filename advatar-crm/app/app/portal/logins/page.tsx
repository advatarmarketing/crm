import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientLogins, type ClientLogin } from "@/components/portal/ClientLogins";

export const dynamic = "force-dynamic";

/**
 * The client's own social media logins, as the team has them saved
 * (0039), so a forgotten password is one click away. Read-only: changes
 * go through the team, who need the new password to keep posting.
 */
export default async function PortalLoginsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).maybeSingle();
  const clientId = (profile as { client_id?: string | null } | null)?.client_id ?? null;
  if (!clientId) return null; // see PortalLayout

  // No ciphertext leaves the server: only whether a password is saved.
  const { data } = await supabase
    .from("client_credentials")
    .select("id, platform, label, username, url, secret_cipher")
    .eq("client_id", clientId)
    .order("platform");

  const logins: ClientLogin[] = ((data ?? []) as {
    id: string;
    platform: string;
    label: string | null;
    username: string | null;
    url: string | null;
    secret_cipher: string | null;
  }[]).map((r) => ({
    id: r.id,
    platform: r.platform,
    label: r.label,
    username: r.username,
    url: r.url,
    hasPassword: Boolean(r.secret_cipher),
  }));

  return (
    <main className="page page-sm">
      <h1 className="page-title page-title-accent">Logins</h1>
      <p style={{ fontSize: 14, color: "var(--text-2)", margin: "0 0 24px", maxWidth: "60ch", lineHeight: 1.6 }}>
        The social media logins your team uses to post for you. If you change a password, message your team so they
        can update it here.
      </p>
      {logins.length === 0 ? (
        <div className="card card-pad" style={{ color: "var(--text-2)" }}>
          No logins saved yet. When your team adds one, it will appear here.
        </div>
      ) : (
        <ClientLogins logins={logins} />
      )}
    </main>
  );
}
