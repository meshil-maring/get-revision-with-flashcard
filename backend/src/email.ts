import type { Env } from './env.ts';

export type Email = { to: string; subject: string; text: string; html: string };

/** Sends emails (password reset links). */
export type Mailer = { send(email: Email): Promise<void> };

/**
 * Resend (https://resend.com) when RESEND_API_KEY is set. Otherwise, while developing, the email
 * is printed in the server's terminal so its link can be opened from there.
 */
export function createMailer(env: Env): Mailer {
  const { resendApiKey, from } = env.email;
  if (!resendApiKey) {
    return {
      async send(email) {
        if (!env.isDev) {
          console.error(`Email to ${email.to} not sent: set RESEND_API_KEY (see .env.example).`);
          return;
        }
        console.log(`\n--- Email (not sent: no RESEND_API_KEY) ---\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n---\n`);
      },
    };
  }
  return {
    async send(email) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      });
      if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** The "reset your password" email. */
export function passwordResetEmail(to: string, name: string, url: string): Email {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    to,
    subject: 'Reset your StudyMe password',
    text: `${greeting}

Someone (hopefully you) asked to reset the password for your StudyMe account.
Open this link to choose a new password. It works for 1 hour, once:

${url}

If you didn't ask for this, ignore this email: your password stays the same.

StudyMe`,
    html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2933;max-width:480px">
<p style="font-weight:800;color:#2f6bd8;font-size:18px">StudyMe</p>
<p>${escapeHtml(greeting)}</p>
<p>Someone (hopefully you) asked to reset the password for your StudyMe account. The link works for 1 hour, once.</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#2f6bd8;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px">Choose a new password</a></p>
<p style="color:#5c6773;font-size:14px">If you didn't ask for this, ignore this email: your password stays the same.</p>
</div>`,
  };
}
