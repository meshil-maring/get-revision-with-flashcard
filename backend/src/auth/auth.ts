import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { Db } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import type { Env } from '../env.ts';

/** Sign-in for the app: email + password, and Google / Microsoft / Facebook when they are set up. */
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
    socialProviders: {
      ...(env.social.google && { google: env.social.google }),
      ...(env.social.microsoft && {
        microsoft: { ...env.social.microsoft, tenantId: env.microsoftTenantId, prompt: 'select_account' as const },
      }),
      ...(env.social.facebook && { facebook: env.social.facebook }),
    },
    // Signing in with Google or Microsoft using the same (verified) email as an existing
    // account adds that sign-in to it, instead of failing. Facebook doesn't confirm emails,
    // so a Facebook sign-in for an email that already has an account is refused.
    account: { accountLinking: { enabled: true, trustedProviders: ['google', 'microsoft'] } },
    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
