import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatShell, type ChatThreadSeed } from "@/components/ChatShell";

// Phase 10: staff/ceo/videographer chat. Every query below is sent
// as-is and rendered from whatever comes back — no `if (role ===
// 'ceo')` branch in this file. A videographer's session naturally
// only gets their assigned clients back from the `clients` and
// `message_threads` queries, because of Phase 3's "clients:
// videographer read assigned" / "message_threads: videographer read
// assigned" RLS policies — the exact same code path ceo/staff hit.
export default async function MessagesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!profile?.role) {
    redirect("/login");
  }

  // Only ceo/staff may create a brand-new thread for a client with
  // none yet (0007_messaging.sql's RLS on message_threads' insert) —
  // this just decides whether ChatShell tries, the RLS is what
  // actually enforces it either way.
  const canCreateThreads =
    profile.role === "ceo" || profile.role === "operations_manager" || profile.role === "staff";

  const [{ data: clients }, { data: threads }, { data: unread }] = await Promise.all([
    supabase.from("clients").select("id, name, avatar_url").order("name"),
    // Nested `messages(...)` embed, sliced to just the single most
    // recent row per thread via `.order()`/`.limit()` with
    // `foreignTable` — this is PostgREST's supported way to fetch "the
    // latest child row" without a second round trip per thread.
    supabase
      .from("message_threads")
      .select("id, client_id, messages(id, body, sender_role, created_at)")
      .order("created_at", { foreignTable: "messages", ascending: false })
      .limit(1, { foreignTable: "messages" }),
    // Every unread message across every thread this role's RLS lets
    // it see, not sent by this user — the same definition of "unread"
    // used everywhere else in this feature (ChatShell, the nav
    // badge). Reduced into a per-thread count client-side below
    // rather than a `group by` in SQL — fine at this app's scale,
    // flagged the same way Phase 9's Content Hub flagged loading a
    // whole planner client-side rather than aggregating in Postgres.
    supabase.from("messages").select("thread_id").eq("read", false).neq("sender_id", user.id),
  ]);

  type ThreadRow = {
    id: string;
    client_id: string;
    messages: { id: string; body: string; sender_role: string | null; created_at: string }[];
  };
  const threadRows = (threads ?? []) as unknown as ThreadRow[];
  const threadByClient = new Map(threadRows.map((t) => [t.client_id, t]));

  const unreadByThread = new Map<string, number>();
  for (const row of unread ?? []) {
    unreadByThread.set(row.thread_id, (unreadByThread.get(row.thread_id) ?? 0) + 1);
  }

  const seeds: ChatThreadSeed[] = (clients ?? []).map((c) => {
    const thread = threadByClient.get(c.id);
    const last = thread?.messages?.[0];
    return {
      clientId: c.id,
      clientName: c.name,
      clientAvatarUrl: c.avatar_url,
      threadId: thread?.id ?? null,
      lastMessage: last ? { body: last.body, createdAt: last.created_at, senderRole: last.sender_role } : null,
      unreadCount: thread ? unreadByThread.get(thread.id) ?? 0 : 0,
    };
  });

  return <ChatShell currentUserId={user.id} canCreateThreads={canCreateThreads} initialThreads={seeds} />;
}
