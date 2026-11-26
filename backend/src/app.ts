import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { Auth } from './auth/auth.ts';
import type { Db } from './db/client.ts';
import { SOCIAL_PROVIDERS, type Env } from './env.ts';
import { fileRoutes, localFileRoutes } from './files/routes.ts';
import { diskStorage, LOCAL_FILES_PATH, r2Storage, type FileStorage } from './files/storage.ts';
import { oauthPages } from './mcp/pages.ts';
import { mcpRoutes } from './mcp/routes.ts';
import { syncRoutes } from './sync/routes.ts';

/**
 * OAuth endpoints an AI app calls directly (not pages the user's browser opens): registering,
 * getting and revoking tokens, and the keys and metadata. Authorize and consent are not here:
 * they use the user's session cookie, so they keep the app-only CORS rules.
 */
const OAUTH_CLIENT_ENDPOINTS = new Set([
  '/api/auth/oauth2/register',
  '/api/auth/oauth2/token',
  '/api/auth/oauth2/revoke',
  '/api/auth/oauth2/introspect',
  '/api/auth/oauth2/userinfo',
  '/api/auth/jwks',
]);

function isOAuthClientEndpoint(path: string): boolean {
  return OAUTH_CLIENT_ENDPOINTS.has(path) || path.startsWith('/api/auth/.well-known/');
}

/** R2 when it is set up, else a folder on this machine. */
export function createStorage(env: Env) {
  if (env.files.r2) return { storage: r2Storage(env.files.r2), disk: null };
  const disk = diskStorage(env.files.dir, env.baseURL, env.secret);
  return { storage: disk, disk };
}

export function createApp({
  db,
  auth,
  env,
  files = createStorage(env),
}: {
  db: Db;
  auth: Auth;
  env: Env;
  files?: { storage: FileStorage; disk: ReturnType<typeof diskStorage> | null };
}) {
  const app = new Hono();

  // The app (web build) calls the API with its session cookie, so only its own origins may.
  const appCors = cors({
    origin: env.corsOrigins,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie', 'expo-origin'],
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  });
  // AI apps (MCP clients) call these from their own servers, or from a browser for tools like the
  // MCP Inspector, so they are open to any origin. They never use cookies.
  const openCors = cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Last-Event-ID'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'],
  });
  app.use('/api/*', (c, next) => (isOAuthClientEndpoint(c.req.path) ? openCors(c, next) : appCors(c, next)));
  app.use('/mcp', openCors);
  app.use('/.well-known/*', openCors);

  app.get('/health', (c) => c.json({ ok: true }));

  /** What the sign-in screen should offer. */
  app.get('/api/config', (c) =>
    c.json({ providers: SOCIAL_PROVIDERS.filter((provider) => env.social[provider] !== undefined) }),
  );

  // Asking an AI app's sign-in for the MCP server's token works even when the app leaves out
  // `resource` (RFC 8707): without it, Better Auth would hand out a token the MCP route can't check.
  app.get('/api/auth/oauth2/authorize', async (c, next) => {
    const url = new URL(c.req.url);
    if (url.searchParams.has('resource')) return next();
    url.searchParams.set('resource', env.mcpResource);
    return auth.handler(new Request(url, c.req.raw));
  });

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  // OAuth discovery: /.well-known/oauth-authorization-server/api/auth and
  // /.well-known/oauth-protected-resource/mcp, served by the Better Auth plugins.
  app.get('/.well-known/*', (c) => auth.handler(c.req.raw));
  app.route('/api/sync', syncRoutes(db, auth, files.storage));
  if (files.disk) app.route(LOCAL_FILES_PATH, localFileRoutes(files.disk, env.files));
  app.route('/api/files', fileRoutes(db, auth, files.storage, env.files));
  app.route('/mcp', mcpRoutes(db, auth, env));
  app.route('/oauth', oauthPages(db, auth, env));

  return app;
}
