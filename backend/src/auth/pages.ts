import { Hono } from 'hono';

import { escapeHtml, page, PASSWORD_TOGGLE_SCRIPT, passwordField } from '../html.ts';

// /account/reset-password — where a "forgot password" email's link lands, after Better Auth has
// checked the link: ?token=… when it is good, ?error=INVALID_TOKEN when it is used up or expired.
// A page on the server (not in the app), so the link works from any email app, phone or computer.

const EXPIRED = `
<h1>This link has expired</h1>
<div class="card">
  <p>Password reset links work once, for 1 hour. In StudyMe, choose <strong>Sign in → Forgot password?</strong>
  to get a new one.</p>
</div>`;

export function accountPages() {
  const app = new Hono();

  app.get('/reset-password', (c) => {
    const token = c.req.query('token') ?? '';
    if (c.req.query('error') || !/^[A-Za-z0-9_-]{8,200}$/.test(token)) {
      return c.html(page('Link expired', EXPIRED));
    }

    const body = `
<h1>Choose a new password</h1>
<form id="form" class="card" novalidate>
  <p class="small">Use at least 8 characters. You'll be signed out on your other devices.</p>
  ${passwordField('New password', 'password', 'new-password')}
  ${passwordField('Type it again', 'confirm', 'new-password')}
  <div id="error" class="error" role="alert"></div>
  <button type="submit" class="primary">Save new password</button>
</form>`;
    const script = `<script>
${PASSWORD_TOGGLE_SCRIPT}
const token = ${JSON.stringify(escapeHtml(token))};
const form = document.getElementById('form');
const errorBox = document.getElementById('error');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = form.password.value, confirm = form.confirm.value;
  if (password.length < 8) return (errorBox.textContent = 'Use at least 8 characters.');
  if (password !== confirm) return (errorBox.textContent = "The two passwords don't match.");
  errorBox.textContent = '';
  form.querySelector('button[type=submit]').disabled = true;
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: password, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === 'INVALID_TOKEN') { location.href = location.pathname + '?error=INVALID_TOKEN'; return; }
      throw new Error(data.message || 'Something went wrong. Please try again.');
    }
    form.outerHTML = '<div class="card"><p class="done"><strong>Your password has been changed.</strong></p>'
      + '<p>Go back to StudyMe and sign in with your new password.</p></div>';
    document.querySelector('h1').textContent = 'Password changed';
  } catch (e) {
    errorBox.textContent = e.message || 'Could not reach StudyMe. Check your connection and try again.';
    form.querySelector('button[type=submit]').disabled = false;
  }
});
</script>`;
    return c.html(page('New password', body, script));
  });

  return app;
}
