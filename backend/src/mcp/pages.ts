import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Auth } from '../auth/auth.ts';
import type { Db } from '../db/client.ts';
import { oauthClient } from '../db/schema.ts';
import { SOCIAL_PROVIDERS, type Env } from '../env.ts';
import { escapeHtml, page, PASSWORD_TOGGLE_SCRIPT, passwordField } from '../html.ts';

// The pages an AI app sends the user to while connecting to StudyMe (OAuth):
//   /oauth/sign-in   sign in (or create an account), then the flow carries on by itself
//   /oauth/consent   "Allow ChatGPT to use your StudyMe?" → Allow / Deny
// Both get the authorization request as a signed query string from Better Auth, and send it
// back as `oauth_query` so Better Auth can continue where it left off.

const PROVIDER_LABELS: Record<(typeof SOCIAL_PROVIDERS)[number], string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
};

/** The AI app's name as it registered itself, e.g. "ChatGPT" or "Claude". */
export async function clientName(db: Db, clientId: string | undefined | null): Promise<string | null> {
  if (!clientId) return null;
  const [row] = await db.select({ name: oauthClient.name }).from(oauthClient).where(eq(oauthClient.clientId, clientId));
  const name = row?.name?.trim();
  return name ? name.slice(0, 40) : null;
}

/** Shared by both pages: posts JSON with the signed query, then follows the redirect Better Auth returns. */
const CLIENT_HELPERS = `
const oauthQuery = location.search.slice(1);
const errorBox = document.getElementById('error');
function showError(message) { errorBox.textContent = message; }
async function post(path, body) {
  const res = await fetch('/api/auth' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, oauth_query: oauthQuery }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error_description || data.error || 'Something went wrong. Please try again.');
  return data;
}
function follow(data) {
  const url = data.url || data.redirect_uri || data.redirectURI;
  if (typeof url === 'string' && url) location.href = url;
  else location.reload();
}
function busy(form, on) { for (const b of form.querySelectorAll('button')) b.disabled = on; }
`;

export function oauthPages(db: Db, auth: Auth, env: Env) {
  const app = new Hono();
  const providers = SOCIAL_PROVIDERS.filter((p) => env.social[p] !== undefined);

  app.get('/sign-in', async (c) => {
    const appName = (await clientName(db, c.req.query('client_id'))) ?? 'An AI app';
    const socialButtons = providers
      .map((p) => `<button type="button" class="secondary" data-provider="${p}">Continue with ${PROVIDER_LABELS[p]}</button>`)
      .join('\n');
    const body = `
<h1>Sign in to connect</h1>
<p><strong>${escapeHtml(appName)}</strong> wants to use your StudyMe decks and notes. Sign in with the account you use in the app.</p>
<form id="form" class="card" novalidate>
  ${socialButtons ? `${socialButtons}<div class="or">or use your email</div>` : ''}
  <label id="name-field" hidden>Name <input name="name" autocomplete="name"></label>
  <label>Email <input name="email" type="email" autocomplete="email" required></label>
  ${passwordField('Password', 'password', 'current-password')}
  <div id="error" class="error" role="alert"></div>
  <button type="submit" class="primary" id="submit">Sign in</button>
  <button type="button" class="link" id="switch">New to StudyMe? Create an account</button>
</form>`;
    const script = `<script>
${CLIENT_HELPERS}
${PASSWORD_TOGGLE_SCRIPT}
const form = document.getElementById('form');
let mode = 'sign-in';
document.getElementById('switch').addEventListener('click', () => {
  mode = mode === 'sign-in' ? 'sign-up' : 'sign-in';
  document.getElementById('name-field').hidden = mode === 'sign-in';
  document.getElementById('submit').textContent = mode === 'sign-in' ? 'Sign in' : 'Create account';
  document.getElementById('switch').textContent = mode === 'sign-in' ? 'New to StudyMe? Create an account' : 'Have an account? Sign in';
  form.password.autocomplete = mode === 'sign-in' ? 'current-password' : 'new-password';
  showError('');
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = form.email.value.trim(), password = form.password.value, name = form.name.value.trim();
  if (!email || !password || (mode === 'sign-up' && !name)) return showError('Please fill in every field.');
  if (mode === 'sign-up' && password.length < 8) return showError('Use at least 8 characters for your password.');
  busy(form, true); showError('');
  try {
    follow(mode === 'sign-in'
      ? await post('/sign-in/email', { email, password })
      : await post('/sign-up/email', { email, password, name }));
  } catch (e) { showError(e.message); busy(form, false); }
});
for (const button of form.querySelectorAll('[data-provider]')) {
  button.addEventListener('click', async () => {
    busy(form, true); showError('');
    try { follow(await post('/sign-in/social', { provider: button.dataset.provider, callbackURL: '/oauth/done' })); }
    catch (e) { showError(e.message); busy(form, false); }
  });
}
</script>`;
    return c.html(page('Sign in', body, script));
  });

  app.get('/consent', async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const appName = (await clientName(db, c.req.query('client_id'))) ?? 'This AI app';
    const body = `
<h1>Allow ${escapeHtml(appName)} to use StudyMe?</h1>
<div class="card">
  <p>${escapeHtml(appName)} will be able to:</p>
  <ul>
    <li>see your flashcard decks, notes, folders and tags</li>
    <li>add new decks, cards and notes for you</li>
  </ul>
  <p class="small">It can't change or delete what you already have. You can disconnect it at any time from ${escapeHtml(appName)}'s settings.</p>
  ${session ? `<p class="small">Signed in as <strong>${escapeHtml(session.user.email)}</strong>.</p>` : ''}
  <form id="form" class="row">
    <button type="button" class="secondary" data-accept="false">Deny</button>
    <button type="button" class="primary" data-accept="true">Allow</button>
  </form>
  <div id="error" class="error" role="alert"></div>
</div>`;
    const script = `<script>
${CLIENT_HELPERS}
const form = document.getElementById('form');
for (const button of form.querySelectorAll('[data-accept]')) {
  button.addEventListener('click', async () => {
    busy(form, true); showError('');
    try { follow(await post('/oauth2/consent', { accept: button.dataset.accept === 'true' })); }
    catch (e) { showError(e.message); busy(form, false); }
  });
}
</script>`;
    return c.html(page('Allow access', body, script));
  });

  // Where a social sign-in lands if it did not carry on to the AI app by itself.
  app.get('/done', (c) =>
    c.html(page('Signed in', '<h1>You are signed in</h1><p>Go back to the AI app and try connecting again.</p>')),
  );

  return app;
}
