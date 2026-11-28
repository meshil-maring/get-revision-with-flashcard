import type { SQLiteDatabase } from 'expo-sqlite';

import { createGroup } from '@/data/card-groups';
import {
  createCard,
  deleteCard,
  deleteCards,
  listCards,
  listCardsForDecks,
  moveCardsToDeck,
  searchCards,
  setCardsGroup,
  setFavorite,
  setFavorites,
  updateCard,
} from '@/data/cards';
import { createDeck } from '@/data/decks';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;
let deckId: string;

beforeEach(async () => {
  db = await createTestDb();
  deckId = await createDeck(db, { name: 'Deck' });
});

describe('cards', () => {
  it('creates cards with trimmed text and lists them in the order added', async () => {
    await createCard(db, deckId, { front: '  Q1 ', back: ' A1  ' });
    await new Promise((r) => setTimeout(r, 5));
    await createCard(db, deckId, { front: 'Q2', back: 'A2' });

    const cards = await listCards(db, deckId);

    expect(cards.map((c) => [c.front, c.back])).toEqual([
      ['Q1', 'A1'],
      ['Q2', 'A2'],
    ]);
    expect(cards.every((c) => c.deckId === deckId && c.deletedAt === null)).toBe(true);
  });

  it('only lists cards from the requested deck', async () => {
    const otherDeck = await createDeck(db, { name: 'Other' });
    await createCard(db, deckId, { front: 'Mine', back: 'A' });
    await createCard(db, otherDeck, { front: 'Not mine', back: 'B' });

    const cards = await listCards(db, deckId);

    expect(cards.map((c) => c.front)).toEqual(['Mine']);
  });

  it('lists cards from several decks, grouped in the order the decks are given', async () => {
    const second = await createDeck(db, { name: 'Second' });
    const ignored = await createDeck(db, { name: 'Ignored' });
    await createCard(db, deckId, { front: 'First 1', back: 'A' });
    await createCard(db, second, { front: 'Second 1', back: 'B' });
    await createCard(db, ignored, { front: 'Ignored 1', back: 'C' });
    const removed = await createCard(db, second, { front: 'Removed', back: 'D' });
    await deleteCard(db, removed);

    const cards = await listCardsForDecks(db, [second, deckId]);

    expect(cards.map((c) => c.front)).toEqual(['Second 1', 'First 1']);
    expect(await listCardsForDecks(db, [])).toEqual([]);
  });

  it('updates the front and back', async () => {
    const id = await createCard(db, deckId, { front: 'Old Q', back: 'Old A' });

    await updateCard(db, id, { front: 'New Q', back: 'New A' });

    const [card] = await listCards(db, deckId);
    expect(card).toMatchObject({ id, front: 'New Q', back: 'New A' });
  });

  it('hides deleted cards', async () => {
    const keep = await createCard(db, deckId, { front: 'Keep', back: 'A' });
    const remove = await createCard(db, deckId, { front: 'Remove', back: 'B' });

    await deleteCard(db, remove);

    const cards = await listCards(db, deckId);
    expect(cards.map((c) => c.id)).toEqual([keep]);
  });

  it('rejects a card for a deck that does not exist', async () => {
    await expect(createCard(db, 'missing-deck', { front: 'Q', back: 'A' })).rejects.toThrow();
  });
});

describe('several cards at once', () => {
  it('puts cards into a group and out again', async () => {
    const a = await createCard(db, deckId, { front: 'A', back: '' });
    const b = await createCard(db, deckId, { front: 'B', back: '' });
    const group = await createGroup(db, deckId, 'Chapter 1');

    await setCardsGroup(db, [a, b], group);
    expect((await listCards(db, deckId)).map((c) => c.groupId)).toEqual([group, group]);

    await setCardsGroup(db, [a], null);
    expect((await listCards(db, deckId)).map((c) => c.groupId)).toEqual([null, group]);
  });

  it('moves cards to another deck, out of their group', async () => {
    const other = await createDeck(db, { name: 'Other' });
    const group = await createGroup(db, deckId, 'Chapter 1');
    const a = await createCard(db, deckId, { front: 'A', back: '', groupId: group });
    await createCard(db, deckId, { front: 'Stays', back: '' });

    await moveCardsToDeck(db, [a], other);

    expect((await listCards(db, deckId)).map((c) => c.front)).toEqual(['Stays']);
    const [moved] = await listCards(db, other);
    expect(moved.front).toBe('A');
    expect(moved.groupId).toBeNull();
  });

  it('deletes cards', async () => {
    const a = await createCard(db, deckId, { front: 'A', back: '' });
    const b = await createCard(db, deckId, { front: 'B', back: '' });
    await createCard(db, deckId, { front: 'C', back: '' });

    await deleteCards(db, [a, b]);

    expect((await listCards(db, deckId)).map((c) => c.front)).toEqual(['C']);
  });

  it('stars and un-stars cards, keeping when a card was first starred', async () => {
    const a = await createCard(db, deckId, { front: 'A', back: '' });
    const b = await createCard(db, deckId, { front: 'B', back: '' });
    await setFavorite(db, a, true);
    const firstStarred = (await listCards(db, deckId))[0].favoritedAt;

    await new Promise((r) => setTimeout(r, 5));
    await setFavorites(db, [a, b], true);
    const starred = await listCards(db, deckId);
    expect(starred[0].favoritedAt).toBe(firstStarred);
    expect(starred[1].favoritedAt).not.toBeNull();

    await setFavorites(db, [a, b], false);
    expect((await listCards(db, deckId)).every((c) => c.favoritedAt === null)).toBe(true);
  });
});

describe('searchCards', () => {
  it('finds cards in every deck by question or answer, ignoring formatting and deleted cards', async () => {
    const other = await createDeck(db, { name: 'Other' });
    await createCard(db, deckId, { front: 'What is osmosis?', back: 'Water moving' });
    await createCard(db, other, { front: 'Cell parts', back: 'The **Osmosis** pump' });
    const gone = await createCard(db, deckId, { front: 'Osmosis again', back: '' });
    await deleteCard(db, gone);
    await createCard(db, deckId, { front: '50% off', back: '' });

    const found = await searchCards(db, 'OSMOSIS');
    expect(found.map((c) => [c.front, c.deckName]).sort()).toEqual([
      ['Cell parts', 'Other'],
      ['What is osmosis?', 'Deck'],
    ]);
    expect(await searchCards(db, '**')).toEqual([]);
    expect((await searchCards(db, '%')).map((c) => c.front)).toEqual(['50% off']);
    expect(await searchCards(db, '  ')).toEqual([]);
  });
});
