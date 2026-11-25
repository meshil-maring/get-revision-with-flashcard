import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { Auth } from './auth/auth.ts';
import type { Db } from './db/client.ts';
import { SOCIAL_PROVIDERS, type Env } from './env.ts';
import { syncRoutes } from './sync/routes.ts';

export function createApp({ db, auth, env }: { db: Db; auth: Auth; env: Env }) {
  const app = new Hono();

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
  app.get('/api/config', (c) =>
    c.json({ providers: SOCIAL_PROVIDERS.filter((provider) => env.social[provider] !== undefined) }),
  );

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.route('/api/sync', syncRoutes(db, auth));

  return app;
}
