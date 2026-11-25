import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { Db } from './db/client.ts';
import * as schema from './db/schema.ts';
import type { Env } from './env.ts';

/** Sign-in for the app: email + password, and Google when it is set up. */
export function createAuth(db: Db, env: Env) {
  const trustedOrigins = [...env.corsOrigins, `${env.appScheme}://`];
  if (env.isDev) {
    // Expo Go and dev builds open links like exp://192.168.1.5:8081/--/…
    trustedOrigins.push('exp://', 'exp://**');
  }
  return betterAuth({
    baseURL: env.baseURL,
    secret: env.secret,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    trustedOrigins,
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders: env.google
      ? { google: { clientId: env.google.clientId, clientSecret: env.google.clientSecret } }
      : {},
    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
