import type { TourDone, TourStep, WelcomeScreen } from "@/components/portal/ClientTour";

/**
 * The walkthroughs for the team: one for videographers, one for sales
 * (the "staff" role). Each opens with a short welcome, then tours the
 * pages that person actually has. Wording lives here, in one place.
 *
 * Your Journey is described by its first goal only ("get paid"); the
 * minimum level and the reason for it are never mentioned.
 */

export type TeamTourKind = "videography" | "sales";

export const TEAM_TOUR_LABEL: Record<TeamTourKind, string> = {
  videography: "Videography team",
  sales: "Sales team",
};

const WELCOME: Record<TeamTourKind, WelcomeScreen[]> = {
  videography: [
    {
      lines: [
        <h1 key="a">Welcome to the team</h1>,
        <p key="b">You&rsquo;re not just filming videos. You&rsquo;re building brands people remember.</p>,
      ],
    },
    {
      lines: [
        <h2 key="a">Every video you make puts a business in front of thousands of people.</h2>,
        <p key="b">That&rsquo;s real impact, and it starts with your eye and your craft.</p>,
      ],
    },
    {
      lines: [
        <h2 key="a">Here, you grow.</h2>,
        <p key="b">Better shots, more clients, bigger earnings, and a clear path to leading your own team one day. Your Journey shows you exactly how.</p>,
      ],
    },
    {
      lines: [
        <h2 key="a">Everything you need is in this app: what&rsquo;s due, how to make it, and where it goes.</h2>,
        <p key="b">Let&rsquo;s get you set up.</p>,
      ],
    },
  ],
  sales: [
    {
      lines: [
        <h1 key="a">Welcome to the team</h1>,
        <p key="b">Every client Advatar works with starts with a conversation, and that&rsquo;s you.</p>,
      ],
    },
    {
      lines: [
        <h2 key="a">You&rsquo;re not selling videos. You&rsquo;re helping businesses get seen, grow and win.</h2>,
        <p key="b">We&rsquo;ve done it for over 60 brands, and you&rsquo;re how we reach the next 60.</p>,
      ],
    },
    {
      lines: [
        <h2 key="a">Here, the more you bring in, the further you go.</h2>,
        <p key="b">Your Journey shows the path, from your first client to building a team of your own.</p>,
      ],
    },
    {
      lines: [
        <h2 key="a">This app keeps every lead, client and conversation in one place, and helps you reply like a pro.</h2>,
        <p key="b">Let&rsquo;s take a look.</p>,
      ],
    },
  ],
};

const DONE: Record<TeamTourKind, TourDone> = {
  videography: {
    title: "You’re all set",
    body: "You can replay this tour, or the welcome, any time from the ⓘ button in the corner. Your first three things:",
    firsts: ["Open My Clients and check your next video.", "Read the filming guide for its content pillar.", "Look at Your Journey to see what’s next for you."],
  },
  sales: {
    title: "You’re all set",
    body: "Processes come first: anything about contracts, renewals, prices or refunds goes to the CEO before you reply. You can replay this tour any time from the ⓘ button. Your first three things:",
    firsts: ["Check your leads and update where each one is up to.", "Look at your clients’ dashboards.", "Try the Professional Replier on a real client message."],
  },
};

export const TEAM_HOME: Record<TeamTourKind, string> = {
  videography: "/app/my-dashboard",
  sales: "/app/dashboard",
};

/**
 * The stops, built for one person. `clientId` is one of their clients
 * (so the tour can open a real client page); without one, the stops
 * that need it are left out. `hidden` holds anything they can't open.
 */
export function teamTourSteps(kind: TeamTourKind, opts: { clientId: string | null; hidden: string[]; replier: boolean }): TourStep[] {
  const { clientId, hidden, replier } = opts;
  const all: (TourStep | null | "" | false)[] =
    kind === "videography"
      ? [
          {
            path: "/app/my-dashboard",
            selector: "[data-tour='deadlines'] .section, .stat-row, main",
            title: "Your dashboard",
            body: "What’s due this week for each of your clients. Aim to finish videos by the Friday before they go out. The latest is 3 days before posting.",
          },
          {
            path: "/app/my-clients",
            selector: "main .card-grid, main",
            title: "My Clients",
            body: "The clients you work on. Tap one to open their page.",
          },
          clientId && {
            path: `/app/my-clients/${clientId}`,
            selector: "section[aria-label='Dashboard'], main",
            title: "Each client’s dashboard",
            body: "Every video’s four steps (film, edit, submit, post) with their due dates. Tick them here, on To-do or on your dashboard: it’s the same tick everywhere.",
          },
          clientId && {
            path: `/app/my-clients/${clientId}`,
            selector: "section[aria-label='Scripts'], main",
            title: "Scripts",
            body: "The scripts written for this client, attached to the videos you’ll film. Below them: the brand kit, the team thread and the content plan.",
          },
          {
            path: "/app/tools",
            selector: ".gl-side, .gl-sections, main",
            title: "Guidelines",
            body: "How each client’s content pillars are filmed and edited. Switch between Filming and Editing at the top, pick a pillar on the left, then press Start a new video for a fresh checklist, so nothing gets missed.",
          },
          {
            path: "/app/uploads",
            selector: "main .card-grid, main .stat-row, main",
            title: "Uploads",
            body: "Where finished videos go. The office checks them before they reach the client, unless you’ve been trusted to send straight through.",
          },
          {
            path: "/app/calendar",
            selector: "main .section, main",
            title: "Calendar",
            body: "Your shoot days: where and when you’re filming. Schedule has the full posting plan.",
          },
          {
            path: "/app/todo",
            selector: "main .dashboard-widgets, main",
            title: "To-do",
            body: "Everything waiting on you, in one list.",
          },
          {
            path: "/app/messages",
            selector: "main",
            title: "Messages",
            body: "Talk to the client, the team about a client, the crew, or the office privately.",
          },
          {
            path: "/app/my-portfolio",
            selector: "main .stat-row, main",
            title: "Portfolio",
            body: "Your best work, building up as you go.",
          },
          {
            path: "/app/journey",
            selector: ".jy-hero, .jy, main",
            title: "Your Journey",
            body: "Where you are, what’s next, and the steps to tick to move up. Management signs them off.",
          },
          {
            path: "/app/my-payments",
            selector: "main .card, main",
            title: "My Payments",
            body: "What you’ve been paid and what’s coming.",
          },
        ]
      : [
          {
            path: "/app/dashboard",
            selector: "main .section, main",
            title: "Your dashboard",
            body: "What needs you today, and how each client is tracking.",
          },
          {
            path: "/app/leads",
            selector: "[data-tour='pipeline'], main .stat-row, main",
            title: "Leads",
            body: "Every lead and where it’s up to. Keep it current: it’s how the whole team knows what’s coming.",
          },
          {
            path: "/app/clients",
            selector: "main .filter-bar, main",
            title: "Clients",
            body: "The clients you look after. Tap one to open their page.",
          },
          clientId && {
            path: `/app/clients/${clientId}?tab=dashboard`,
            selector: "[role='tablist'], main",
            title: "Each client’s page",
            body: "Their videos, what’s due, scripts and content plan, each in its own tab along the top.",
          },
          clientId && {
            path: `/app/clients/${clientId}?tab=performance`,
            selector: "main .fade-in, main",
            title: "Performance",
            body: "How the client’s content is doing: views, followers, likes and comments over time, with reports you can share with them.",
          },
          {
            path: "/app/calendar",
            selector: "main .section, main",
            title: "Calendar",
            body: "Your calls, plus filming and posting dates.",
          },
          {
            path: "/app/todo",
            selector: "main .dashboard-widgets, main",
            title: "To-do",
            body: "Follow-ups and tasks, in one place.",
          },
          {
            path: "/app/messages",
            selector: "main",
            title: "Messages",
            body: "Conversations with clients and the team.",
          },
          replier
            ? {
                path: "/app/messages?tab=replier",
                selector: ".pr, main",
                title: "Professional Replier",
                body: "Paste what a client said and get the best reply plus two more. When it says “Needs the CEO first”, don’t agree to anything yet: it’s sent to the CEO, and you’ll hear back.",
              }
            : null,
          {
            path: "/app/notes",
            selector: "main",
            title: "Notes",
            body: "Notes from calls, and ideas as they come to you.",
          },
          {
            path: "/app/passwords",
            selector: "main .card-grid, main",
            title: "Passwords",
            body: "Clients’ social media logins, kept securely.",
          },
          {
            path: "/app/journey",
            selector: ".jy-hero, .jy, main",
            title: "Your Journey",
            body: "Your level, what’s next, and the clients and earnings that go with each level.",
          },
          {
            path: "/app/my-payments",
            selector: "main .card, main",
            title: "My Payments",
            body: "What you’ve earned.",
          },
        ];
  return all.filter((s): s is TourStep => !!s && !hidden.includes(s.path.split("?")[0]));
}

export function teamTour(kind: TeamTourKind, opts: { replier: boolean }) {
  let done = DONE[kind];
  // Nobody is told to try something they haven't been given.
  if (kind === "sales" && !opts.replier && done.firsts) {
    done = { ...done, firsts: [...done.firsts.slice(0, 2), "Open Messages and reply to anything waiting on you."] };
  }
  return { welcome: WELCOME[kind], done, home: TEAM_HOME[kind] };
}
