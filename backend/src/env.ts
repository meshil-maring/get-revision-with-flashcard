// Settings read from environment variables (see .env.example).

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Env = {
  port: number;
  baseURL: string;
  secret: string;
  databaseUrl: string;
  corsOrigins: string[];
  appScheme: string;
  google: { clientId: string; clientSecret: string } | null;
  isDev: boolean;
};

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const isDev = source.NODE_ENV !== 'production';
  const secret = source.BETTER_AUTH_SECRET ?? '';
  if (!isDev && (secret === '' || secret === 'change-me')) {
    throw new Error('Set BETTER_AUTH_SECRET to a long random string in production.');
  }
  const google =
    source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET
      ? { clientId: source.GOOGLE_CLIENT_ID, clientSecret: source.GOOGLE_CLIENT_SECRET }
      : null;
  return {
    port: Number(source.PORT ?? 4000),
    baseURL: source.BETTER_AUTH_URL ?? `http://localhost:${source.PORT ?? 4000}`,
    secret: secret || 'dev-only-secret-change-me-in-production-0123456789',
    databaseUrl: source.DATABASE_URL ?? '',
    corsOrigins: list(source.CORS_ORIGINS ?? 'http://localhost:8081'),
    appScheme: source.APP_SCHEME ?? 'flashcards',
    google,
    isDev,
  };
}
