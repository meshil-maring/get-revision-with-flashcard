import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Deck, DeckWithCount } from './types';

type DeckRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function toDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function listDecks(db: SQLiteDatabase): Promise<DeckWithCount[]> {
  const rows = await db.getAllAsync<DeckRow & { card_count: number }>(
    `SELECT d.*,
            (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.deleted_at IS NULL) AS card_count
       FROM decks d
      WHERE d.deleted_at IS NULL
      ORDER BY d.updated_at DESC`,
  );
  return rows.map((row) => ({ ...toDeck(row), cardCount: row.card_count }));
}

export async function getDeck(db: SQLiteDatabase, id: string): Promise<Deck | null> {
  const row = await db.getFirstAsync<DeckRow>(
    'SELECT * FROM decks WHERE id = ? AND deleted_at IS NULL',
    id,
  );
  return row ? toDeck(row) : null;
}

export async function createDeck(
  db: SQLiteDatabase,
  input: { name: string; description?: string },
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO decks (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    id,
    input.name.trim(),
    (input.description ?? '').trim(),
    now,
    now,
  );
  return id;
}

export async function updateDeck(
  db: SQLiteDatabase,
  id: string,
  input: { name: string; description?: string },
): Promise<void> {
  await db.runAsync(
    'UPDATE decks SET name = ?, description = ?, updated_at = ? WHERE id = ?',
    input.name.trim(),
    (input.description ?? '').trim(),
    new Date().toISOString(),
    id,
  );
}

/** Soft-deletes the deck and all of its cards. */
export async function deleteDeck(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE cards SET deleted_at = ?, updated_at = ? WHERE deck_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
    await db.runAsync('UPDATE decks SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
  });
}
