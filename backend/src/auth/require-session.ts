import type { MiddlewareHandler } from 'hono';

import type { Auth } from './auth.ts';

export type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
export type SessionVars = { Variables: { session: Session } };

/** Lets the request through only for a signed-in user, and puts their session on `c.get('session')`. */
export function requireSession(auth: Auth): MiddlewareHandler<SessionVars> {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Sign in first.' }, 401);
    c.set('session', session);
    await next();
  };
}
