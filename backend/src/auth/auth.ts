import { expo } from '@better-auth/expo';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt } from 'better-auth/plugins';

import type { Db } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import { createMailer, passwordResetEmail, type Mailer } from '../email.ts';
import type { Env } from '../env.ts';

/** Where the sign-in and allow-access pages for AI apps are served (see src/mcp/pages.ts). */
export const OAUTH_SIGN_IN_PAGE = '/oauth/sign-in';
export const OAUTH_CONSENT_PAGE = '/oauth/consent';
/** Where a password reset link lands to choose the new password (see src/auth/pages.ts). */
export const RESET_PASSWORD_PAGE = '/account/reset-password';

/**
 * Sign-in for the app: email + password, and Google / Microsoft / Facebook when they are set up.
 * It is also the OAuth server that AI apps (ChatGPT, Claude) use to connect to the MCP server
 * at {BETTER_AUTH_URL}/mcp: they register themselves, the user signs in and allows access,
 * and the app gets a token that only works for that user's MCP server.
 */
export function createAuth(db: Db, env: Env, mailer: Mailer = createMailer(env)) {
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
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Forgot password: the email's link checks the token, then opens our page to choose a new
      // password (always ours, whatever the app asked for). The link works once, for an hour.
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, token }) => {
        const page = encodeURIComponent(`${env.baseURL}${RESET_PASSWORD_PAGE}`);
        const url = `${env.baseURL}/api/auth/reset-password/${token}?callbackURL=${page}`;
        // Not awaited, so the answer takes as long whether or not the email has an account.
        void mailer.send(passwordResetEmail(user.email, user.name, url)).catch((error: unknown) => {
          console.error('Could not send the password reset email:', error);
        });
      },
      // After a reset, every device is signed out, in case someone else knew the old password.
      revokeSessionsOnPasswordReset: true,
    },
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
    // The JWT plugin's own /token route would clash with OAuth; OAuth tokens come from /oauth2/token.
    disabledPaths: ['/token'],
    plugins: [
      expo(),
      // Signs the access tokens AI apps get, so the MCP route can check them without a database read.
      jwt({ disableSettingJwtHeader: true }),
      mcp({
        resource: env.mcpResource,
        loginPage: OAUTH_SIGN_IN_PAGE,
        consentPage: OAUTH_CONSENT_PAGE,
        scopes: ['openid', 'profile', 'email', 'offline_access'],
        // ChatGPT and Claude register themselves (RFC 7591) the first time a user adds the connector.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultScopes: ['openid', 'profile', 'email', 'offline_access'],
        // Clients that come back to http://localhost or a custom scheme (MCP Inspector, desktop apps)
        // register as native apps; the rest (ChatGPT, Claude.ai) as web apps with https callbacks.
        clientRegistrationDefaultApplicationType: 'infer',
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
