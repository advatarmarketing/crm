import "server-only";

/**
 * Sending email, if this project has been given a way to send it.
 *
 * The CRM has never had an email provider configured — that is why
 * logins are handed over with a temporary password rather than an
 * invite link. Rather than pretend, this returns a result that says
 * plainly whether anything was sent, and every caller is expected to
 * carry on working when nothing was.
 *
 * To turn email on, set both of these in Vercel's environment
 * variables and redeploy:
 *
 *   RESEND_API_KEY   a key from resend.com
 *   EMAIL_FROM       e.g. "Advatar CRM <crm@yourdomain.co.uk>"
 *                    the domain has to be verified in Resend first
 *
 * Resend is called over plain fetch rather than its SDK: one HTTP
 * POST is the whole integration, and a dependency that has to be
 * installed and kept current is a poor trade for that.
 */

export type EmailResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" }
  | { sent: false; reason: "failed"; detail: string };

export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({
  to,
  subject,
  text,
  actionUrl,
  actionLabel,
}: {
  to: string;
  subject: string;
  text: string;
  actionUrl?: string;
  actionLabel?: string;
}): Promise<EmailResult> {
  if (!emailIsConfigured()) {
    return { sent: false, reason: "not-configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject,
        text: actionUrl ? `${text}\n\n${actionLabel ?? "Open"}: ${actionUrl}` : text,
        html: renderHtml({ subject, text, actionUrl, actionLabel }),
      }),
    });

    if (!response.ok) {
      return { sent: false, reason: "failed", detail: `${response.status} ${await response.text()}` };
    }

    return { sent: true };
  } catch (e) {
    return { sent: false, reason: "failed", detail: e instanceof Error ? e.message : "unknown error" };
  }
}

/**
 * Deliberately plain. Email clients strip most CSS, and a
 * notification that arrives looking broken is worse than one that
 * arrives looking like an email.
 */
function renderHtml({
  subject,
  text,
  actionUrl,
  actionLabel,
}: {
  subject: string;
  text: string;
  actionUrl?: string;
  actionLabel?: string;
}): string {
  const button = actionUrl
    ? `<p style="margin:24px 0;">
         <a href="${escapeHtml(actionUrl)}"
            style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;
                   text-decoration:none;font-family:Arial,sans-serif;font-size:14px;">
           ${escapeHtml(actionLabel ?? "Open in the CRM")}
         </a>
       </p>`
    : "";

  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:520px;">
    <p style="font-size:17px;font-weight:bold;margin:0 0 12px;">${escapeHtml(subject)}</p>
    <p style="margin:0;">${escapeHtml(text)}</p>
    ${button}
    <p style="color:#777;font-size:12px;margin-top:28px;">
      Sent by Advatar CRM. You can turn these off from your profile.
    </p>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
