import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { credentialsKeyProblem, suggestKey } from "@/lib/credentials";
import { KeyWarning } from "@/components/CredentialsPanel";
import { EmptyState } from "@/components/EmptyState";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * Passwords: every client's social media logins, in one place.
 *
 * The same logins that sit on a client's own Passwords tab — this is
 * the way in when you know the platform but are not already on the
 * client's page, which is most of the time.
 *
 * Nothing here is a second copy of anything. Both screens read
 * `client_credentials`, and 0039's row level security decides what
 * either of them returns: the CEO sees every client, an operations
 * manager the ones they run, staff the ones they are assigned to,
 * and videographers and clients nothing at all. Middleware keeps
 * those last two off this route entirely; the redirect below is the
 * belt to that pair of braces.
 */
export default async function PasswordsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: ProfileRole } | null)?.role;

  if (role !== "ceo" && role !== "operations_manager" && role !== "staff") {
    redirect("/app/dashboard");
  }

  const [{ data: clients }, { data: credentials, error: credentialsError }] = await Promise.all([
    supabase.from("clients").select("id, name, avatar_url, stage").order("name"),
    // Just enough to count them. The passwords themselves are never
    // loaded on this screen — there is nothing here to reveal.
    supabase.from("client_credentials").select("client_id, platform"),
  ]);

  const available = !credentialsError;

  const byClient = new Map<string, string[]>();
  for (const row of (credentials ?? []) as unknown as { client_id: string; platform: string }[]) {
    const list = byClient.get(row.client_id) ?? [];
    list.push(row.platform);
    byClient.set(row.client_id, list);
  }

  const rows = ((clients ?? []) as unknown as { id: string; name: string; stage: string | null }[]).map((c) => ({
    ...c,
    platforms: byClient.get(c.id) ?? [],
  }));

  // Clients with logins first: this page exists to find a login, and
  // the ones that have none are the ones nobody is looking for.
  rows.sort((a, b) => {
    if ((b.platforms.length > 0 ? 1 : 0) !== (a.platforms.length > 0 ? 1 : 0)) {
      return (b.platforms.length > 0 ? 1 : 0) - (a.platforms.length > 0 ? 1 : 0);
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <main className="page">
      <h1 className="page-title page-title-accent">Passwords</h1>

      {!available ? (
        <EmptyState
          title="Passwords aren’t switched on yet"
          body="This needs one database update (0039) before logins can be saved. Nothing has been lost — there is nothing here yet to lose."
        />
      ) : (
        <>
          <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 640 }}>
            The social media logins for each client, so whoever is posting doesn’t have to go and ask. Passwords
            are encrypted and are never shown until you ask for one. Videographers and clients cannot see any of
            this.
          </p>

          <div style={{ maxWidth: 640 }}>
            <KeyWarningSlot isCeo={role === "ceo"} />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="No clients yet"
              body="Add a client and their logins can live on their page, and here."
            />
          ) : (
            <div className="card-grid" style={{ maxWidth: 900 }}>
              {rows.map((client) => (
                <Link key={client.id} href={`/app/passwords/${client.id}`} className="card card-pad card-link">
                  <strong style={{ fontFamily: "var(--font-display)", fontSize: 18, display: "block" }}>
                    {client.name}
                  </strong>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "var(--text-3)",
                      display: "block",
                      marginTop: 8,
                    }}
                  >
                    {client.platforms.length === 0
                      ? "no logins saved"
                      : `${client.platforms.length} login${client.platforms.length === 1 ? "" : "s"}`}
                  </span>
                  {client.platforms.length > 0 && (
                    <span style={{ fontSize: 13, color: "var(--text-2)", display: "block", marginTop: 6 }}>
                      {client.platforms.slice(0, 4).join(" · ")}
                      {client.platforms.length > 4 ? " · …" : ""}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

/** Server-side wrapper so the warning's key is generated per request
 * rather than being baked into the page. */
function KeyWarningSlot({ isCeo }: { isCeo: boolean }) {
  const problem = credentialsKeyProblem();
  if (!problem) return null;
  return <KeyWarning problem={problem} suggestedKey={suggestKey()} isCeo={isCeo} />;
}
