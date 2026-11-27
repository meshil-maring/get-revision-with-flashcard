# StudyMe server

Sign-in (email + password, Google, Microsoft, Facebook), backup/sync for the StudyMe app, and the MCP server that
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
  files/          attachment files: R2 and dev-folder storage (storage.ts), upload/download links (routes.ts),
                  images from AI apps: checks (images.ts), safe link downloads (fetch-image.ts), storing,
                  upload links and clean-up (uploads.ts), the /upload/<token> page (upload-page.ts)
  mcp/            the MCP server: /mcp route (routes.ts), tools (tools.ts), reading/writing the user's
                  rows (store.ts), images on notes (note-images.ts), and the sign-in / allow-access
                  pages AI apps open (pages.ts)
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

## Forgot password

**Sign in → Forgot password?** in the app emails a link (Better Auth's `request-password-reset`). The link checks
its token and opens `/account/reset-password`, a page on this server, where the new password is chosen. It works
from any email app, on a phone or a computer. Links work once, for an hour. Changing the password signs the
account out on every device.

Emails are sent with [Resend](https://resend.com): set `RESEND_API_KEY` (Resend → API Keys) and `EMAIL_FROM`.
Until your own domain is verified in Resend, `onboarding@resend.dev` can only send to your Resend account's email.
**Without a key, while developing, the email is printed in the server's terminal**: open the link from there.

## API

| Route | What it does |
| --- | --- |
| `GET /health` | `{ ok: true }` |
| `GET /api/config` | `{ providers: ['google', 'microsoft', 'facebook'] }`, the sign-in providers that are set up |
| `/api/auth/*` | Better Auth: `sign-up/email`, `sign-in/email`, `sign-in/social`, `get-session`, `sign-out`, … |
| `POST /api/sync` | Signed-in only. Body `{ cursor, changes[] }` → `{ cursor, changes[], more }` |
| `POST /api/files/uploads` | Signed-in only. `{ id, size, mimeType }` → `{ key, url }`: PUT the file to `url` |
| `POST /api/files/uploads/complete` | Signed-in only. `{ id }` → `{ key }`, once the server has checked the uploaded file |
| `POST /api/files/download-urls` | Signed-in only. `{ keys[] }` → `{ urls: { key: url } }`, for the user's own files |
| `POST /mcp` | MCP (Streamable HTTP, stateless). Needs an OAuth access token from the flow below |
| `GET /.well-known/oauth-protected-resource/mcp` | Where AI apps find the authorization server (RFC 9728) |
| `GET /.well-known/oauth-authorization-server/api/auth` | Authorization server metadata (RFC 8414) |
| `/api/auth/oauth2/*` | OAuth: `register` (dynamic client registration), `authorize`, `consent`, `token`, … |
| `GET /oauth/sign-in`, `/oauth/consent` | The pages a user sees while connecting an AI app |
| `GET /account/reset-password` | Choose a new password (from a forgot-password email) |
| `GET`, `POST /upload/<token>` | One-time page to upload an image an AI app asked for (see "Images in notes") |

## Connect an AI app (MCP)

The connector URL is `{BETTER_AUTH_URL}/mcp`. The app shows it under **More → Connect AI**.

How connecting works: the AI app calls `/mcp`, gets a 401 pointing to the metadata above, registers itself
(dynamic client registration), and opens `/oauth/sign-in` in the browser. The user signs in, taps **Allow** on
`/oauth/consent`, and the AI app gets a short-lived JWT access token (plus a refresh token) that only works for
`/mcp` and only for that user. The token's client name ("ChatGPT", "Claude") is saved on the notes it writes.

Tools: `list_decks`, `get_deck`, `create_deck`, `add_cards`, `list_folders`, `list_notes`, `get_note`,
`create_note`, `add_good_to_know`, and for images `upload_image`, `attach_image_to_note`,
`create_note_with_images`, `list_note_attachments`, `remove_note_attachment` (below). Apart from
`remove_note_attachment` they only read and add. What they write goes into `synced_rows` like a device's
changes, so the app picks it up on its next sync. `GET /health` lists them, to check what a deploy serves.

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
3. Sign in on the page that opens and tap **Allow**. In a chat, turn on StudyMe and ask for a deck or a note.
4. Open the app signed in to the same account; the new items arrive on the next sync (or tap Sync now).

The quick tunnel's address changes each time it starts; then update `BETTER_AUTH_URL` and the connector.
To try the tools without an AI app or a tunnel: `npx @modelcontextprotocol/inspector`, transport
"Streamable HTTP", URL `http://localhost:4000/mcp`, then Connect (it runs the same sign-in and Allow pages).

### Images in notes

An AI app adds a picture to a note in two steps: **upload** it (`upload_image` → an `attachment_id`), then
**attach** it (`attach_image_to_note` for an existing note, `create_note_with_images` for a new one). Only PNG,
JPEG and WebP, up to `MAX_IMAGE_MB` (default 10 MB) and 12,000 px a side.

| Tool | Input | Returns |
| --- | --- | --- |
| `upload_image` | one of `image` (ChatGPT file), `image_url` (https), `image_base64`; or none → upload link. Optional `filename`, `mime_type` | `attachment_id`, `status`, `filename`, `mime_type`, `file_size`, `width`, `height`, `expires_if_not_attached_at` (or `upload_url` + `link_expires_at`) |
| `attach_image_to_note` | `note_id`, `attachment_id`, optional `caption`, `alt_text`, `cornell_row` | the attachment, `status` (`attached` / `already attached`), `display_order`, `shown` |
| `create_note_with_images` | `create_note`'s fields + `images[]` of `{ attachment_id, caption?, alt_text?, cornell_row? }` (1 to 20, in order) | the note + `attachments[]` |
| `list_note_attachments` | `note_id` | `attachments[]`: `attachment_id`, `filename`, `mime_type`, `file_size`, `caption`, `alt_text`, `display_url` (15-minute link), `created_at`, `display_order`, `uploaded`, `shown` |
| `remove_note_attachment` | `note_id`, `attachment_id` | `removed`, `fileDeleted` (false while another note still uses the image) |

**Where it shows.** A line `:::image <attachment_id>` in a note's text shows that image right there (see
`mobile/src/lib/rich-text.ts`); images without one show after the note. `cornell_row` (1 = first row) adds the
line to that Cornell row for the AI app, and attaching again with another row moves it. In a plain note the AI
app writes the line in `body` itself. `create_note_with_images` refuses a line for an image it isn't attaching;
`remove_note_attachment` takes the line out too; `shown` says where each image is (`cornell row 2`,
`in the body`, `in the summary`, `after the note`). The app shows them the same way in focus mode.

**How the image gets to the server.** MCP has no standard way for a chat attachment to reach a tool, so
`upload_image` takes whichever the AI app can give:

- **ChatGPT**: the tool declares `_meta["openai/fileParams"] = ["image"]`, so ChatGPT fills `image` with
  `{ download_url, file_id, mime_type?, file_name? }` for a picture the user attached, and the server downloads
  it. (From OpenAI's Apps SDK reference; not yet tried against live ChatGPT. The other ways work either way.)
- **A public picture**: `image_url`, any https link. The server downloads it, refusing private or local
  addresses (also after redirects and DNS lookups), anything over the size limit, and slow servers.
- **Bytes the AI app really has** (e.g. made with code): `image_base64`. The `/mcp` request can be up to
  about 2.7 x `MAX_IMAGE_MB` + 4 MB for this.
- **Anything else (Claude.ai today)**: call `upload_image` with none of them. It returns an `upload_url`
  (`/upload/<token>`) for the user to open; they pick the picture there. The link works once, for 30 minutes.
  `attach_image_to_note` then works with the same `attachment_id`; before the upload it says so.

Every image is checked from its bytes (signature and header, not its name or stated type), stored under the
user's own key `u/<user id>/<attachment id>`, and recorded in `files` with an `expires_at` 24 hours ahead.
Attaching clears `expires_at`; the server removes unattached uploads every hour. Each user's AI apps may upload
`IMAGE_UPLOADS_PER_HOUR` images (default 60), within the user's `FILE_QUOTA_MB`.

An attached image is a `note_attachments` row like the app's own, with `remote_key`, `caption`, `alt_text`
and `position`, saved in the same transaction as the note for `create_note_with_images` (no note without its
images). The app downloads the file on its next sync and shows it under the note, with its caption, full screen
with zoom. One upload can be attached to several notes; its file is removed only when none use it.

**Example (ChatGPT).** Attach a photo of a diagram and write: *"Upload this traffic engineering diagram to
StudyMe, explain its parts, and add it to my Traffic Engineering > Intersections note."* ChatGPT calls
`list_notes` to find the note, `upload_image` with the photo, then `attach_image_to_note` with a caption and alt
text, and replies with what it saved. In Claude, the same request makes Claude show the upload link first.

**Trying it**: with the MCP Inspector (above), call `upload_image` with `image_url` set to any public PNG, or with
nothing and open the `upload_url`; then `attach_image_to_note` with a note id from `list_notes`, and sync the app.

### How sync works

- The app keeps its own SQLite database. Triggers note every changed row in `sync_outbox` (`mobile/src/data/db.ts`).
- A sync sends those rows and gets back every row changed since the device's `cursor`.
- The server stores each record as JSON in `synced_rows` (one row per user + table + id). Each write takes the next
  number from the `sync_rev` sequence, which is what the cursor counts.
- When the same record changed in two places, the newer `modifiedAt` wins. A device whose change lost gets the
  server's copy back in the same response.
- Syncs for one user run one at a time (Postgres advisory lock), so a device never skips a row.
- Synced: decks, cards, folders, notes, tags, note tags, card and note attachments. Not yet: the study log.
- An attachment's row syncs like the others, but its file goes to file storage (below). `remote_key` in the row
  says where; the device's own `uri` never leaves the device.

## File storage

Images, PDFs and audio attached to cards and notes are kept in **Cloudflare R2**. The server never handles file
bytes: it checks the user and their quota, then hands the app a link valid for 15 minutes to upload to (or
download from) R2 directly.

1. The app asks `POST /api/files/uploads` for a link. The key is `u/<user id>/<attachment id>`, so retrying an upload
   replaces the earlier try instead of storing it twice.
2. The app PUTs the file to the link, then calls `POST /api/files/uploads/complete`. The server looks at the stored
   file's real size (a link can't limit it) and deletes it if it is over `MAX_FILE_MB` or the user's `FILE_QUOTA_MB`.
3. The app sets the attachment's `remote_key` and syncs. Other devices ask `POST /api/files/download-urls` and keep
   a copy, so attachments still open offline. An attachment shows up once its file has arrived.
4. When a deleted attachment syncs (deleting its card, note, deck or folder deletes it too), the server removes the
   file, unless another live attachment still uses it (an AI app attached one image to two notes). A deletion
   that loses to a newer edit removes nothing.

The `files` table records who owns each stored file and its size; for images from AI apps also their `name` and,
until attached, `expires_at`. Images from AI apps are the one case where the server writes to storage itself
(`FileStorage.put`), since the bytes reach it through MCP.

**Without R2** (development, tests) files go to `FILES_DIR` (default `./data/files`) and the server serves the
signed links itself under `/api/local-files/`. In production the server refuses to start without R2, unless
`FILES_DIR` is set on purpose.

### Set up R2

1. Cloudflare dashboard → **R2** → *Create bucket* (e.g. `studyme-files`). Keep it private: no public access.
2. R2 → **Manage API tokens** → *Create API token*, permission **Object Read & Write**, only this bucket.
3. In `.env`: `R2_ACCOUNT_ID` (shown on the R2 page), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
4. For the **web** app, the browser uploads to R2 itself, so the bucket needs a CORS policy
   (bucket → Settings → CORS policy). The Android app doesn't need this.

```json
[
  {
    "AllowedOrigins": ["http://localhost:8081", "https://your-web-app.example"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Removing a user deletes their `files` rows but not their objects in R2 yet.

## Database changes

Edit `src/db/schema.ts`, then `npm run db:generate` to write a migration into `drizzle/`. Migrations run when the
server starts. A new table also needs row-level security (see `0003`; `test/database.test.ts` checks).

- `0004_image_uploads`: `files.name`, `files.expires_at` and an index on it, for images from AI apps. Only adds
  nullable columns, so it is safe while the old version still runs; the file says how to undo it.
Auth tables (including the OAuth ones) live in `src/db/auth-schema.ts`, generated by `npx auth@latest generate --config auth.config.ts --output src/db/auth-schema.ts` when Better Auth plugins change.

## Tests

`npm test` runs the API against an in-memory Postgres, including the whole AI-app path (`test/mcp.test.ts`):
register → sign in → allow → token → tool calls → sync. `test/mcp-images.test.ts` follows an image the same way,
on to the app downloading it (only downloading image links is faked); `test/images.test.ts` covers the checks.
`npm run typecheck` checks types.

`R2_INTEGRATION=1 npx vitest run test/r2-live.test.ts` stores, reads back and deletes one tiny image in the real
R2 bucket from `.env` (skipped otherwise).
