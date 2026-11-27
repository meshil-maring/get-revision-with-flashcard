import { createHash, randomBytes } from 'node:crypto';

import { expect } from 'vitest';

import type { createTestServer } from './helpers.ts';

// An AI app's side of MCP, for tests: register, have the user sign in and allow, get a token,
// call tools. Shared by mcp.test.ts and images.test.ts.

export const BASE = 'http://localhost:4000';
export const MCP_URL = `${BASE}/mcp`;
export const REDIRECT_URI = 'https://chatgpt.example/connector/oauth/callback';

type TestServer = Awaited<ReturnType<typeof createTestServer>>;
let server: TestServer;
/** The test server the helpers talk to; call in beforeAll. */
export function useServer(s: TestServer) {
  server = s;
}

export const base64url = (buf: Buffer) => buf.toString('base64url');

export async function registerClient(name = 'ChatGPT') {
  const res = await server.request('/api/auth/oauth2/register', {
    method: 'POST',
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  expect(res.status, await res.clone().text()).toBeLessThan(300);
  return ((await res.json()) as { client_id: string }).client_id;
}

export function authorizeUrl(clientId: string, verifier: string, withResource = true) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    state: 'state-123',
    code_challenge: base64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  });
  if (withResource) params.set('resource', MCP_URL);
  return `/api/auth/oauth2/authorize?${params}`;
}

/** The signed query of a page Better Auth redirected to, as the page would send it back. */
export function oauthQueryOf(location: string): string {
  return new URL(location, BASE).search.slice(1);
}

export async function redirectUrl(res: Response): Promise<string> {
  if (res.status >= 300 && res.status < 400) return res.headers.get('location') ?? '';
  const body = (await res.json()) as { url?: string; redirect?: boolean };
  return body.url ?? '';
}

/** Runs the browser part of the flow and returns the access token. */
export async function connect(cookie: string, clientId: string, withResource = true) {
  const verifier = base64url(randomBytes(32));
  const authorize = await server.request(authorizeUrl(clientId, verifier, withResource), { headers: { Cookie: cookie } });
  const consentLocation = await redirectUrl(authorize);
  expect(consentLocation).toContain('/oauth/consent');

  const consent = await server.request('/api/auth/oauth2/consent', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ accept: true, oauth_query: oauthQueryOf(consentLocation) }),
  });
  expect(consent.status, await consent.clone().text()).toBe(200);
  const callback = new URL(await redirectUrl(consent));
  expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
  expect(callback.searchParams.get('state')).toBe('state-123');
  const code = callback.searchParams.get('code')!;

  const token = await server.app.request(`${BASE}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
      ...(withResource ? { resource: MCP_URL } : {}),
    }),
  });
  expect(token.status, await token.clone().text()).toBe(200);
  const body = (await token.json()) as { access_token: string; refresh_token?: string };
  expect(body.access_token.split('.')).toHaveLength(3); // a JWT the MCP route can check
  return body.access_token;
}

let rpcId = 0;
export async function mcp(token: string | null, method: string, params: Record<string, unknown> = {}) {
  return server.app.request(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
}

export async function callTool(token: string, name: string, args: Record<string, unknown> = {}) {
  const res = await mcp(token, 'tools/call', { name, arguments: args });
  expect(res.status, await res.clone().text()).toBe(200);
  const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  const text = body.result.content[0]?.text ?? '';
  return { isError: body.result.isError === true, text, data: body.result.isError ? null : JSON.parse(text) };
}
