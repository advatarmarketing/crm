import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_AREAS, accessForRole, type TeamAccess } from "@/lib/team-access";
import { AccessTable, VideographerTable, type StaffAccessRow, type VideographerRow } from "./access-table";

export const dynamic = "force-dynamic";

/**
 * Team access (0044): the CEO decides, per staff member, whether they
 * see contracts, logins and money on the clients they work on.
 * Which clients they work on is still set on each client's page.
 */
export default async function TeamAccessPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role?: string } | null)?.role !== "ceo") redirect("/app/dashboard");

  const [{ data: staff }, accessRes, { data: assignments }, { data: clientRows }, { data: videographers }, shareRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").eq("role", "staff").order("full_name"),
    // Its own query, allowed to fail: before 0044 the table is missing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("team_access").select("profile_id, contracts, logins, money"),
    supabase.from("client_staff").select("staff_id, client_id"),
    supabase.from("clients").select("id, name"),
    supabase.from("profiles").select("id, full_name").eq("role", "videographer").order("full_name"),
    // 0047, allowed to fail like the one above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("videographer_access").select("profile_id, share_with_client"),
  ]);
  const shareById = new Map<string, boolean>(
    ((shareRes.error ? [] : shareRes.data) ?? []).map((a: { profile_id: string; share_with_client: boolean }) => [a.profile_id, a.share_with_client])
  );

  const accessById = new Map<string, TeamAccess>(
    ((accessRes.error ? [] : accessRes.data) ?? []).map((a: TeamAccess & { profile_id: string }) => [a.profile_id, a])
  );
  const clientsById = new Map<string, string[]>();
  const clientName = new Map(((clientRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  for (const a of (assignments ?? []) as unknown as { staff_id: string; client_id: string }[]) {
    const name = clientName.get(a.client_id);
    if (name) clientsById.set(a.staff_id, [...(clientsById.get(a.staff_id) ?? []), name]);
  }

  const rows: StaffAccessRow[] = ((staff ?? []) as { id: string; full_name: string | null }[]).map((p) => ({
    id: p.id,
    name: p.full_name ?? "Name not set",
    clients: (clientsById.get(p.id) ?? []).sort(),
    access: accessForRole("staff", accessById.get(p.id) ?? null),
  }));

  const videographerRows: VideographerRow[] = ((videographers ?? []) as { id: string; full_name: string | null }[]).map((p) => ({
    id: p.id,
    name: p.full_name ?? "Name not set",
    clients: (clientsById.get(p.id) ?? []).sort(),
    // Before 0047 nothing is enforced, so show what is really true.
    canShare: shareRes.error ? true : shareById.get(p.id) ?? false,
  }));

  return (
    <main className="page page-xs">
      <div className="page-head">
        <h1 className="page-title page-title-accent">Team access</h1>
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 12px", lineHeight: 1.6 }}>
        Choose what each staff member can see on the clients they work on. Changes apply straight away.
      </p>
      <ul style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 24px", paddingLeft: 18, lineHeight: 1.7 }}>
        {ACCESS_AREAS.map((a) => (
          <li key={a.key}>
            <strong>{a.label}:</strong> {a.detail.toLowerCase()}.
          </li>
        ))}
        <li>Staff only ever see the clients they are assigned to. You choose that on each client&rsquo;s page.</li>
        <li>Videographers never see contracts, logins or money. Operations managers see everything on their clients.</li>
      </ul>
      <h2 className="section-title" style={{ margin: "0 0 12px" }}>Staff</h2>
      <AccessTable rows={rows} available={!accessRes.error} />

      <h2 className="section-title" style={{ margin: "36px 0 8px" }}>Videographers</h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 16px", lineHeight: 1.6 }}>
        With the switch off, everything a videographer uploads goes to you and the staff on that client first. One of you
        approves it and sends it to the client. Turn it on for videographers you trust to send work straight to the client.
      </p>
      <VideographerTable rows={videographerRows} available={!shareRes.error} />
      <p style={{ marginTop: 28 }}>
        <Link href="/app/settings/logins">← Logins</Link>
      </p>
    </main>
  );
}
