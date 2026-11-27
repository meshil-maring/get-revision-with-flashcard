import type { SQLiteDatabase } from 'expo-sqlite';

import { createCard } from '@/data/cards';
import { migrateDbIfNeeded } from '@/data/db';
import {
  addStudyTime,
  createDeck,
  deleteDeck,
  getDeck,
  listDecks,
  markDeckStudied,
  pickContinueDeck,
  updateDeck,
} from '@/data/decks';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;

beforeEach(async () => {
  db = await createTestDb();
});

describe('decks', () => {
  it('creates a deck with a UUID and trimmed fields', async () => {
    const id = await createDeck(db, { name: '  Biology  ', description: '  Cells  ' });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const deck = await getDeck(db, id);
    expect(deck).toMatchObject({ id, name: 'Biology', description: 'Cells', deletedAt: null });
    expect(deck?.createdAt).toBe(deck?.updatedAt);
  });

  it('defaults the description to an empty string', async () => {
    const id = await createDeck(db, { name: 'History' });
    expect((await getDeck(db, id))?.description).toBe('');
  });

  it('lists decks with their card counts, newest change first', async () => {
    const older = await createDeck(db, { name: 'Older' });
    await new Promise((r) => setTimeout(r, 5)); // make updated_at differ
    const newer = await createDeck(db, { name: 'Newer' });
    await createCard(db, older, { front: 'Q1', back: 'A1' });
    await createCard(db, older, { front: 'Q2', back: 'A2' });

    const decks = await listDecks(db);

    expect(decks.map((d) => d.id)).toEqual([newer, older]);
    expect(decks.map((d) => d.cardCount)).toEqual([0, 2]);
  });

  it('updates the name, description and updatedAt', async () => {
    const id = await createDeck(db, { name: 'Old name' });
    const before = await getDeck(db, id);
    await new Promise((r) => setTimeout(r, 5));

    await updateDeck(db, id, { name: 'New name', description: 'New description' });

    const after = await getDeck(db, id);
    expect(after).toMatchObject({ name: 'New name', description: 'New description' });
    expect(after!.updatedAt > before!.updatedAt).toBe(true);
    expect(after!.createdAt).toBe(before!.createdAt);
  });

  it('soft-deletes a deck and its cards', async () => {
    const id = await createDeck(db, { name: 'To delete' });
    const cardId = await createCard(db, id, { front: 'Q', back: 'A' });

    await deleteDeck(db, id);

    expect(await getDeck(db, id)).toBeNull();
    expect(await listDecks(db)).toEqual([]);
    // Rows are kept (for syncing in v2) but marked deleted.
    const deckRow = await db.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM decks WHERE id = ?',
      id,
    );
    const cardRow = await db.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM cards WHERE id = ?',
      cardId,
    );
    expect(deckRow?.deleted_at).not.toBeNull();
    expect(cardRow?.deleted_at).not.toBeNull();
  });

  it('returns null for a deck that does not exist', async () => {
    expect(await getDeck(db, 'missing-id')).toBeNull();
  });
});

describe('continue studying', () => {
  it('records when a deck was studied without changing its updated time', async () => {
    const id = await createDeck(db, { name: 'Bio' });
    const before = await getDeck(db, id);
    expect(before?.lastStudiedAt).toBeNull();

    await markDeckStudied(db, id);

    const after = await getDeck(db, id);
    expect(after?.lastStudiedAt).not.toBeNull();
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });

  it('picks the most recently studied deck with cards, else the newest deck with cards', async () => {
    const empty = await createDeck(db, { name: 'Empty' });
    const older = await createDeck(db, { name: 'Older' });
    await createCard(db, older, { front: 'Q', back: 'A' });
    await new Promise((r) => setTimeout(r, 5));
    const newer = await createDeck(db, { name: 'Newer' });
    await createCard(db, newer, { front: 'Q', back: 'A' });
    await markDeckStudied(db, empty);

    // Nothing with cards studied yet: newest deck with cards.
    expect(pickContinueDeck(await listDecks(db))?.id).toBe(newer);

    await markDeckStudied(db, older);
    expect(pickContinueDeck(await listDecks(db))?.id).toBe(older);
  });

  it('returns null when no deck has cards', async () => {
    await createDeck(db, { name: 'Empty' });
    expect(pickContinueDeck(await listDecks(db))).toBeNull();
  });
});

describe('migrations', () => {
  it('sets the schema version and can run again safely', async () => {
    const before = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(before?.user_version).toBe(14);

    await migrateDbIfNeeded(db); // second run should do nothing

    const after = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(after?.user_version).toBe(14);
  });
});

describe('study time', () => {
  it('adds up the time spent studying a deck', async () => {
    const id = await createDeck(db, { name: 'Bio' });
    expect((await getDeck(db, id))?.studySeconds).toBe(0);

    await addStudyTime(db, id, 42);
    await addStudyTime(db, id, 18);
    await addStudyTime(db, id, 0);

    expect((await getDeck(db, id))?.studySeconds).toBe(60);
  });
});
