import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TemplateForm } from "./TemplateForm";
import { deleteTemplate } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Task templates — a named set of tasks with due dates relative to
 * the day you apply them, so a repeatable job (a shoot cycle, an
 * onboarding run) doesn't get rebuilt by hand each time.
 *
 * Management only, matching the write policies in
 * 0014_onboarding_templates.sql. Everyone who works with clients can
 * still read and apply them from a client's page.
 */
export default async function TemplatesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    redirect("/app/dashboard");
  }

  const { data: templates } = await supabase
    .from("task_templates")
    .select("id, name, description, task_template_items(text, offset_days, position)")
    .order("name");

  type Row = {
    id: string;
    name: string;
    description: string | null;
    task_template_items: { text: string; offset_days: number; position: number }[];
  };
  const rows = (templates ?? []) as unknown as Row[];

  return (
    <main className="page page-sm">
      <h1 className="page-title" style={{ marginBottom: 4 }}>
        Task templates
      </h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 32px" }}>
        Apply one of these to a client from their page and it creates the whole set of tasks, dated from
        the day you apply it.
      </p>

      <TemplateForm />

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>Existing templates</h2>

      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
          No templates yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((t) => (
            <li
              key={t.id}
              style={{
                padding: "14px 16px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15, color: "var(--text-1)" }}>
                    {t.name}
                  </div>
                  {t.description && (
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)" }}>
                      {t.description}
                    </div>
                  )}
                </div>
                <form action={deleteTemplate}>
                  <input type="hidden" name="templateId" value={t.id} />
                  <button
                    type="submit"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      background: "none",
                      border: "none",
                      color: "var(--status-closed)",
                      cursor: "pointer",
                      padding: "6px 0",
                      minHeight: 40,
                      flexShrink: 0,
                    }}
                  >
                    Delete
                  </button>
                </form>
              </div>

              <ol style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                {[...t.task_template_items]
                  .sort((a, b) => a.position - b.position)
                  .map((item, i) => (
                    <li
                      key={i}
                      style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)", marginBottom: 2 }}
                    >
                      {item.text}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
                        {item.offset_days === 0 ? " · same day" : ` · day ${item.offset_days}`}
                      </span>
                    </li>
                  ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
