import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { createAuth } from './auth/auth.ts';
import { openDatabase } from './db/client.ts';
import { readEnv } from './env.ts';

const env = readEnv();
const { db } = await openDatabase(env.databaseUrl, { caCertFile: env.databaseCaCert });
const auth = createAuth(db, env);
const app = createApp({ db, auth, env });

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`StudyMe API on http://localhost:${info.port} (sign-in with: ${['email', ...Object.keys(env.social)].join(', ')})`);
});
