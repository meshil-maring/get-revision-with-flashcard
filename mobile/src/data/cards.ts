import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { cardMatches } from '@/lib/revision';

import type { Card, FavoriteCard, Rating } from './types';

type CardRow = {
  id: string;
  deck_id: string;
  group_id: string | null;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  favorited_at: string | null;
  rating: string | null;
  rated_at: string | null;
};

const RATINGS: Rating[] = ['hard', 'ok', 'easy'];

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    deckId: row.deck_id,
    groupId: row.group_id ?? null,
    front: row.front,
    back: row.back,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    favoritedAt: row.favorited_at,
    rating: RATINGS.includes(row.rating as Rating) ? (row.rating as Rating) : null,
    ratedAt: row.rated_at,
  };
}

export async function listCards(db: SQLiteDatabase, deckId: string): Promise<Card[]> {
  const rows = await db.getAllAsync<CardRow>(
    'SELECT * FROM cards WHERE deck_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
    deckId,
  );
  return rows.map(toCard);
}

export async function getCard(db: SQLiteDatabase, id: string): Promise<Card | null> {
  const row = await db.getFirstAsync<CardRow>('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL', id);
  return row ? toCard(row) : null;
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

/** A card's text, and optionally its group (null = not in a group). */
export type CardInput = { front: string; back: string; groupId?: string | null };

export async function createCard(db: SQLiteDatabase, deckId: string, input: CardInput): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO cards (id, deck_id, group_id, front, back, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    deckId,
    input.groupId ?? null,
    input.front.trim(),
    input.back.trim(),
    now,
    now,
  );
  return id;
}

/** Changes a card's text, and its group too when `groupId` is given (null = no group). */
export async function updateCard(db: SQLiteDatabase, id: string, input: CardInput): Promise<void> {
  const now = new Date().toISOString();
  if (input.groupId === undefined) {
    await db.runAsync('UPDATE cards SET front = ?, back = ?, updated_at = ? WHERE id = ?', input.front.trim(), input.back.trim(), now, id);
  } else {
    await db.runAsync(
      'UPDATE cards SET front = ?, back = ?, group_id = ?, updated_at = ? WHERE id = ?',
      input.front.trim(),
      input.back.trim(),
      input.groupId,
      now,
      id,
    );
  }
}

/** Moves a card into a group, or out of its group (null). */
export async function setCardGroup(db: SQLiteDatabase, id: string, groupId: string | null): Promise<void> {
  await db.runAsync('UPDATE cards SET group_id = ?, updated_at = ? WHERE id = ?', groupId, new Date().toISOString(), id);
}

export async function deleteCard(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

/**
 * Marks a card as a favourite (or not). Like studying, this doesn't change
 * updated_at, so the card's place in lists isn't affected.
 */
export async function setFavorite(db: SQLiteDatabase, id: string, favorite: boolean): Promise<void> {
  await db.runAsync(
    'UPDATE cards SET favorited_at = ? WHERE id = ?',
    favorite ? new Date().toISOString() : null,
    id,
  );
}

/** Remembers how hard the card felt, for choosing cards in the next revision. */
export async function rateCard(db: SQLiteDatabase, id: string, rating: Rating): Promise<void> {
  await db.runAsync(
    'UPDATE cards SET rating = ?, rated_at = ? WHERE id = ?',
    rating,
    new Date().toISOString(),
    id,
  );
}

/** Favourite cards from every deck, with their deck's name, newest favourite first. */
export async function listFavoriteCards(db: SQLiteDatabase): Promise<FavoriteCard[]> {
  const rows = await db.getAllAsync<CardRow & { deck_name: string }>(
    `SELECT c.*, d.name AS deck_name
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
      WHERE c.favorited_at IS NOT NULL AND c.deleted_at IS NULL AND d.deleted_at IS NULL
      ORDER BY c.favorited_at DESC`,
  );
  return rows.map((row) => ({ ...toCard(row), deckName: row.deck_name }));
}

/** Escapes % and _ so they are matched as themselves in a LIKE pattern. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Cards from every deck whose question or answer contains the query (any case), with their deck's name. */
export async function searchCards(db: SQLiteDatabase, query: string, limit = 50): Promise<FavoriteCard[]> {
  const q = query.trim();
  if (!q) return [];
  const pattern = likePattern(q);
  const rows = await db.getAllAsync<CardRow & { deck_name: string }>(
    `SELECT c.*, d.name AS deck_name
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
      WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL
        AND (c.front LIKE ? ESCAPE '\\' OR c.back LIKE ? ESCAPE '\\')
      ORDER BY d.updated_at DESC, c.created_at ASC
      LIMIT ?`,
    pattern,
    pattern,
    limit * 2,
  );
  return (
    rows
      .map((row) => ({ ...toCard(row), deckName: row.deck_name }))
      // The answer is stored with formatting marks; only keep cards whose readable text matches.
      .filter((card) => cardMatches(card, q))
      .slice(0, limit)
  );
}

// --- Several cards at once (select mode in a deck) -----------------------------------

/** Puts the cards into a group, or out of their groups (null). */
export async function setCardsGroup(db: SQLiteDatabase, ids: string[], groupId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync('UPDATE cards SET group_id = ?, updated_at = ? WHERE id = ?', groupId, now, id);
    }
  });
}

/** Moves the cards to another deck. They leave their group, since groups belong to one deck. */
export async function moveCardsToDeck(db: SQLiteDatabase, ids: string[], deckId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync('UPDATE cards SET deck_id = ?, group_id = NULL, updated_at = ? WHERE id = ?', deckId, now, id);
    }
  });
}

export async function deleteCards(db: SQLiteDatabase, ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync('UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    }
  });
}

/** Stars (or un-stars) the cards; like setFavorite, this leaves updated_at alone. */
export async function setFavorites(db: SQLiteDatabase, ids: string[], favorite: boolean): Promise<void> {
  const at = favorite ? new Date().toISOString() : null;
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      // Keep the date a card was first starred.
      await db.runAsync(
        favorite
          ? 'UPDATE cards SET favorited_at = COALESCE(favorited_at, ?) WHERE id = ?'
          : 'UPDATE cards SET favorited_at = ? WHERE id = ?',
        at,
        id,
      );
    }
  });
}
