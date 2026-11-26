import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { CardGroup } from './types';

// Groups of cards inside a deck, e.g. "Chapter 1" or "Formulas". A card is in at most
// one group (cards.group_id); cards that aren't in a group are shown under "Other cards".

type GroupRow = {
  id: string;
  deck_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function toGroup(row: GroupRow): CardGroup {
  return {
    id: row.id,
    deckId: row.deck_id,
    name: row.name,
    position: row.position ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** The deck's groups, in the order the user put them. */
export async function listGroups(db: SQLiteDatabase, deckId: string): Promise<CardGroup[]> {
  const rows = await db.getAllAsync<GroupRow>(
    'SELECT * FROM card_groups WHERE deck_id = ? AND deleted_at IS NULL ORDER BY position ASC, created_at ASC',
    deckId,
  );
  return rows.map(toGroup);
}

export async function getGroup(db: SQLiteDatabase, id: string): Promise<CardGroup | null> {
  const row = await db.getFirstAsync<GroupRow>('SELECT * FROM card_groups WHERE id = ? AND deleted_at IS NULL', id);
  return row ? toGroup(row) : null;
}

/** Adds a group at the end of the deck. */
export async function createGroup(db: SQLiteDatabase, deckId: string, name: string): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const last = await db.getFirstAsync<{ max: number | null }>(
    'SELECT MAX(position) AS max FROM card_groups WHERE deck_id = ? AND deleted_at IS NULL',
    deckId,
  );
  await db.runAsync(
    'INSERT INTO card_groups (id, deck_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    deckId,
    name.trim(),
    (last?.max ?? -1) + 1,
    now,
    now,
  );
  return id;
}

export async function renameGroup(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  await db.runAsync('UPDATE card_groups SET name = ?, updated_at = ? WHERE id = ?', name.trim(), new Date().toISOString(), id);
}

/** Moves a group one place up (-1) or down (1) in its deck. */
export async function moveGroup(db: SQLiteDatabase, id: string, direction: -1 | 1): Promise<void> {
  const group = await getGroup(db, id);
  if (!group) return;
  const groups = await listGroups(db, group.deckId);
  const from = groups.findIndex((g) => g.id === id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= groups.length) return;
  [groups[from], groups[to]] = [groups[to], groups[from]];
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    // Number them 0, 1, 2… again, saving only the groups whose place changed.
    for (const [position, g] of groups.entries()) {
      if (g.position === position) continue;
      await db.runAsync('UPDATE card_groups SET position = ?, updated_at = ? WHERE id = ?', position, now, g.id);
    }
  });
}

/** Deletes a group. Its cards stay in the deck, no longer in a group. */
export async function deleteGroup(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE cards SET group_id = NULL, updated_at = ? WHERE group_id = ? AND deleted_at IS NULL',
      now,
      id,
    );
    await db.runAsync('UPDATE card_groups SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
  });
}
