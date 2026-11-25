import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { createAuth } from './auth.ts';
import { openDatabase } from './db/client.ts';
import { readEnv } from './env.ts';

const env = readEnv();
const { db } = await openDatabase(env.databaseUrl);
const auth = createAuth(db, env);
const app = createApp({ db, auth, env });

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`NoteMe API on http://localhost:${info.port} (Google sign-in ${env.google ? 'on' : 'off'})`);
});
