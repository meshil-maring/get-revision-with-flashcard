import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp, createStorage } from '../src/app.ts';
import { createAuth } from '../src/auth/auth.ts';
import { openDatabase } from '../src/db/client.ts';
import type { Email } from '../src/email.ts';
import { readEnv } from '../src/env.ts';
import type { ImageFetcher } from '../src/files/fetch-image.ts';
import type { FileStorage } from '../src/files/storage.ts';

export type TestServerOptions = {
  /** Stands in for downloading image links (upload_image's image_url / ChatGPT files). */
  fetchImage?: ImageFetcher;
  /** Wraps the file storage, e.g. to make it fail. */
  wrapStorage?: (storage: FileStorage) => FileStorage;
};

export async function createTestServer(extraEnv: NodeJS.ProcessEnv = {}, options: TestServerOptions = {}) {
  const filesDir = await mkdtemp(join(tmpdir(), 'studyme-files-'));
  const env = readEnv({
    NODE_ENV: 'test',
    FILES_DIR: filesDir,
    BETTER_AUTH_URL: 'http://localhost:4000',
    CORS_ORIGINS: 'http://localhost:8081',
    ...extraEnv,
  });
  const database = await openDatabase('memory://');
  /** Emails the server sent (password reset links), newest last. */
  const emails: Email[] = [];
  const auth = createAuth(database.db, env, { send: async (email) => void emails.push(email) });
  const created = createStorage(env);
  const files = { ...created, storage: options.wrapStorage ? options.wrapStorage(created.storage) : created.storage };
  const app = createApp({ db: database.db, auth, env, files, fetchImage: options.fetchImage });

  const request = (path: string, init: RequestInit = {}) =>
    app.request(`http://localhost:4000${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081', ...init.headers },
    });

  /** Signs up a new user and returns their session cookie. */
  async function signUp(email: string, password = 'correct-horse-battery') {
    const res = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: email.split('@')[0] }),
    });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    return { cookie, user: ((await res.json()) as { user: { id: string } }).user };
  }

  const close = async () => {
    await database.close();
    await rm(filesDir, { recursive: true, force: true });
  };
  return { app, auth, env, db: database.db, storage: files.storage, disk: created.disk!, request, signUp, emails, close };
}
