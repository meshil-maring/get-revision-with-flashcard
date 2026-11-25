import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import type { Auth } from './auth.ts';
import type { Db } from './db/client.ts';
import type { Env } from './env.ts';
import { sync, syncRequest } from './sync.ts';

type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
type Vars = { Variables: { session: Session } };

export function createApp({ db, auth, env }: { db: Db; auth: Auth; env: Env }) {
  const app = new Hono<Vars>();

  app.use(
    '/api/*',
    cors({
      origin: env.corsOrigins,
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'Cookie', 'expo-origin'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  );

  app.get('/health', (c) => c.json({ ok: true }));

  /** What the sign-in screen should offer. */
  app.get('/api/config', (c) => c.json({ google: env.google !== null }));

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  // Everything below needs a signed-in user.
  app.use('/api/sync', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Sign in first.' }, 401);
    c.set('session', session);
    await next();
  });

  app.post('/api/sync', bodyLimit({ maxSize: 10 * 1024 * 1024 }), async (c) => {
    const parsed = syncRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad sync request.', issues: parsed.error.issues }, 400);
    return c.json(await sync(db, c.get('session').user.id, parsed.data));
  });

  return app;
}
