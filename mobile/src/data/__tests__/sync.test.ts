import type { SQLiteDatabase } from 'expo-sqlite';

import { createCard, listCards, setFavorite, updateCard } from '@/data/cards';
import { createDeck, deleteDeck, getDeck, listDecks, updateDeck } from '@/data/decks';
import { createFolder } from '@/data/folders';
import { createNote, getNote } from '@/data/notes';
import {
  clearAccountData,
  countPendingChanges,
  getLastSyncedAt,
  runSync,
  type SyncChange,
  type SyncRequest,
  type SyncResponse,
} from '@/data/sync';
import { createTag, listTagsForNotes, setNoteTags } from '@/data/tags';
import { createTestDb } from '@/test-utils/test-db';

/** An in-memory stand-in for the server's /api/sync, with the same rules. */
function fakeServer() {
  let rev = 0;
  const rows = new Map<string, SyncChange & { rev: number }>();
  const requests: SyncRequest[] = [];

  async function sync(request: SyncRequest): Promise<SyncResponse> {
    requests.push(request);
    const rejected: string[] = [];
    for (const c of request.changes) {
      const key = `${c.table}/${c.id}`;
      const existing = rows.get(key);
      if (existing && existing.modifiedAt > c.modifiedAt) {
        rejected.push(key);
        continue;
      }
      rows.set(key, { ...c, rev: ++rev });
    }
    const changed = [...rows.values()].filter((r) => r.rev > request.cursor).sort((a, b) => a.rev - b.rev);
    const changes = changed.map(({ rev: _rev, ...c }) => c);
    for (const key of rejected) {
      if (!changed.some((c) => `${c.table}/${c.id}` === key)) {
        const { rev: _rev, ...c } = rows.get(key)!;
        changes.push(c);
      }
    }
    return { cursor: rev, changes, more: false };
  }
  return { sync, rows, requests };
}

let phone: SQLiteDatabase;
let tablet: SQLiteDatabase;
let server: ReturnType<typeof fakeServer>;

beforeEach(async () => {
  phone = await createTestDb();
  tablet = await createTestDb();
  server = fakeServer();
});

describe('sync', () => {
  it('notes local changes in the outbox', async () => {
    const deckId = await createDeck(phone, { name: 'Physics' });
    await createCard(phone, deckId, { front: 'F', back: 'B' });
    expect(await countPendingChanges(phone)).toBe(2);
  });

  it("moves guest data into the account and onto the user's other devices", async () => {
    const deckId = await createDeck(phone, { name: 'Physics' });
    const cardId = await createCard(phone, deckId, { front: 'Speed of light?', back: '3×10⁸ m/s' });
    await setFavorite(phone, cardId, true);
    const folderId = await createFolder(phone, { name: 'Class 10', parentId: null });
    const noteId = await createNote(phone, folderId, { title: 'Motion', style: 'plain', body: 'v = d / t' });
    const tagId = await createTag(phone, { name: 'Exam' });
    await setNoteTags(phone, noteId, [tagId]);

    const first = await runSync(phone, 'user-1', server.sync);
    expect(first.sent).toBe(6);
    expect(await countPendingChanges(phone)).toBe(0);
    expect(await getLastSyncedAt(phone)).not.toBeNull();

    await runSync(tablet, 'user-1', server.sync);
    expect((await listDecks(tablet)).map((d) => d.name)).toEqual(['Physics']);
    const [card] = await listCards(tablet, deckId);
    expect(card.front).toBe('Speed of light?');
    expect(card.favoritedAt).not.toBeNull();
    expect((await getNote(tablet, noteId))?.body).toBe('v = d / t');
    expect((await listTagsForNotes(tablet, [noteId])).get(noteId)?.map((t) => t.name)).toEqual(['Exam']);
    // Rows saved from the server are not sent back.
    expect(await countPendingChanges(tablet)).toBe(0);
  });

  it('sends only what changed since the last sync', async () => {
    const deckId = await createDeck(phone, { name: 'Physics' });
    await runSync(phone, 'user-1', server.sync);
    await updateDeck(phone, deckId, { name: 'Physics 2' });

    await runSync(phone, 'user-1', server.sync);
    const last = server.requests[server.requests.length - 1];
    expect(last.changes.map((c) => c.data.name)).toEqual(['Physics 2']);
    expect(last.cursor).toBeGreaterThan(0);
  });

  it('keeps the newest change when two devices edit the same card', async () => {
    const deckId = await createDeck(phone, { name: 'Physics' });
    const cardId = await createCard(phone, deckId, { front: 'Q', back: 'A' });
    await runSync(phone, 'user-1', server.sync);
    await runSync(tablet, 'user-1', server.sync);

    await updateCard(tablet, cardId, { front: 'Q', back: 'tablet answer' });
    await new Promise((r) => setTimeout(r, 5));
    await updateCard(phone, cardId, { front: 'Q', back: 'phone answer (newer)' });

    await runSync(phone, 'user-1', server.sync);
    await runSync(tablet, 'user-1', server.sync); // its older edit loses
    await runSync(phone, 'user-1', server.sync);

    expect((await listCards(tablet, deckId))[0].back).toBe('phone answer (newer)');
    expect((await listCards(phone, deckId))[0].back).toBe('phone answer (newer)');
  });

  it('does not overwrite a newer local change with an older server row', async () => {
    const deckId = await createDeck(phone, { name: 'Old' });
    await runSync(phone, 'user-1', server.sync);
    await runSync(tablet, 'user-1', server.sync);

    await updateDeck(tablet, deckId, { name: 'Tablet' });
    await runSync(tablet, 'user-1', server.sync);
    await new Promise((r) => setTimeout(r, 5));
    await updateDeck(phone, deckId, { name: 'Phone (newest)' });

    // The phone pulls the tablet's row but keeps its own newer edit, then sends it.
    await runSync(phone, 'user-1', server.sync);
    expect((await getDeck(phone, deckId))?.name).toBe('Phone (newest)');
    await runSync(tablet, 'user-1', server.sync);
    expect((await getDeck(tablet, deckId))?.name).toBe('Phone (newest)');
  });

  it('syncs deletes (soft deletes)', async () => {
    const deckId = await createDeck(phone, { name: 'Gone soon' });
    await runSync(phone, 'user-1', server.sync);
    await runSync(tablet, 'user-1', server.sync);
    await deleteDeck(phone, deckId);
    await runSync(phone, 'user-1', server.sync);
    await runSync(tablet, 'user-1', server.sync);
    expect(await listDecks(tablet)).toEqual([]);
  });

  it('clears account data on sign-out', async () => {
    await createDeck(phone, { name: 'Physics' });
    await runSync(phone, 'user-1', server.sync);
    await clearAccountData(phone);
    expect(await listDecks(phone)).toEqual([]);
    expect(await getLastSyncedAt(phone)).toBeNull();
    expect(await countPendingChanges(phone)).toBe(0);
  });

  it('leaves the outbox alone when the request fails', async () => {
    await createDeck(phone, { name: 'Physics' });
    await expect(
      runSync(phone, 'user-1', async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
    expect(await countPendingChanges(phone)).toBe(1);
  });
});
