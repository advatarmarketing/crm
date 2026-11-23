import Link from "next/link";
import { notFound } from "next/navigation";
import { AdvatarMark } from "./YouButton";
import { MeterCard } from "@/components/clientwork/ClientWorkDashboard";
import { loadClientMeters } from "@/lib/client-work";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

const CHOICES = [
  { kind: "personal", title: "Personal brand", line: "Your own face and story." },
  { kind: "business", title: "The business", line: "Advatar's own channels." },
] as const;

/**
 * YOU (0053): pick which of your own brands to work on, then it's the
 * same dashboard as any client. Only the CEO and the people the CEO
 * switched on can see these two; to anyone else this page doesn't
 * exist.
 */
export async function YouPicker({ supabase, isCeo, base }: { supabase: QueryableClient; isCeo: boolean; base: string }) {
  const { data, error } = await supabase.from("clients").select("id, internal_kind").not("internal_kind", "is", null);
  const rows = (error ? [] : data ?? []) as { id: string; internal_kind: string }[];
  if (!rows.length && !isCeo) notFound();
  const meters = rows.length ? await loadClientMeters(supabase).catch(() => []) : [];

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title page-title-accent you-title">
          <AdvatarMark height={28} /> YOU
        </h1>
      </div>
      <p className="you-intro">Your own content. Choose which one to work on.</p>
      {error ? (
        <p className="access-note">YOU starts once database update 0053 has been run in Supabase.</p>
      ) : (
        <div className="you-choices">
          {CHOICES.map((c) => {
            const row = rows.find((r) => r.internal_kind === c.kind);
            if (!row) return null;
            const m = meters.find((x) => x.clientId === row.id);
            return (
              <Link key={c.kind} href={`${base}/${row.id}`} className="you-choice">
                <span className="you-choice-kind">{c.title}</span>
                <span className="you-choice-line">{c.line}</span>
                {m ? <MeterCard meter={m.meter} compact /> : <span className="you-choice-line">No videos scheduled yet.</span>}
                <span className="you-choice-go">Open dashboard →</span>
              </Link>
            );
          })}
        </div>
      )}
      <p style={{ marginTop: 28 }}>
        <Link href={base}>← Clients</Link>
      </p>
    </main>
  );
}
