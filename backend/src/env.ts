// Settings read from environment variables (see .env.example).

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Sign-in providers the app can offer, in the order its buttons appear. */
export const SOCIAL_PROVIDERS = ['google', 'microsoft', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export type OAuthClient = { clientId: string; clientSecret: string };

export type Env = {
  port: number;
  baseURL: string;
  secret: string;
  databaseUrl: string;
  corsOrigins: string[];
  appScheme: string;
  /** Only the providers whose client id and secret are set. */
  social: Partial<Record<SocialProvider, OAuthClient>>;
  /** Microsoft tenant: 'common' = school, work and personal accounts. */
  microsoftTenantId: string;
  isDev: boolean;
};

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const isDev = source.NODE_ENV !== 'production';
  const secret = source.BETTER_AUTH_SECRET ?? '';
  if (!isDev && (secret === '' || secret === 'change-me')) {
    throw new Error('Set BETTER_AUTH_SECRET to a long random string in production.');
  }
  const social: Env['social'] = {};
  for (const provider of SOCIAL_PROVIDERS) {
    const prefix = provider.toUpperCase(); // GOOGLE_CLIENT_ID, MICROSOFT_CLIENT_ID, FACEBOOK_CLIENT_ID
    const clientId = source[`${prefix}_CLIENT_ID`];
    const clientSecret = source[`${prefix}_CLIENT_SECRET`];
    if (clientId && clientSecret) social[provider] = { clientId, clientSecret };
  }
  return {
    port: Number(source.PORT ?? 4000),
    baseURL: source.BETTER_AUTH_URL ?? `http://localhost:${source.PORT ?? 4000}`,
    secret: secret || 'dev-only-secret-change-me-in-production-0123456789',
    databaseUrl: source.DATABASE_URL ?? '',
    corsOrigins: list(source.CORS_ORIGINS ?? 'http://localhost:8081'),
    appScheme: source.APP_SCHEME ?? 'flashcards',
    social,
    microsoftTenantId: source.MICROSOFT_TENANT_ID || 'common',
    isDev,
  };
}
