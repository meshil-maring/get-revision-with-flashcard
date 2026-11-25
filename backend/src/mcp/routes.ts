import { requireMcpAuth } from '@better-auth/mcp';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import type { Auth } from '../auth/auth.ts';
import type { Db } from '../db/client.ts';
import type { Env } from '../env.ts';
import { clientName } from './pages.ts';
import { createMcpServer } from './tools.ts';

/**
 * The MCP server AI apps connect to, at {BETTER_AUTH_URL}/mcp (Streamable HTTP, stateless:
 * each request gets a fresh server). A request without a valid access token gets a 401 whose
 * WWW-Authenticate header points the app to /.well-known/oauth-protected-resource/mcp, which
 * is how ChatGPT and Claude find out where to sign the user in.
 */
export function mcpRoutes(db: Db, auth: Auth, env: Env) {
  const handle = requireMcpAuth(
    auth,
    async (request, claims) => {
      if (typeof claims.sub !== 'string') return Response.json({ error: 'Token has no user.' }, { status: 401 });
      const appName = (await clientName(db, typeof claims.azp === 'string' ? claims.azp : null)) ?? 'AI';
      const server = createMcpServer(db, { userId: claims.sub, appName });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      return transport.handleRequest(request);
    },
    { resource: env.mcpResource },
  );

  return new Hono().all('/', bodyLimit({ maxSize: 4 * 1024 * 1024 }), (c) => handle(c.req.raw));
}
