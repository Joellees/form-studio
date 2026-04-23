import { Resend } from "resend";

import { env } from "@/lib/env";

/**
 * Transactional email. Silently no-ops when RESEND_API_KEY is unset — local
 * dev shouldn&rsquo;t need a valid key just to poke at flows that would otherwise
 * send mail. The call still logs to the console so you can eyeball payloads.
 */
let cached: Resend | null = null;
function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!cached) cached = new Resend(env.RESEND_API_KEY);
  return cached;
}

export type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  const client = getClient();
  if (!client) {
    console.info("[email:dev] would send", { to, subject });
    return;
  }
  const from = env.RESEND_FROM_EMAIL || "Form Studio <hello@formstudio.com>";
  const { error } = await client.emails.send({ from, to, subject, html, text });
  if (error) {
    console.error("[email] send failed", error);
  }
}

// ─────────────────────────────────────────────
// Templates — plain HTML, editorial tone.
// ─────────────────────────────────────────────

function layout(body: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="background:#F6F2EB;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1F1E1B;margin:0;padding:40px 20px">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#E9E4D4;border-radius:12px;padding:32px">
      <tr><td>
        <p style="font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:#4A5540;margin:0 0 24px 0">form studio</p>
        ${body}
        <p style="margin:32px 0 0 0;font-size:12px;color:#A8A095">Form Studio · training, by hand.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function sessionScheduledEmail({ clientName, when, trainerName }: { clientName: string; when: string; trainerName: string }) {
  return {
    subject: `${trainerName} scheduled a session`,
    html: layout(
      `<h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 16px 0">A new session is on the calendar.</h1>
       <p>${escape(clientName)}, ${escape(trainerName)} booked ${escape(when)}.</p>`,
    ),
  };
}

export function subscriptionPendingEmail({ trainerName, packageName }: { trainerName: string; packageName: string }) {
  return {
    subject: `Your ${packageName} block is reserved`,
    html: layout(
      `<h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 16px 0">Reserved.</h1>
       <p>${escape(trainerName)} will confirm your payment and unlock your sessions.</p>
       <p style="color:#A8A095;font-size:12px">You&rsquo;ll get another note once payment clears.</p>`,
    ),
  };
}

export function subscriptionPaidEmail({ trainerName, sessionsCount }: { trainerName: string; sessionsCount: number }) {
  return {
    subject: `Your block is active`,
    html: layout(
      `<h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 16px 0">You&rsquo;re in.</h1>
       <p>${escape(trainerName)} confirmed your payment. ${sessionsCount} sessions are ready when you are.</p>`,
    ),
  };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
