import type { SQLiteDatabase } from 'expo-sqlite';

// Keeps this device's data in step with the user's account on the server.
//
// - Every local change is noted in sync_outbox by triggers (see db.ts, v10).
// - A sync sends those rows, then saves what the server says changed since the last sync.
// - When the same row changed in two places, the newest change wins.

/** Tables kept in step with the account, parents before children. */
export const SYNCED_TABLES = ['decks', 'folders', 'tags', 'cards', 'notes', 'note_tags'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export type SyncChange = {
  table: SyncedTable;
  id: string;
  data: Record<string, unknown>;
  modifiedAt: string;
};
export type SyncRequest = { cursor: number; changes: SyncChange[] };
export type SyncResponse = {
  cursor: number;
  changes: SyncChange[];
  more: boolean;
};

/** Sends a sync request to the server (see lib/sync-api.ts). */
export type SyncTransport = (request: SyncRequest) => Promise<SyncResponse>;

/** Rows per request; matches the server's limit. */
export const BATCH_SIZE = 1000;

type OutboxRow = { table_name: string; row_id: string; changed_at: string };

function isSyncedTable(name: string): name is SyncedTable {
  return (SYNCED_TABLES as readonly string[]).includes(name);
}

// --- sync_state ------------------------------------------------------------------

type StateKey = 'cursor' | 'user_id' | 'last_synced_at' | 'applying';

async function getState(db: SQLiteDatabase, key: StateKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', key);
  return row?.value ?? null;
}

async function setState(db: SQLiteDatabase, key: StateKey, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', key, value);
}

/** When this device last finished a sync, or null if it never has. */
export async function getLastSyncedAt(db: SQLiteDatabase): Promise<string | null> {
  return getState(db, 'last_synced_at');
}

/** How many local changes are waiting to be sent. */
export async function countPendingChanges(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox');
  return row?.n ?? 0;
}

// --- reading and writing rows ----------------------------------------------------

function whereRow(table: SyncedTable, id: string): { sql: string; args: string[] } {
  if (table === 'note_tags') {
    const [noteId, tagId] = id.split(':');
    return {
      sql: 'note_id = ? AND tag_id = ?',
      args: [noteId ?? '', tagId ?? ''],
    };
  }
  return { sql: 'id = ?', args: [id] };
}

const columnCache = new WeakMap<SQLiteDatabase, Map<string, Set<string>>>();

/** The table's column names, so rows from a newer app version don't break an older one. */
async function columnsOf(db: SQLiteDatabase, table: SyncedTable): Promise<Set<string>> {
  let byTable = columnCache.get(db);
  if (!byTable) {
    byTable = new Map();
    columnCache.set(db, byTable);
  }
  let columns = byTable.get(table);
  if (!columns) {
    const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    columns = new Set(rows.map((r) => r.name));
    byTable.set(table, columns);
  }
  return columns;
}

/** The next batch of local changes, with the outbox entries they came from. */
export async function collectChanges(db: SQLiteDatabase): Promise<{ changes: SyncChange[]; sent: OutboxRow[] }> {
  const outbox = await db.getAllAsync<OutboxRow>(
    'SELECT table_name, row_id, changed_at FROM sync_outbox ORDER BY changed_at ASC LIMIT ?',
    BATCH_SIZE,
  );
  const changes: SyncChange[] = [];
  const sent: OutboxRow[] = [];
  for (const entry of outbox) {
    const table = entry.table_name;
    const row = isSyncedTable(table)
      ? await db.getFirstAsync<Record<string, unknown>>(
          `SELECT * FROM ${table} WHERE ${whereRow(table, entry.row_id).sql}`,
          ...whereRow(table, entry.row_id).args,
        )
      : null;
    sent.push(entry);
    if (row && isSyncedTable(table)) {
      changes.push({
        table,
        id: entry.row_id,
        data: row,
        modifiedAt: entry.changed_at,
      });
    }
  }
  return { changes, sent };
}

async function upsertRow(db: SQLiteDatabase, change: SyncChange): Promise<void> {
  const columns = await columnsOf(db, change.table);
  const keys = Object.keys(change.data).filter((k) => columns.has(k));
  if (keys.length === 0) return;
  const primaryKey = change.table === 'note_tags' ? ['note_id', 'tag_id'] : ['id'];
  const updates = keys.filter((k) => !primaryKey.includes(k));
  const values = keys.map((k) => {
    const v = change.data[k];
    return v === undefined ? null : typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
  });
  await db.runAsync(
    `INSERT INTO ${change.table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT (${primaryKey.join(', ')}) DO ${
       updates.length > 0 ? `UPDATE SET ${updates.map((k) => `${k} = excluded.${k}`).join(', ')}` : 'NOTHING'
     }`,
    ...(values as (string | number | null)[]),
  );
}

/**
 * Saves rows from the server. A row is skipped when this device changed it more
 * recently; that local change will be sent next time instead.
 */
async function applyRemoteChanges(db: SQLiteDatabase, changes: SyncChange[]): Promise<void> {
  // Rows can arrive before the deck or folder they belong to; check links at commit instead.
  await db.execAsync('PRAGMA defer_foreign_keys = ON');
  const ordered = [...changes].sort((a, b) => SYNCED_TABLES.indexOf(a.table) - SYNCED_TABLES.indexOf(b.table));
  for (const change of ordered) {
    if (!isSyncedTable(change.table)) continue;
    const pending = await db.getFirstAsync<{ changed_at: string }>(
      'SELECT changed_at FROM sync_outbox WHERE table_name = ? AND row_id = ?',
      change.table,
      change.id,
    );
    if (pending && pending.changed_at > change.modifiedAt) continue;
    await upsertRow(db, change);
    if (pending) {
      await db.runAsync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?', change.table, change.id);
    }
  }
}

/** Puts every row on this device in the outbox, e.g. guest data on first sign-in. */
export async function queueAllRows(db: SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  for (const table of SYNCED_TABLES) {
    const rowId = table === 'note_tags' ? "note_id || ':' || tag_id" : 'id';
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_outbox (table_name, row_id, changed_at) SELECT '${table}', ${rowId}, ? FROM ${table}`,
      now,
    );
  }
}

// --- the sync itself ---------------------------------------------------------------

export type SyncResult = { sent: number; received: number };

/**
 * Sends local changes and saves remote ones until both sides are up to date.
 * `userId` is the signed-in account; the first sync for an account uploads
 * everything already on the device (guest data moves into the account).
 */
export async function runSync(db: SQLiteDatabase, userId: string, transport: SyncTransport): Promise<SyncResult> {
  if ((await getState(db, 'user_id')) !== userId) {
    await db.withTransactionAsync(async () => {
      await queueAllRows(db);
      await setState(db, 'user_id', userId);
      await setState(db, 'cursor', '0');
    });
  }

  let sent = 0;
  let received = 0;
  for (let round = 0; round < 100; round++) {
    const cursor = Number((await getState(db, 'cursor')) ?? '0');
    const outgoing = await collectChanges(db);
    const response = await transport({ cursor, changes: outgoing.changes });

    await db.withTransactionAsync(async () => {
      await setState(db, 'applying', '1');
      try {
        // Clear what was sent, unless it was changed again while the request was out.
        for (const entry of outgoing.sent) {
          await db.runAsync(
            'DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ? AND changed_at = ?',
            entry.table_name,
            entry.row_id,
            entry.changed_at,
          );
        }
        await applyRemoteChanges(db, response.changes);
        await setState(db, 'cursor', String(response.cursor));
      } finally {
        await db.runAsync("DELETE FROM sync_state WHERE key = 'applying'");
      }
    });

    sent += outgoing.changes.length;
    received += response.changes.length;
    if (!response.more && outgoing.sent.length < BATCH_SIZE) break;
  }

  await setState(db, 'last_synced_at', new Date().toISOString());
  return { sent, received };
}

/**
 * Removes the account's data from this device (on sign-out), so the next person
 * to use the app starts fresh. Synced data stays safe in the account.
 */
export async function clearAccountData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM note_tags;
      DELETE FROM note_attachments;
      DELETE FROM attachments;
      DELETE FROM notes;
      DELETE FROM folders;
      DELETE FROM tags;
      DELETE FROM cards;
      DELETE FROM decks;
      DELETE FROM study_log;
      DELETE FROM sync_outbox;
      DELETE FROM sync_state;
    `);
  });
}
