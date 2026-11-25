// Only used by `npx auth generate` to write src/db/auth-schema.ts.
import { createAuth } from './src/auth.ts';
import { readEnv } from './src/env.ts';

export const auth = createAuth({} as never, readEnv({ ...process.env, GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x' }));
