# NoteMe server

Sign-in (email + password, Google, Microsoft, Facebook), backup/sync for the NoteMe app, and the MCP server that
lets AI apps (ChatGPT, Claude) read and add decks, cards and notes in a user's account.

Stack: Node 22 + TypeScript (run with tsx), Hono, Better Auth (+ its OAuth provider / MCP plugins), Drizzle,
Postgres, MCP TypeScript SDK.

## Run it

```bash
cd backend
npm install
cp .env.example .env   # then set BETTER_AUTH_SECRET
npm run dev            # http://localhost:4000
```

With `DATABASE_URL` empty the server uses an embedded Postgres (PGlite) in `data/pglite/`, so no database
install is needed for development. Set `DATABASE_URL=postgres://…` for a real Postgres (e.g. Neon in production).
Tables are created/upgraded on start-up.

Point the app at the server with `EXPO_PUBLIC_API_URL` in `mobile/.env` (see `mobile/.env.example`).

## Folders

```
src/
  server.ts       starts the server
  app.ts          the Hono app: CORS, health, mounts the routes below
  env.ts          settings from environment variables
  auth/           Better Auth setup, requireSession middleware
  sync/           POST /api/sync: request checks (routes.ts) and the sync itself (sync.ts)
  mcp/            the MCP server: /mcp route (routes.ts), tools (tools.ts), reading/writing the user's
                  rows (store.ts), and the sign-in / allow-access pages AI apps open (pages.ts)
  db/             Drizzle: connection + migrations (client.ts), tables (schema.ts, auth-schema.ts)
drizzle/          generated SQL migrations
test/             API tests (Vitest, in-memory Postgres)
```

## Sign-in providers

Email + password always works. Google, Microsoft and Facebook each turn on when both their client id and secret
are in `.env`, and the app then shows a "Continue with …" button for them. Restart the server after changing `.env`.

Every provider asks for a redirect (callback) URI. Use `{BETTER_AUTH_URL}/api/auth/callback/<provider>`, e.g.
`http://localhost:4000/api/auth/callback/google`. Add your production URL too when you deploy.

| Provider | Where | Notes |
| --- | --- | --- |
| Google | [Google Cloud console](https://console.cloud.google.com/apis/credentials) → Create credentials → OAuth client ID → *Web application* | Set up the OAuth consent screen first. While it is in "Testing", only the test users you add can sign in. |
| Microsoft | [Microsoft Entra admin center](https://entra.microsoft.com) → App registrations → New registration | Choose "Accounts in any organizational directory and personal Microsoft accounts", platform *Web*. Make a secret under Certificates & secrets. `MICROSOFT_TENANT_ID=common` lets school, work and personal accounts in; a school's tenant id allows only that school. |
| Facebook | [Meta for Developers](https://developers.facebook.com/apps) → Create app → add *Facebook Login* | Put the callback in "Valid OAuth Redirect URIs". App ID = client id, App secret = client secret. |

The browser sign-in page sends the phone back to the app through the `flashcards://` scheme (Expo Go uses `exp://`
while developing), which the server already trusts. On a real phone, `BETTER_AUTH_URL` must be an address the
phone can reach (your computer's LAN address, or the deployed server), and the provider must list that callback.

If someone signs in with Google or Microsoft using the email of an account they already have, the sign-in is added
to that account. Facebook doesn't confirm emails, so Facebook sign-in is refused (`account_not_linked`) for an
email that already has an account; that person signs in the way they first did.

## API

| Route | What it does |
| --- | --- |
| `GET /health` | `{ ok: true }` |
| `GET /api/config` | `{ providers: ['google', 'microsoft', 'facebook'] }`, the sign-in providers that are set up |
| `/api/auth/*` | Better Auth: `sign-up/email`, `sign-in/email`, `sign-in/social`, `get-session`, `sign-out`, … |
| `POST /api/sync` | Signed-in only. Body `{ cursor, changes[] }` → `{ cursor, changes[], more }` |
| `POST /mcp` | MCP (Streamable HTTP, stateless). Needs an OAuth access token from the flow below |
| `GET /.well-known/oauth-protected-resource/mcp` | Where AI apps find the authorization server (RFC 9728) |
| `GET /.well-known/oauth-authorization-server/api/auth` | Authorization server metadata (RFC 8414) |
| `/api/auth/oauth2/*` | OAuth: `register` (dynamic client registration), `authorize`, `consent`, `token`, … |
| `GET /oauth/sign-in`, `/oauth/consent` | The pages a user sees while connecting an AI app |

## Connect an AI app (MCP)

The connector URL is `{BETTER_AUTH_URL}/mcp`. The app shows it under **More → Connect AI**.

How connecting works: the AI app calls `/mcp`, gets a 401 pointing to the metadata above, registers itself
(dynamic client registration), and opens `/oauth/sign-in` in the browser. The user signs in, taps **Allow** on
`/oauth/consent`, and the AI app gets a short-lived JWT access token (plus a refresh token) that only works for
`/mcp` and only for that user. The token's client name ("ChatGPT", "Claude") is saved on the notes it writes.

Tools: `list_decks`, `get_deck`, `create_deck`, `add_cards`, `list_folders`, `list_notes`, `get_note`,
`create_note`. They only read and add; nothing is changed or deleted. What they write goes into `synced_rows`
like a device's changes, so the app picks it up on its next sync.

### Try it with ChatGPT or Claude on your computer

ChatGPT and Claude call the server from the internet, so `localhost` won't do. Open a tunnel and use its https
address as the server's public URL:

```bash
cloudflared tunnel --url http://localhost:4000    # or: ngrok http 4000
# prints e.g. https://quiet-river-1234.trycloudflare.com
```

1. In `backend/.env` set `BETTER_AUTH_URL=https://quiet-river-1234.trycloudflare.com` and restart `npm run dev`.
   (Sign-in providers need `{that URL}/api/auth/callback/<provider>` added too, if you want them on the sign-in page.)
2. **ChatGPT** (a paid plan): Settings → Apps & Connectors → Advanced settings → turn on Developer mode, then
   Create. Server URL `https://quiet-river-1234.trycloudflare.com/mcp`, authentication OAuth.
   **Claude**: Settings → Connectors → Add custom connector, same URL.
3. Sign in on the page that opens and tap **Allow**. In a chat, turn on NoteMe and ask for a deck or a note.
4. Open the app signed in to the same account; the new items arrive on the next sync (or tap Sync now).

The quick tunnel's address changes each time it starts; then update `BETTER_AUTH_URL` and the connector.
To try the tools without an AI app or a tunnel: `npx @modelcontextprotocol/inspector`, transport
"Streamable HTTP", URL `http://localhost:4000/mcp`, then Connect (it runs the same sign-in and Allow pages).

### How sync works

- The app keeps its own SQLite database. Triggers note every changed row in `sync_outbox` (`mobile/src/data/db.ts`).
- A sync sends those rows and gets back every row changed since the device's `cursor`.
- The server stores each record as JSON in `synced_rows` (one row per user + table + id). Each write takes the next
  number from the `sync_rev` sequence, which is what the cursor counts.
- When the same record changed in two places, the newer `modifiedAt` wins. A device whose change lost gets the
  server's copy back in the same response.
- Syncs for one user run one at a time (Postgres advisory lock), so a device never skips a row.
- Synced: decks, cards, folders, notes, tags, note tags. Not yet: attachments (files), the study log.

## Database changes

Edit `src/db/schema.ts`, then `npm run db:generate` to write a migration into `drizzle/`.
Auth tables (including the OAuth ones) live in `src/db/auth-schema.ts`, generated by `npx auth@latest generate --config auth.config.ts --output src/db/auth-schema.ts` when Better Auth plugins change.

## Tests

`npm test` runs the API against an in-memory Postgres, including the whole AI-app path (`test/mcp.test.ts`):
register → sign in → allow → token → tool calls → sync. `npm run typecheck` checks types.
