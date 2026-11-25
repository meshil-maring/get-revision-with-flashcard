import type { SQLiteDatabase } from 'expo-sqlite';

import { createCard, deleteCard, listCards, listCardsForDecks, updateCard } from '@/data/cards';
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
