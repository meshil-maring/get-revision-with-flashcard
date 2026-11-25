import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Card } from './types';

type CardRow = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    deckId: row.deck_id,
    front: row.front,
    back: row.back,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function listCards(db: SQLiteDatabase, deckId: string): Promise<Card[]> {
  const rows = await db.getAllAsync<CardRow>(
    'SELECT * FROM cards WHERE deck_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
    deckId,
  );
  return rows.map(toCard);
}

/** Cards from several decks, grouped in the order the deck ids are given. */
export async function listCardsForDecks(db: SQLiteDatabase, deckIds: string[]): Promise<Card[]> {
  if (deckIds.length === 0) return [];
  const placeholders = deckIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<CardRow>(
    `SELECT * FROM cards WHERE deck_id IN (${placeholders}) AND deleted_at IS NULL ORDER BY created_at ASC`,
    ...deckIds,
  );
  const deckOrder = new Map(deckIds.map((id, i) => [id, i]));
  return rows
    .map(toCard)
    .sort((a, b) => (deckOrder.get(a.deckId) ?? 0) - (deckOrder.get(b.deckId) ?? 0));
}

export async function createCard(
  db: SQLiteDatabase,
  deckId: string,
  input: { front: string; back: string },
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO cards (id, deck_id, front, back, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    deckId,
    input.front.trim(),
    input.back.trim(),
    now,
    now,
  );
  return id;
}

export async function updateCard(
  db: SQLiteDatabase,
  id: string,
  input: { front: string; back: string },
): Promise<void> {
  await db.runAsync(
    'UPDATE cards SET front = ?, back = ?, updated_at = ? WHERE id = ?',
    input.front.trim(),
    input.back.trim(),
    new Date().toISOString(),
    id,
  );
}

export async function deleteCard(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}
