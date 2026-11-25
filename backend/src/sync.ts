import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Db } from './db/client.ts';

/** The app tables that are kept in step between devices and the server. */
export const SYNCED_TABLES = ['decks', 'cards', 'folders', 'notes', 'tags', 'note_tags'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Most rows sent or returned in one request; the app keeps asking while `more` is true. */
export const MAX_ROWS = 1000;

const change = z.object({
  table: z.enum(SYNCED_TABLES),
  id: z.string().min(1).max(200),
  data: z.record(z.string(), z.unknown()),
  modifiedAt: z.iso.datetime({ offset: true }),
});
export type Change = z.infer<typeof change>;

export const syncRequest = z.object({
  cursor: z.number().int().min(0),
  changes: z.array(change).max(MAX_ROWS),
});
export type SyncRequest = z.infer<typeof syncRequest>;

export type SyncResponse = { cursor: number; changes: Change[]; more: boolean };

type Row = { table_name: SyncedTable; row_id: string; data: Record<string, unknown>; modified_at: string | Date; rev: string | number };

function toChange(row: Row): Change {
  const modifiedAt = row.modified_at instanceof Date ? row.modified_at.toISOString() : new Date(row.modified_at).toISOString();
  return { table: row.table_name, id: row.row_id, data: row.data, modifiedAt };
}

/**
 * Takes a user's changes and returns everything that changed since their cursor.
 * For each row the newest `modifiedAt` wins; a change that loses comes back with the
 * server's copy so the device can catch up.
 */
export async function sync(db: Db, userId: string, request: SyncRequest): Promise<SyncResponse> {
  return db.transaction(async (tx) => {
    // One sync per user at a time, so revision numbers become visible in order
    // and a device never skips past a row that another request is still writing.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const rejected: { table: string; id: string }[] = [];
    for (const c of request.changes) {
      const result = await tx.execute(sql`
        INSERT INTO synced_rows (user_id, table_name, row_id, data, modified_at, rev)
        VALUES (${userId}, ${c.table}, ${c.id}, ${JSON.stringify(c.data)}::jsonb, ${c.modifiedAt}, nextval('sync_rev'))
        ON CONFLICT (user_id, table_name, row_id) DO UPDATE
          SET data = excluded.data, modified_at = excluded.modified_at, rev = excluded.rev
          WHERE synced_rows.modified_at <= excluded.modified_at
        RETURNING row_id`);
      if (result.rows.length === 0) rejected.push({ table: c.table, id: c.id });
    }

    const result = await tx.execute(sql`
      SELECT table_name, row_id, data, modified_at, rev FROM synced_rows
       WHERE user_id = ${userId} AND rev > ${request.cursor}
       ORDER BY rev ASC
       LIMIT ${MAX_ROWS + 1}`);
    const rows = result.rows as Row[];
    const more = rows.length > MAX_ROWS;
    const page = rows.slice(0, MAX_ROWS);
    const cursor = page.length > 0 ? Number(page[page.length - 1].rev) : request.cursor;

    const changes = page.map(toChange);
    const returned = new Set(changes.map((c) => `${c.table}/${c.id}`));
    for (const r of rejected) {
      if (returned.has(`${r.table}/${r.id}`)) continue;
      const current = await tx.execute(sql`
        SELECT table_name, row_id, data, modified_at, rev FROM synced_rows
         WHERE user_id = ${userId} AND table_name = ${r.table} AND row_id = ${r.id}`);
      changes.push(...(current.rows as Row[]).map(toChange));
    }
    return { cursor, changes, more };
  });
}
