import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateLoginForm, type ClientOption } from "./create-login-form";
import { LoginsList, type LoginRow } from "./logins-list";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** Mirrors CREATABLE_BY in actions.ts — the actions are the boundary. */
const CREATABLE_BY: Record<string, ProfileRole[]> = {
  ceo: ["ceo", "operations_manager", "staff", "videographer", "client"],
  operations_manager: ["staff", "videographer", "client"],
};

/**
 * Creating and managing every login in one place, so nobody has to
 * touch Supabase's dashboard to add a person.
 *
 * CEO and operations manager only. The operations manager can create
 * and reset the people it manages (staff, videographers, clients) but
 * not another manager or the CEO — enforced in actions.ts, and
 * reflected here so the buttons that would fail aren't rendered.
 */
export default async function LoginsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const callerRole = (profile as { role?: string } | null)?.role as ProfileRole | undefined;

  if (!callerRole || !CREATABLE_BY[callerRole]) {
    redirect("/app/dashboard");
  }

  const creatableRoles = CREATABLE_BY[callerRole];

  // Emails and sign-in history live on auth.users, which only the
  // service-role client can read. Safe here: the role check above has
  // already established the caller manages logins.
  const admin = createAdminClient();

  const [{ data: profileRows }, { data: clientRows }, { data: authUsers }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, client_id"),
    admin.from("clients").select("id, name").order("name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const authById = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, { email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null }])
  );

  const clients: ClientOption[] = ((clientRows ?? []) as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  const ROLE_ORDER = ["ceo", "operations_manager", "staff", "videographer", "client"];

  const logins: LoginRow[] = (
    (profileRows ?? []) as { id: string; full_name: string | null; role: string; client_id: string | null }[]
  )
    .map((p) => {
      const auth = authById.get(p.id);
      return {
        id: p.id,
        fullName: p.full_name,
        role: p.role,
        email: auth?.email ?? null,
        clientName: p.client_id ? clientNameById.get(p.client_id) ?? null : null,
        lastSignInAt: auth?.lastSignInAt ?? null,
        manageable: creatableRoles.includes(p.role as ProfileRole),
      };
    })
    .sort((a, b) => {
      const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
      if (roleDiff !== 0) return roleDiff;
      return (a.fullName ?? "zzz").localeCompare(b.fullName ?? "zzz");
    });

  const unnamed = logins.filter((l) => !l.fullName).length;

  return (
    <main className="page page-xs">
      <div className="page-head">
        <h1 className="page-title page-title-accent">Logins</h1>
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 32px", lineHeight: 1.6 }}>
        Create and manage every login here — staff, videographers and client
        portal accounts. Nothing needs doing in Supabase.
      </p>

      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 4px" }}>Create a login</h2>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 18px", lineHeight: 1.6 }}>
          You'll get a temporary password to pass on. They change it themselves
          after signing in.
        </p>
        <CreateLoginForm creatableRoles={creatableRoles} clients={clients} />
      </section>

      <section style={{ marginBottom: 40, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 4px" }}>
          Existing logins
        </h2>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 18px", lineHeight: 1.6 }}>
          {unnamed > 0
            ? `${logins.length} in total. ${unnamed} ${unnamed === 1 ? "has" : "have"} no name set, which is why they show as "Name not set" on client pages — fill them in below.`
            : `${logins.length} in total.`}
        </p>
        <LoginsList logins={logins} />
      </section>

      <div style={{ paddingTop: 20, borderTop: "1px solid var(--border)" }}>
        <Link href="/app/settings/templates" className="btn" style={{ textDecoration: "none" }}>
          Task templates →
        </Link>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", margin: "10px 0 0" }}>
          Repeatable sets of tasks your team can apply to a client in one click.
        </p>
      </div>
    </main>
  );
}
