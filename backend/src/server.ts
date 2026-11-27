import { serve } from '@hono/node-server';

import { createApp, createStorage } from './app.ts';
import { createAuth } from './auth/auth.ts';
import { openDatabase } from './db/client.ts';
import { readEnv } from './env.ts';
import { removeExpiredUploads } from './files/uploads.ts';

const env = readEnv();
const { db } = await openDatabase(env.databaseUrl, { caCertFile: env.databaseCaCert });
const auth = createAuth(db, env);
const files = createStorage(env);
const app = createApp({ db, auth, env, files });

// Images AI apps uploaded but never attached to a note are removed after a while.
const sweep = () =>
  removeExpiredUploads(db, files.storage)
    .then((n) => n > 0 && console.log(`Removed ${n} unattached uploads.`))
    .catch((error: unknown) => console.error('Could not remove expired uploads:', error));
setInterval(sweep, 60 * 60 * 1000).unref();
void sweep();

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`StudyMe API on http://localhost:${info.port} (sign-in with: ${['email', ...Object.keys(env.social)].join(', ')})`);
});
