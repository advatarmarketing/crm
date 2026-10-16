import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { credentialsKeyProblem, currentKeyId, suggestKey } from "@/lib/credentials";
import { CredentialsPanel } from "@/components/CredentialsPanel";
import type { CredentialSummary } from "@/app/app/clients/[id]/credential-actions";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * One client's logins, reached from the Passwords tab.
 *
 * The same panel the client's own Passwords tab renders, fed the
 * same way — one screen, two doors into it, so a change to how
 * logins work lands in both at once.
 */
export default async function ClientPasswordsPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: client }, { data: credentialRows, error: credentialsError }] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.from("clients").select("id, name").eq("id", params.id).maybeSingle(),
      supabase
        .from("client_credentials")
        .select("id, platform, label, username, url, secret_cipher, notes_cipher, key_id, updated_at")
        .eq("client_id", params.id)
        .order("platform"),
    ]);

  const role = (profile as { role?: ProfileRole } | null)?.role;

  if (role !== "ceo" && role !== "operations_manager" && role !== "staff") {
    redirect("/app/dashboard");
  }

  // Missing because it does not exist, or because this person's RLS
  // filtered it out. Both look the same, as on the client page.
  if (!client) notFound();

  const keyId = currentKeyId();

  // Same mapping as the client page's Passwords tab, and for the same
  // reason: the ciphertext is read here and goes no further.
  const credentials: CredentialSummary[] = (
    (credentialRows ?? []) as unknown as {
      id: string;
      platform: string;
      label: string | null;
      username: string | null;
      url: string | null;
      secret_cipher: string | null;
      notes_cipher: string | null;
      key_id: string | null;
      updated_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    platform: row.platform,
    label: row.label,
    username: row.username,
    url: row.url,
    hasPassword: Boolean(row.secret_cipher),
    hasNotes: Boolean(row.notes_cipher),
    staleKey: Boolean(
      (row.secret_cipher || row.notes_cipher) && keyId && row.key_id && row.key_id !== keyId
    ),
    updatedAt: row.updated_at,
  }));

  const name = (client as { name: string }).name;

  return (
    <main className="page">
      <Link
        href="/app/passwords"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 12,
        }}
      >
        ← All passwords
      </Link>

      <h1 className="page-title page-title-accent">{name}</h1>

      <CredentialsPanel
        clientId={params.id}
        clientName={name}
        initial={credentials}
        available={!credentialsError}
        keyProblem={credentialsKeyProblem()}
        suggestedKey={suggestKey()}
        isCeo={role === "ceo"}
      />

      <p style={{ fontSize: 13, color: "var(--text-3)", margin: "24px 0 0" }}>
        These are also on{" "}
        <Link href={`/app/clients/${params.id}?tab=passwords`} style={{ color: "var(--text-2)" }}>
          {name}’s own page
        </Link>
        , under Passwords.
      </p>
    </main>
  );
}
