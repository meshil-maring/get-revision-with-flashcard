import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { explainTlsError, pgConnection } from './connection.ts';
import * as schema from './schema.ts';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Both drivers expose the same query builder; the app code only uses that.
export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

export type Database = { db: Db; close: () => Promise<void> };

/**
 * Opens the database and brings its tables up to date.
 * - a postgres:// URL → a real Postgres server, over TLS unless it is on this machine
 *   (`caCertFile`: the certificate authority to trust, e.g. Supabase's)
 * - empty → embedded Postgres (PGlite) in ./data/pglite, for local development
 * - 'memory://' → in-memory PGlite, for tests
 */
export async function openDatabase(url: string, { caCertFile }: { caCertFile?: string } = {}): Promise<Database> {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const pool = new pg.Pool(pgConnection(url, caCertFile));
    const db = drizzlePg(pool, { schema });
    try {
      await migratePg(db, { migrationsFolder });
    } catch (error) {
      await pool.end().catch(() => undefined);
      throw explainTlsError(error);
    }
    return { db, close: () => pool.end() };
  }
  const client = new PGlite(url === 'memory://' ? undefined : url || './data/pglite');
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}
