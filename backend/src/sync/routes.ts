import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import type { Auth } from '../auth/auth.ts';
import { requireSession, type SessionVars } from '../auth/require-session.ts';
import type { Db } from '../db/client.ts';
import { sync, syncRequest } from './sync.ts';

/** POST / — see backend/README.md, "How sync works". */
export function syncRoutes(db: Db, auth: Auth) {
  return new Hono<SessionVars>().use(requireSession(auth)).post('/', bodyLimit({ maxSize: 10 * 1024 * 1024 }), async (c) => {
    const parsed = syncRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad sync request.', issues: parsed.error.issues }, 400);
    return c.json(await sync(db, c.get('session').user.id, parsed.data));
  });
}
