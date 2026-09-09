import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailIsConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Sends the emails for notifications raised since the last run.
 *
 * Notifications are created by database triggers (0025), which cannot
 * send email — Postgres has no outbound mail. So the triggers mark a
 * row `email_pending` and this route drains the queue.
 *
 * Call it on a schedule. Two ways, either is fine:
 *
 *   - Vercel Cron. Add to vercel.json:
 *       { "crons": [{ "path": "/api/notifications/flush",
 *                     "schedule": "*\/10 * * * *" }] }
 *   - Supabase Database Webhook on `notifications` INSERT pointing
 *     here, for near-instant delivery.
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

  // One page of users covers any realistic team; emails live on
  // auth.users, which only the service-role client can read.
  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  let sent = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const to = emailById.get(row.user_id);

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
      actionUrl: row.href ? `${base}${row.href}` : undefined,
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
