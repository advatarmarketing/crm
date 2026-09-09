import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatShell, type ChatThreadSeed } from "@/components/ChatShell";
import { SectionTabs, type SectionTab } from "@/components/SectionTabs";
import { WorkChat } from "@/components/WorkChat";
import { TeamDirectMessages, type Teammate } from "@/components/TeamDirectMessages";
import { ClientThreadPicker, type PickableClient } from "@/components/ClientThreadPicker";
import { TeamChannel, type ChannelMessage } from "@/components/TeamChannel";
import { displayName } from "@/lib/names";

export const dynamic = "force-dynamic";

// Phase 10: staff/ceo/videographer chat. Every query below is sent
// as-is and rendered from whatever comes back — no `if (role ===
// 'ceo')` branch on the data. A videographer's session naturally
// only gets their assigned clients back from the `clients` and
// `message_threads` queries, because of Phase 3's "clients:
// videographer read assigned" / "message_threads: videographer read
// assigned" RLS policies — the exact same code path ceo/staff hit.
//
// Phase 24 (prompt 13) changes how those results are *arranged* for a
// videographer, not what comes back: Work Chat gathers the three
// conversations that are about the job — with a client, about a
// client, and with the crew — and Admin is the private one-to-one
// with management. The point of the split is that "is the client in
// this room" should never be something you have to remember.
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
    // badge).
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

  // ---------------- team messaging ----------------
  // Everyone on the team except the viewer. `profiles` RLS already
  // limits this to people this role may see; clients are excluded
  // here and, more importantly, by direct_messages' own policies.
  const [{ data: people }, { data: unreadDms }, { data: channel }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["ceo", "operations_manager", "staff", "videographer"])
      .neq("id", user.id)
      .order("full_name", { nullsFirst: false }),
    supabase.from("direct_messages").select("sender_id").eq("recipient_id", user.id).eq("read", false),
    supabase
      .from("team_channel_messages")
      .select("id, body, created_at, author_id")
      .eq("channel", "videographers")
      .order("created_at")
      .limit(200),
  ]);

  const unreadBySender = new Map<string, number>();
  for (const row of ((unreadDms ?? []) as unknown as { sender_id: string }[])) {
    unreadBySender.set(row.sender_id, (unreadBySender.get(row.sender_id) ?? 0) + 1);
  }

  const teammates: Teammate[] = ((people ?? []) as unknown as {
    id: string;
    full_name: string | null;
    role: string;
  }[]).map((p) => ({
    id: p.id,
    name: displayName(p.full_name),
    role: p.role,
    unread: unreadBySender.get(p.id) ?? 0,
  }));

  const teamUnread = teammates.reduce((sum, t) => sum + t.unread, 0);

  const nameById: Record<string, string | null> = {};
  for (const p of ((people ?? []) as unknown as { id: string; full_name: string | null }[])) {
    nameById[p.id] = p.full_name?.trim() || null;
  }
  nameById[user.id] = "You";

  const channelMessages: ChannelMessage[] = ((channel ?? []) as unknown as ChannelMessage[]).map((m) => ({
    ...m,
    authorName: m.author_id ? nameById[m.author_id] ?? null : null,
  }));

  const pickableClients: PickableClient[] = (clients ?? []).map((c) => ({ id: c.id, name: c.name }));
  const clientUnread = seeds.reduce((sum, s) => sum + s.unreadCount, 0);

  const isVideographer = profile.role === "videographer";

  const clientConversations = (
    <ChatShell currentUserId={user.id} canCreateThreads={canCreateThreads} initialThreads={seeds} />
  );
  const internalClientThreads = (
    <ClientThreadPicker clients={pickableClients} currentUserId={user.id} nameById={nameById} />
  );
  const crewChannel = <TeamChannel initialMessages={channelMessages} currentUserId={user.id} />;

  // Management sees management: an "admin" tab that listed other
  // videographers wouldn't be an admin tab.
  const adminContacts = teammates.filter((t) => t.role !== "videographer");

  const tabs: SectionTab[] = isVideographer
    ? [
        {
          key: "work",
          label: "Work Chat",
          badge: clientUnread,
          content: (
            <WorkChat
              sections={[
                {
                  key: "with-client",
                  label: "With the client",
                  audience: "The client reads this. It's the conversation in their portal.",
                  clientVisible: true,
                  badge: clientUnread,
                  content: clientConversations,
                },
                {
                  key: "about-client",
                  label: "Team about a client",
                  audience: "Team only. A client login has no access to this thread at all.",
                  clientVisible: false,
                  content: internalClientThreads,
                },
                {
                  key: "crew",
                  label: "The crew",
                  audience: "Every videographer, plus the office. No clients.",
                  clientVisible: false,
                  content: crewChannel,
                },
              ]}
            />
          ),
        },
        {
          key: "admin",
          label: "Admin",
          badge: adminContacts.reduce((sum, t) => sum + t.unread, 0),
          blurb:
            "One-to-one with the office. Nobody else can read these — there is no manager override on a direct message.",
          content: <TeamDirectMessages teammates={adminContacts} currentUserId={user.id} />,
        },
      ]
    : [
        {
          key: "clients",
          label: "Clients",
          badge: clientUnread,
          blurb: "The conversations your clients see in their portal.",
          content: clientConversations,
        },
        {
          key: "internal",
          label: "About a client",
          blurb: "Team notes on a client. A client login has no access to these at all.",
          content: internalClientThreads,
        },
        {
          key: "team",
          label: "Team",
          badge: teamUnread,
          blurb: "One-to-one with a colleague. Only the two of you can read it.",
          content: <TeamDirectMessages teammates={teammates} currentUserId={user.id} />,
        },
        {
          key: "crew",
          label: "The crew",
          blurb: "The videographers' group channel. You're in it; clients are not.",
          content: crewChannel,
        },
      ];

  return (
    <main className="page">
      <h1 className="page-title page-title-accent" style={{ marginBottom: 20 }}>
        Messages
      </h1>
      <SectionTabs tabs={tabs} />
    </main>
  );
}
