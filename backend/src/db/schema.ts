import { bigint, index, jsonb, pgSequence, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth-schema.ts';

export * from './auth-schema.ts';

/** Every write to synced_rows takes the next number, so devices can ask "what changed after N?". */
export const syncRev = pgSequence('sync_rev');

/**
 * The user's data, one row per app record (a deck, card, folder, note, tag or note-tag link).
 * `data` is the record exactly as the app's SQLite table holds it (snake_case columns), so the
 * app can add columns without a server change. The newest `modified_at` wins a conflict.
 */
export const syncedRows = pgTable(
  'synced_rows',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    table: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    modifiedAt: timestamp('modified_at', { withTimezone: true, mode: 'string' }).notNull(),
    rev: bigint('rev', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.table, t.rowId] }), index('synced_rows_user_rev_idx').on(t.userId, t.rev)],
);
