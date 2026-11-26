import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

import { pgConnection } from './src/db/connection.ts';

// Same database as the server: DATABASE_URL from .env, or the embedded PGlite in ./data/pglite.
if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  ...(url
    ? { dbCredentials: pgConnection(url, process.env.DATABASE_CA_CERT || undefined) }
    : { driver: 'pglite', dbCredentials: { url: './data/pglite' } }),
});
