import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatShell, type ChatThreadSeed } from "@/components/ChatShell";
import { SectionTabs, type SectionTab } from "@/components/SectionTabs";
import { WorkChat } from "@/components/WorkChat";
import { TeamDirectMessages, type Teammate } from "@/components/TeamDirectMessages";
import { ClientThreadPicker, type PickableClient } from "@/components/ClientThreadPicker";
import { TeamChannel, type ChannelMessage } from "@/components/TeamChannel";
import { displayName } from "@/lib/names";
import { loadTeamDirectory } from "@/lib/people";
import { ProfessionalReplier } from "@/components/replier/ProfessionalReplier";
import { replierOn } from "@/lib/replier-server";
import { RUN_COLUMNS, type Playbook, type ReplierExample, type ReplierRun, type ReplyingAs } from "@/lib/replier";

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
export default async function MessagesPage({ searchParams }: { searchParams?: { tab?: string; run?: string } }) {
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
  // Everyone on the team, from team_directory (0031) rather than
  // `profiles`.
  //
  // This is what "The Crew" was reported broken over: `profiles` is
  // readable by the CEO, staff and the operations manager and nobody
  // else, so a VIDEOGRAPHER resolved no names at all and every
  // message in their own channel rendered as "Someone". The view
  // carries names, roles and photos and leaves phone numbers and
  // notification addresses behind. See lib/people.ts.
  //
  // Clients are excluded by the view itself, and more importantly by
  // direct_messages' own policies.
  const [directory, { data: unreadDms }, { data: channel }] = await Promise.all([
    loadTeamDirectory(supabase),
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

  // Sorted here rather than in the query, because the view is read
  // through a helper that does not take an order.
  const people = directory
    .filter((p) => p.id !== user.id)
    .sort((a, b) => (a.full_name ?? "zzz").localeCompare(b.full_name ?? "zzz"));

  const teammates: Teammate[] = people.map((p) => ({
    id: p.id,
    name: displayName(p.full_name),
    role: p.role,
    unread: unreadBySender.get(p.id) ?? 0,
  }));

  const teamUnread = teammates.reduce((sum, t) => sum + t.unread, 0);

  const nameById: Record<string, string | null> = {};
  for (const p of people) {
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

  // 0056: the Professional Replier, for the CEO and whoever the CEO
  // switches on. Before 0056 the check errors and the tab stays hidden
  // for everyone but the CEO (who sees what to run).
  const isCeo = profile.role === "ceo";
  const { data: canReply, error: replierError } = await supabase.rpc("can_use_replier");
  if (canReply || isCeo) {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [mine, waitingRes, pb, ex] = await Promise.all([
      supabase.from("replier_runs").select(RUN_COLUMNS).eq("created_by", user.id).order("created_at", { ascending: false }).limit(30),
      isCeo
        ? supabase.from("replier_runs").select(RUN_COLUMNS).eq("needs_ceo", true).neq("created_by", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20)
        : Promise.resolve({ data: [] }),
      supabase.from("replier_playbook").select("needs_ceo, house_style, never_promise, facts, updated_at").maybeSingle(),
      isCeo ? supabase.from("replier_examples").select("id, client_message, reply, note, created_at").order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    ]);
    const names: Record<string, string> = {};
    for (const p of directory) names[p.id] = displayName(p.full_name);
    const defaultRole: ReplyingAs = isCeo ? "ceo" : profile.role === "videographer" ? "videographer" : profile.role === "operations_manager" ? "operations" : "sales";
    tabs.push({
      key: "replier",
      label: "Professional Replier",
      badge: isCeo ? ((waitingRes.data ?? []) as unknown[]).length : 0,
      blurb: "Only you and the people the CEO switches on see this. Clients never do.",
      content: (
        <ProfessionalReplier
          isCeo={isCeo}
          available={!replierError}
          keyOn={replierOn()}
          clients={pickableClients}
          names={names}
          initialRuns={(mine.data ?? []) as unknown as ReplierRun[]}
          waiting={(waitingRes.data ?? []) as unknown as ReplierRun[]}
          playbook={(pb.data ?? null) as Playbook | null}
          examples={(ex.data ?? []) as unknown as ReplierExample[]}
          focusRun={searchParams?.run ?? null}
          defaultRole={defaultRole}
        />
      ),
    });
  }

  return (
    <main className="page">
      <h1 className="page-title page-title-accent" style={{ marginBottom: 20 }}>
        Messages
      </h1>
      <SectionTabs tabs={tabs} start={searchParams?.tab ?? null} />
    </main>
  );
}
