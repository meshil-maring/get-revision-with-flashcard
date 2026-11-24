import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'flashcards.db';

// Each entry upgrades the schema by one version. Never edit an entry that has
// shipped; append a new one instead.
const MIGRATIONS: string[] = [
  // v1: decks and cards
  `
  CREATE TABLE IF NOT EXISTS decks (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE TABLE IF NOT EXISTS cards (
    id          TEXT PRIMARY KEY NOT NULL,
    deck_id     TEXT NOT NULL REFERENCES decks(id),
    front       TEXT NOT NULL,
    back        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON cards(deck_id);
  `,
];

/** Runs once when the app opens the database (SQLiteProvider onInit). */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
