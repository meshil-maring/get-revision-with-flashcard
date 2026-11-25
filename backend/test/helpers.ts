import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth/auth.ts';
import { openDatabase } from '../src/db/client.ts';
import { readEnv } from '../src/env.ts';

export async function createTestServer(extraEnv: NodeJS.ProcessEnv = {}) {
  const env = readEnv({
    NODE_ENV: 'test',
    BETTER_AUTH_URL: 'http://localhost:4000',
    CORS_ORIGINS: 'http://localhost:8081',
    ...extraEnv,
  });
  const database = await openDatabase('memory://');
  const auth = createAuth(database.db, env);
  const app = createApp({ db: database.db, auth, env });

  const request = (path: string, init: RequestInit = {}) =>
    app.request(`http://localhost:4000${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081', ...init.headers },
    });

  /** Signs up a new user and returns their session cookie. */
  async function signUp(email: string, password = 'correct-horse-battery') {
    const res = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: email.split('@')[0] }),
    });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    return { cookie, user: ((await res.json()) as { user: { id: string } }).user };
  }

  return { app, auth, db: database.db, request, signUp, close: database.close };
}
