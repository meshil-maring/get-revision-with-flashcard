import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../src/db/client.ts';

let database: Database;
beforeAll(async () => {
  database = await openDatabase('memory://');
});
afterAll(() => database.close());

describe('database', () => {
  // On Supabase, a table without row-level security can be read by anyone with the publishable
  // key. A new table needs: ALTER TABLE ... ENABLE ROW LEVEL SECURITY (in its migration).
  it('has row-level security on every table', async () => {
    const result = await database.db.execute(sql`
      SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
    expect(result.rows.map((r) => (r as { name: string }).name)).toEqual([]);
  });
});
