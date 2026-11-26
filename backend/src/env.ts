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

/** A Cloudflare R2 bucket (R2 → Manage API tokens → Object Read & Write). */
export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export type FilesConfig = {
  /** Set → files go to R2. Unset → files go to `dir` on this machine (development). */
  r2?: R2Config;
  dir: string;
  /** Largest single file, in bytes. */
  maxFileBytes: number;
  /** Most bytes one user may store in total. */
  quotaBytes: number;
};

export type Env = {
  port: number;
  baseURL: string;
  /** The MCP server's URL, which AI apps are given: {baseURL}/mcp. */
  mcpResource: string;
  secret: string;
  databaseUrl: string;
  corsOrigins: string[];
  appScheme: string;
  /** Only the providers whose client id and secret are set. */
  social: Partial<Record<SocialProvider, OAuthClient>>;
  /** Microsoft tenant: 'common' = school, work and personal accounts. */
  microsoftTenantId: string;
  files: FilesConfig;
  isDev: boolean;
};

const MB = 1024 * 1024;

function readFiles(source: NodeJS.ProcessEnv, isDev: boolean): FilesConfig {
  const r2Values = {
    accountId: source.R2_ACCOUNT_ID ?? '',
    accessKeyId: source.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: source.R2_SECRET_ACCESS_KEY ?? '',
    bucket: source.R2_BUCKET ?? '',
  };
  const setCount = Object.values(r2Values).filter(Boolean).length;
  if (setCount > 0 && setCount < 4) {
    throw new Error('Set all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET, or none of them.');
  }
  // A server's own disk is often wiped on redeploy, so production must choose it on purpose.
  if (!isDev && setCount === 0 && !source.FILES_DIR) {
    throw new Error('Set the R2_* variables in production (or FILES_DIR to keep files on this machine).');
  }
  return {
    r2: setCount === 4 ? r2Values : undefined,
    dir: source.FILES_DIR || './data/files',
    maxFileBytes: Number(source.MAX_FILE_MB || 25) * MB,
    quotaBytes: Number(source.FILE_QUOTA_MB || 1024) * MB,
  };
}

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
  const baseURL = (source.BETTER_AUTH_URL || `http://localhost:${source.PORT ?? 4000}`).replace(/\/+$/, '');
  return {
    port: Number(source.PORT ?? 4000),
    baseURL,
    mcpResource: `${baseURL}/mcp`,
    secret: secret || 'dev-only-secret-change-me-in-production-0123456789',
    databaseUrl: source.DATABASE_URL ?? '',
    corsOrigins: list(source.CORS_ORIGINS ?? 'http://localhost:8081'),
    appScheme: source.APP_SCHEME ?? 'studyme',
    social,
    microsoftTenantId: source.MICROSOFT_TENANT_ID || 'common',
    files: readFiles(source, isDev),
    isDev,
  };
}
