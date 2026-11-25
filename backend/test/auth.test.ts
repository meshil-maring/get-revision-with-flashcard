import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestServer } from './helpers.ts';

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeAll(async () => {
  server = await createTestServer();
});
afterAll(() => server.close());

describe('auth', () => {
  it('signs up, reads the session and signs in again', async () => {
    const { cookie } = await server.signUp('asha@example.com');
    const session = await server.request('/api/auth/get-session', { headers: { Cookie: cookie } });
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe('asha@example.com');

    const signIn = await server.request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'asha@example.com', password: 'correct-horse-battery' }),
    });
    expect(signIn.status).toBe(200);
  });

  it('rejects a wrong password and a short password', async () => {
    await server.signUp('ben@example.com');
    const wrong = await server.request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'ben@example.com', password: 'nope-nope-nope' }),
    });
    expect(wrong.status).toBe(401);

    const short = await server.request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'cy@example.com', password: 'short', name: 'Cy' }),
    });
    expect(short.status).toBe(400);
  });

  it('says whether Google sign-in is available', async () => {
    const res = await server.request('/api/config');
    expect(await res.json()).toEqual({ google: false });
  });
});
