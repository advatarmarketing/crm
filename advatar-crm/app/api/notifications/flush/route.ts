import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailIsConfigured } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Sends the emails for notifications raised since the last run.
 *
 * Notifications are created by database triggers (0025), which cannot
 * send email — Postgres has no outbound mail. So the triggers mark a
 * row `email_pending` and this route drains the queue.
 *
 * Called on a schedule by Vercel Cron — see vercel.json, which runs
 * it every fifteen minutes. A Supabase Database Webhook on
 * `notifications` INSERT pointing here would deliver in near real
 * time instead, if that ever matters more than it does today.
 *
 * Protected by NOTIFICATIONS_CRON_SECRET when that is set. Vercel Cron
 * sends its own Authorization header, which is accepted too. With no
 * secret configured the route still works — it only ever sends mail
 * that a trigger already decided to send, so the worst an unwanted
 * caller achieves is making the queue drain sooner.
 */
export async function POST(request: Request) {
  const secret = process.env.NOTIFICATIONS_CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!emailIsConfigured()) {
    return NextResponse.json({
      sent: 0,
      skipped: "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM to turn it on — in-app notifications work regardless.",
    });
  }

  const admin = createAdminClient();

  const { data: pending, error } = await admin
    .from("notifications")
    .select("id, user_id, title, body, href")
    .eq("email_pending", true)
    .order("created_at")
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (pending ?? []) as {
    id: string;
    user_id: string;
    title: string;
    body: string | null;
    href: string | null;
  }[];

  if (rows.length === 0) return NextResponse.json({ sent: 0 });

  // Where to write to somebody, in order of preference:
  //
  //   1. profiles.notify_email — what they (or management on their
  //      behalf) asked for. A login is often a shared or made-up
  //      address; this is the one a person actually reads.
  //   2. their login address, so email works with nothing filled in.
  //
  // One page of users covers any realistic team. Login emails live on
  // auth.users, which only the service-role client can read.
  const [{ data: authUsers }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, notify_email"),
  ]);

  const loginEmailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const preferredById = new Map(
    ((profiles ?? []) as { id: string; notify_email: string | null }[])
      .map((p) => [p.id, p.notify_email?.trim() || null] as const)
      .filter(([, email]) => !!email)
  );

  // Null when nothing knows this deployment's address. The button is
  // then left off rather than pointing at "/app/uploads", which in an
  // inbox is a dead link that looks like a working one.
  const base = siteUrl();

  let sent = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const to = preferredById.get(row.user_id) ?? loginEmailById.get(row.user_id);

    // No address, nothing to send — clear the flag so it is not
    // retried forever.
    if (!to) {
      await admin.from("notifications").update({ email_pending: false }).eq("id", row.id);
      continue;
    }

    const result = await sendEmail({
      to,
      subject: row.title,
      text: row.body ?? row.title,
      actionUrl: base && row.href ? `${base}${row.href}` : undefined,
      actionLabel: "Open in the CRM",
    });

    if (result.sent) {
      await admin
        .from("notifications")
        .update({ email_pending: false, email_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent += 1;
    } else if (result.reason === "failed") {
      // Left pending on purpose: a provider blip should be retried on
      // the next run rather than silently dropping the notification.
      failures.push(`${row.id}: ${result.detail}`);
    }
  }

  return NextResponse.json({ sent, failed: failures.length, failures: failures.slice(0, 5) });
}

// Vercel Cron issues GET requests.
export async function GET(request: Request) {
  return POST(request);
}
