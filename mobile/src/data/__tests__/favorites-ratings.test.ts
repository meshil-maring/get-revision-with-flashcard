import type { SQLiteDatabase } from 'expo-sqlite';

import { createCard, deleteCard, getCard, listCards, listFavoriteCards, rateCard, setFavorite } from '@/data/cards';
import { createDeck, deleteDeck } from '@/data/decks';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;
let deckId: string;

beforeEach(async () => {
  db = await createTestDb();
  deckId = await createDeck(db, { name: 'Biology' });
});

describe('ratings', () => {
  it('new cards are not rated and not favourites', async () => {
    const id = await createCard(db, deckId, { front: 'Q', back: 'A' });
    expect(await getCard(db, id)).toMatchObject({ rating: null, ratedAt: null, favoritedAt: null });
  });

  it('remembers the latest rating without changing updated_at', async () => {
    const id = await createCard(db, deckId, { front: 'Q', back: 'A' });
    const before = (await getCard(db, id))!.updatedAt;

    await rateCard(db, id, 'hard');
    await rateCard(db, id, 'easy');

    const card = (await getCard(db, id))!;
    expect(card.rating).toBe('easy');
    expect(card.ratedAt).not.toBeNull();
    expect(card.updatedAt).toBe(before);
  });
});

describe('favourites', () => {
  it('lists favourites from every deck with their deck name, newest first', async () => {
    const history = await createDeck(db, { name: 'History' });
    const a = await createCard(db, deckId, { front: 'Bio Q', back: 'A' });
    const b = await createCard(db, history, { front: 'History Q', back: 'B' });
    await createCard(db, deckId, { front: 'Not favourite', back: 'C' });

    await setFavorite(db, a, true);
    await new Promise((r) => setTimeout(r, 5));
    await setFavorite(db, b, true);

    const favorites = await listFavoriteCards(db);
    expect(favorites.map((c) => [c.front, c.deckName])).toEqual([
      ['History Q', 'History'],
      ['Bio Q', 'Biology'],
    ]);
  });

  it('can be removed, and leaves out deleted cards and decks', async () => {
    const history = await createDeck(db, { name: 'History' });
    const a = await createCard(db, deckId, { front: 'Unstarred', back: 'A' });
    const b = await createCard(db, deckId, { front: 'Deleted card', back: 'B' });
    const c = await createCard(db, history, { front: 'Deleted deck', back: 'C' });
    for (const id of [a, b, c]) await setFavorite(db, id, true);

    await setFavorite(db, a, false);
    await deleteCard(db, b);
    await deleteDeck(db, history);

    expect(await listFavoriteCards(db)).toEqual([]);
    expect((await listCards(db, deckId)).find((card) => card.id === a)?.favoritedAt).toBeNull();
  });
});
