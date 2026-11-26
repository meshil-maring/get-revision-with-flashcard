import type { SQLiteDatabase } from 'expo-sqlite';

import { createGroup, deleteGroup, listGroups, moveGroup, renameGroup } from '@/data/card-groups';
import { createCard, getCard, listCards, setCardGroup, updateCard } from '@/data/cards';
import { createDeck, deleteDeck } from '@/data/decks';
import { runSync, type SyncChange, type SyncRequest, type SyncResponse } from '@/data/sync';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;
let deckId: string;

beforeEach(async () => {
  db = await createTestDb();
  deckId = await createDeck(db, { name: 'Physics' });
});

describe('card groups', () => {
  it('lists a deck’s groups in the order they were made, with trimmed names', async () => {
    await createGroup(db, deckId, '  Chapter 1 ');
    await createGroup(db, deckId, 'Chapter 2');
    const other = await createDeck(db, { name: 'Other' });
    await createGroup(db, other, 'Not mine');

    expect((await listGroups(db, deckId)).map((g) => [g.name, g.position])).toEqual([
      ['Chapter 1', 0],
      ['Chapter 2', 1],
    ]);
  });

  it('renames and reorders groups', async () => {
    const a = await createGroup(db, deckId, 'A');
    await createGroup(db, deckId, 'B');
    const c = await createGroup(db, deckId, 'C');

    await renameGroup(db, a, ' First ');
    await moveGroup(db, c, -1);
    expect((await listGroups(db, deckId)).map((g) => g.name)).toEqual(['First', 'C', 'B']);

    await moveGroup(db, a, -1); // already at the top: nothing happens
    await moveGroup(db, a, 1);
    expect((await listGroups(db, deckId)).map((g) => g.name)).toEqual(['C', 'First', 'B']);
  });

  it('puts cards in a group when they are made, edited or moved', async () => {
    const group = await createGroup(db, deckId, 'Formulas');
    const inGroup = await createCard(db, deckId, { front: 'F = ?', back: 'ma', groupId: group });
    const loose = await createCard(db, deckId, { front: 'Who?', back: 'Newton' });

    expect((await getCard(db, inGroup))?.groupId).toBe(group);
    expect((await getCard(db, loose))?.groupId).toBeNull();

    await setCardGroup(db, loose, group);
    expect((await getCard(db, loose))?.groupId).toBe(group);

    // Editing the text alone keeps the group; passing null takes the card out.
    await updateCard(db, inGroup, { front: 'Force = ?', back: 'ma' });
    expect((await getCard(db, inGroup))?.groupId).toBe(group);
    await updateCard(db, inGroup, { front: 'Force = ?', back: 'ma', groupId: null });
    expect((await getCard(db, inGroup))?.groupId).toBeNull();
  });

  it('keeps the cards when a group is deleted', async () => {
    const group = await createGroup(db, deckId, 'Chapter 1');
    await createCard(db, deckId, { front: 'Q', back: 'A', groupId: group });

    await deleteGroup(db, group);

    expect(await listGroups(db, deckId)).toEqual([]);
    const cards = await listCards(db, deckId);
    expect(cards.map((c) => [c.front, c.groupId])).toEqual([['Q', null]]);
  });

  it('deletes a deck’s groups with the deck', async () => {
    await createGroup(db, deckId, 'Chapter 1');
    await deleteDeck(db, deckId);
    expect(await listGroups(db, deckId)).toEqual([]);
  });

  it('syncs groups and which group each card is in to the user’s other devices', async () => {
    const rows = new Map<string, SyncChange>();
    let rev = 0;
    const server = async (request: SyncRequest): Promise<SyncResponse> => {
      for (const c of request.changes) rows.set(`${c.table}/${c.id}`, c);
      rev += 1;
      return { cursor: rev, changes: [...rows.values()], more: false };
    };
    const group = await createGroup(db, deckId, 'Chapter 1');
    const cardId = await createCard(db, deckId, { front: 'Q', back: 'A', groupId: group });

    await runSync(db, 'user-1', server);
    const tablet = await createTestDb();
    await runSync(tablet, 'user-1', server);

    expect((await listGroups(tablet, deckId)).map((g) => g.name)).toEqual(['Chapter 1']);
    expect((await getCard(tablet, cardId))?.groupId).toBe(group);
  });
});
