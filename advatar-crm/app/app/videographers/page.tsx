import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * The admin-side list of videographers, built the same shape as
 * /app/clients: a list here, a detail page behind each row.
 *
 * Management only. middleware.ts already keeps videographers and
 * clients out of /app/videographers entirely (it isn't in their
 * ALLOWED_PREFIXES), and `profiles`' RLS decides what comes back
 * regardless — but staff can reach any /app path, so this checks for
 * management specifically rather than letting a staff member browse
 * the whole team's workload.
 */
export default async function VideographersPage() {
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

  const role = (profile as { role?: string } | null)?.role as ProfileRole | undefined;

  if (role !== "ceo" && role !== "operations_manager") {
    redirect("/app/dashboard");
  }

  const [{ data: videographers }, { data: assignments }, { data: openTasks }, { data: upcoming }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("role", "videographer")
        .order("full_name", { nullsFirst: false }),
      supabase.from("client_staff").select("staff_id, client_id"),
      supabase.from("tasks").select("id, assigned_to").eq("done", false),
      supabase
        .from("schedule_events")
        .select("id, assigned_to, starts_at")
        .gte("starts_at", new Date().toISOString()),
    ]);

  type Row = { id: string; full_name: string | null; avatar_url: string | null };
  const rows = (videographers ?? []) as unknown as Row[];

  const clientCount = new Map<string, number>();
  for (const a of (assignments ?? []) as unknown as { staff_id: string }[]) {
    clientCount.set(a.staff_id, (clientCount.get(a.staff_id) ?? 0) + 1);
  }

  const taskCount = new Map<string, number>();
  for (const t of (openTasks ?? []) as unknown as { assigned_to: string | null }[]) {
    if (t.assigned_to) taskCount.set(t.assigned_to, (taskCount.get(t.assigned_to) ?? 0) + 1);
  }

  const nextEvent = new Map<string, string>();
  for (const e of ((upcoming ?? []) as unknown as { assigned_to: string | null; starts_at: string }[]).sort(
    (a, b) => a.starts_at.localeCompare(b.starts_at)
  )) {
    if (e.assigned_to && !nextEvent.has(e.assigned_to)) nextEvent.set(e.assigned_to, e.starts_at);
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Videographers</h1>
        <Link href="/app/settings/logins" className="btn" style={{ textDecoration: "none" }}>
          + Add a videographer
        </Link>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-3)" }}>
          No videographers yet. Create one under Logins and they'll appear here.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((v) => {
            const next = nextEvent.get(v.id);
            return (
              <li key={v.id}>
                <Link
                  href={`/app/videographers/${v.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 16px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface)",
                    textDecoration: "none",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-display)",
                      fontSize: 16,
                      color: "var(--text-2)",
                      flexShrink: 0,
                    }}
                  >
                    {initials(v.full_name)}
                  </span>

                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>
                      {v.full_name?.trim() || "Name not set"}
                    </span>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                      {clientCount.get(v.id) ?? 0} client{(clientCount.get(v.id) ?? 0) === 1 ? "" : "s"}
                      {" · "}
                      {taskCount.get(v.id) ?? 0} open task{(taskCount.get(v.id) ?? 0) === 1 ? "" : "s"}
                      {next
                        ? ` · next: ${new Date(next).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                        : " · nothing scheduled"}
                    </span>
                  </span>

                  <span style={{ color: "var(--text-3)", fontSize: 18, flexShrink: 0 }}>→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function initials(name: string | null) {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
