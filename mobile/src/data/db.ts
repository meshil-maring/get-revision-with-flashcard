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
  // v2: remember when a deck was last studied (for "Continue Studying" on Home)
  `
  ALTER TABLE decks ADD COLUMN last_studied_at TEXT;
  `,
  // v3: cards reviewed per day (for the streak and the consistency grid on Home)
  `
  CREATE TABLE IF NOT EXISTS study_log (
    day   TEXT PRIMARY KEY NOT NULL, -- local date, YYYY-MM-DD
    cards INTEGER NOT NULL DEFAULT 0
  );
  `,
  // v4: favourite cards, how hard a card felt last time, and files attached to cards
  `
  ALTER TABLE cards ADD COLUMN favorited_at TEXT;
  ALTER TABLE cards ADD COLUMN rating TEXT; -- 'hard' | 'ok' | 'easy', null = not rated yet
  ALTER TABLE cards ADD COLUMN rated_at TEXT;
  CREATE TABLE IF NOT EXISTS attachments (
    id          TEXT PRIMARY KEY NOT NULL,
    card_id     TEXT NOT NULL REFERENCES cards(id),
    side        TEXT NOT NULL, -- 'front' | 'back'
    kind        TEXT NOT NULL, -- 'image' | 'pdf' | 'audio'
    uri         TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    mime_type   TEXT,
    created_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_card_id ON attachments(card_id);
  `,
  // v5: small app settings, e.g. whether the welcome tour has been seen
  `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // v6: total time spent studying each deck, in seconds
  `
  ALTER TABLE decks ADD COLUMN study_seconds INTEGER NOT NULL DEFAULT 0;
  `,
  // v7: notes in folders that can be nested to any depth (e.g. Class → Subject → Chapter → Topic)
  `
  CREATE TABLE IF NOT EXISTS folders (
    id          TEXT PRIMARY KEY NOT NULL,
    parent_id   TEXT REFERENCES folders(id), -- null = top level
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
  CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY NOT NULL,
    folder_id    TEXT REFERENCES folders(id), -- null = top level
    title        TEXT NOT NULL,
    style        TEXT NOT NULL DEFAULT 'plain', -- 'plain' | 'cornell'
    body         TEXT NOT NULL DEFAULT '',      -- plain notes (light formatting)
    cornell_rows TEXT NOT NULL DEFAULT '[]',    -- Cornell notes: JSON [{ "cue": "", "notes": "" }]
    summary      TEXT NOT NULL DEFAULT '',      -- Cornell notes: summary at the bottom
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id);
  CREATE TABLE IF NOT EXISTS note_attachments (
    id          TEXT PRIMARY KEY NOT NULL,
    note_id     TEXT NOT NULL REFERENCES notes(id),
    kind        TEXT NOT NULL, -- 'image' | 'pdf' | 'audio'
    uri         TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    mime_type   TEXT,
    created_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_note_attachments_note_id ON note_attachments(note_id);
  `,
  // v8: who made a note: null = the user, else the AI app's name (e.g. 'Claude'), for notes added through MCP
  `
  ALTER TABLE notes ADD COLUMN created_by TEXT;
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
