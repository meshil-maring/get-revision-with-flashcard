import type { SQLiteDatabase } from 'expo-sqlite';

import { addAttachment, deleteAttachment, listAttachmentsForCards } from '@/data/attachments';
import { createCard } from '@/data/cards';
import { createDeck } from '@/data/decks';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;
let cardA: string;
let cardB: string;

beforeEach(async () => {
  db = await createTestDb();
  const deckId = await createDeck(db, { name: 'Deck' });
  cardA = await createCard(db, deckId, { front: 'A', back: 'a' });
  cardB = await createCard(db, deckId, { front: 'B', back: 'b' });
});

describe('attachments', () => {
  it('lists attachments grouped by card, in the order added', async () => {
    await addAttachment(db, cardA, { side: 'front', kind: 'image', uri: 'file:///1.jpg', name: 'cell.jpg', mimeType: 'image/jpeg' });
    await new Promise((r) => setTimeout(r, 5));
    await addAttachment(db, cardA, { side: 'back', kind: 'pdf', uri: 'file:///2.pdf', name: 'notes.pdf' });
    await addAttachment(db, cardB, { side: 'back', kind: 'audio', uri: 'file:///3.m4a', name: 'Voice note' });

    const byCard = await listAttachmentsForCards(db, [cardA, cardB]);

    expect(byCard.get(cardA)?.map((a) => [a.side, a.kind, a.name, a.mimeType])).toEqual([
      ['front', 'image', 'cell.jpg', 'image/jpeg'],
      ['back', 'pdf', 'notes.pdf', null],
    ]);
    expect(byCard.get(cardB)?.map((a) => a.kind)).toEqual(['audio']);
    expect((await listAttachmentsForCards(db, [])).size).toBe(0);
  });

  it('hides deleted attachments', async () => {
    const id = await addAttachment(db, cardA, { side: 'back', kind: 'image', uri: 'file:///1.jpg', name: 'x' });

    await deleteAttachment(db, id);

    expect((await listAttachmentsForCards(db, [cardA])).get(cardA)).toBeUndefined();
  });

  it('rejects an attachment for a card that does not exist', async () => {
    await expect(
      addAttachment(db, 'missing', { side: 'back', kind: 'image', uri: 'file:///1.jpg', name: 'x' }),
    ).rejects.toThrow();
  });
});
