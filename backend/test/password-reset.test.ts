import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestServer } from './helpers.ts';

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeAll(async () => {
  server = await createTestServer();
});
afterAll(() => server.close());

const post = (path: string, body: unknown, cookie?: string) =>
  server.request(path, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: JSON.stringify(body) });

const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

/** Asks for a reset link and returns the one in the email. */
async function requestLink(email: string) {
  const before = server.emails.length;
  const res = await post('/api/auth/request-password-reset', { email });
  expect(res.status).toBe(200);
  await new Promise((r) => setTimeout(r, 10)); // the email is sent without waiting
  const sent = server.emails.slice(before);
  const link = sent[0]?.text.match(/https?:\/\/\S+/)?.[0];
  return { sent, link };
}

/** Opens the email's link; Better Auth checks it and sends the browser to our page. */
async function openLink(link: string) {
  const res = await server.request(pathOf(link), { redirect: 'manual' });
  expect(res.status).toBe(302);
  return new URL(res.headers.get('location')!);
}

describe('forgot password', () => {
  it('emails a link that leads to the page for choosing a new password', async () => {
    await server.signUp('forgetful@example.com', 'old-password-1');
    const { sent, link } = await requestLink('forgetful@example.com');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'forgetful@example.com', subject: 'Reset your StudyMe password' });
    expect(sent[0].html).toContain('Choose a new password');

    const landing = await openLink(link!);
    expect(landing.pathname).toBe('/account/reset-password');
    expect(landing.searchParams.get('token')).toBeTruthy();

    const page = await (await server.request(landing.pathname + landing.search)).text();
    expect(page).toContain('Choose a new password');
    expect(page).toContain('data-toggle-password'); // Show / Hide buttons
  });

  it('answers the same for an email with no account, and sends nothing', async () => {
    const { sent } = await requestLink('nobody-here@example.com');
    expect(sent).toHaveLength(0);
  });

  it('changes the password, signs out other devices, and the link works only once', async () => {
    const { cookie: oldSession } = await server.signUp('reset-me@example.com', 'old-password-1');
    const { link } = await requestLink('reset-me@example.com');
    const token = (await openLink(link!)).searchParams.get('token');

    expect((await post('/api/auth/reset-password', { newPassword: 'new-password-2', token })).status).toBe(200);

    expect((await post('/api/auth/sign-in/email', { email: 'reset-me@example.com', password: 'old-password-1' })).status).toBe(401);
    expect((await post('/api/auth/sign-in/email', { email: 'reset-me@example.com', password: 'new-password-2' })).status).toBe(200);

    const session = await server.request('/api/auth/get-session', { headers: { Cookie: oldSession } });
    expect(await session.json()).toBeNull();

    // Used once: the link now lands on "expired".
    const again = await openLink(link!);
    expect(again.searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(await (await server.request(again.pathname + again.search)).text()).toContain('This link has expired');
    expect((await post('/api/auth/reset-password', { newPassword: 'third-password-3', token })).status).toBe(400);
  });

  it('refuses a short new password', async () => {
    await server.signUp('short@example.com', 'old-password-1');
    const { link } = await requestLink('short@example.com');
    const token = (await openLink(link!)).searchParams.get('token');
    expect((await post('/api/auth/reset-password', { newPassword: 'short', token })).status).toBe(400);
  });

  it('shows "expired" for a page opened without a good token', async () => {
    expect(await (await server.request('/account/reset-password')).text()).toContain('This link has expired');
    expect(await (await server.request('/account/reset-password?token=<script>')).text()).toContain('This link has expired');
  });
});
