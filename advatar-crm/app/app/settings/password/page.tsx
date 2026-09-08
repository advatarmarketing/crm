import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

/**
 * Open to every role, unlike everything else under /app/settings.
 *
 * Logins are created with a temporary password (see
 * settings/logins/actions.ts), so every role — videographers and
 * clients included — needs somewhere to replace it. middleware.ts
 * allows this exact path for all roles for that reason.
 */
export default async function ChangePasswordPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="page-narrow">
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          letterSpacing: "0.02em",
          margin: "0 0 4px",
          color: "var(--text-1)",
        }}
      >
        Password
      </h1>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--text-2)",
          margin: "0 0 32px",
          lineHeight: 1.6,
        }}
      >
        Signed in as {user.email}. If you were given a temporary password, change
        it here.
      </p>

      <ChangePasswordForm />
    </main>
  );
}
