import type { SQLiteDatabase } from 'expo-sqlite';

import { addAttachment, deleteAttachment, listAttachmentsForCards } from '@/data/attachments';

import { createCard, deleteCard, listCards, setFavorite, updateCard } from '@/data/cards';
import { createDeck, deleteDeck, getDeck, listDecks, updateDeck } from '@/data/decks';
import { createFolder } from '@/data/folders';
import { addNoteAttachment, createNote, getNote, listNoteAttachments } from '@/data/notes';
import {
  clearAccountData,
  countPendingChanges,
  FileUploadError,
  getLastSyncedAt,
  runSync,
  type FileTransport,
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

/** An in-memory stand-in for the account's file storage. */
function fakeFiles(device: string, store = new Map<string, string>()) {
  const files: FileTransport & { failNext?: string } = {
    async upload(file) {
      if (files.failNext) {
        const message = files.failNext;
        files.failNext = undefined;
        throw new Error(message);
      }
      const key = `u/user-1/${file.id}`;
      store.set(key, `bytes of ${file.uri}`);
      return key;
    },
    async downloadUrls(keys) {
      return Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, `https://r2.test/${k}`]));
    },
    async download(url, file) {
      return `file:///${device}/${file.id}.bin`;
    },
  };
  return { files, store };
}

describe('attachment sync', () => {
  async function cardWithImage(db: SQLiteDatabase) {
    const deckId = await createDeck(db, { name: 'Biology' });
    const cardId = await createCard(db, deckId, { front: 'Cell?', back: 'Unit of life' });
    const attachmentId = await addAttachment(db, cardId, {
      side: 'front',
      kind: 'image',
      uri: 'file:///phone/cell.jpg',
      name: 'cell.jpg',
      mimeType: 'image/jpeg',
    });
    return { cardId, attachmentId };
  }

  it("uploads a file and downloads it onto the user's other device", async () => {
    const { cardId } = await cardWithImage(phone);
    const store = new Map<string, string>();
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone', store).files);

    // The device's own path never leaves it.
    const sent = [...server.rows.values()].find((r) => r.table === 'attachments')!;
    expect(sent.data.uri).toBeUndefined();
    expect(sent.data.remote_key).toMatch(/^u\/user-1\//);
    expect(store.size).toBe(1);

    await runSync(tablet, 'user-1', server.sync, fakeFiles('tablet', store).files);
    const [onTablet] = (await listAttachmentsForCards(tablet, [cardId])).get(cardId)!;
    expect(onTablet).toMatchObject({ name: 'cell.jpg', uri: expect.stringMatching(/^file:\/\/\/tablet\//) });

    // Downloading isn't a change to send back, and the phone keeps its own copy.
    expect(await countPendingChanges(tablet)).toBe(0);
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone', store).files);
    const [onPhone] = (await listAttachmentsForCards(phone, [cardId])).get(cardId)!;
    expect(onPhone.uri).toBe('file:///phone/cell.jpg');
  });

  it('hides an attachment until its file is on the device', async () => {
    const { cardId } = await cardWithImage(phone);
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone').files);
    // The tablet can't reach the file storage (an empty store has nothing to download).
    await runSync(tablet, 'user-1', server.sync, fakeFiles('tablet').files);
    expect((await listAttachmentsForCards(tablet, [cardId])).get(cardId)).toBeUndefined();
    expect((await listCards(tablet, (await listDecks(tablet))[0].id)).map((c) => c.front)).toEqual(['Cell?']);
  });

  it('saves the rest of the sync when a file fails to upload, and tries it again next time', async () => {
    await cardWithImage(phone);
    const { files } = fakeFiles('phone');
    files.failNext = 'Your storage is full.';
    await expect(runSync(phone, 'user-1', server.sync, files)).rejects.toThrow(FileUploadError);
    await expect(runSync(phone, 'user-1', server.sync, fakeFiles('phone').files)).resolves.toBeDefined();
    expect([...server.rows.values()].find((r) => r.table === 'attachments')!.data.remote_key).toBeTruthy();
  });

  it('counts files not uploaded yet as unsynced, so signing out warns first', async () => {
    await cardWithImage(phone);
    const { files } = fakeFiles('phone');
    files.failNext = 'offline';
    await runSync(phone, 'user-1', server.sync, files).catch(() => undefined);
    expect(await countPendingChanges(phone)).toBe(1);
  });

  it("deletes a card's attachments with it", async () => {
    const { cardId, attachmentId } = await cardWithImage(phone);
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone').files);
    await deleteCard(phone, cardId);
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone').files);
    expect(server.rows.get(`attachments/${attachmentId}`)!.data.deleted_at).toBeTruthy();
  });

  it('syncs a deleted attachment', async () => {
    const { attachmentId } = await cardWithImage(phone);
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone').files);
    await deleteAttachment(phone, attachmentId);
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone').files);
    expect(server.rows.get(`attachments/${attachmentId}`)!.data.deleted_at).toBeTruthy();
  });

  it('syncs note attachments too', async () => {
    const folderId = await createFolder(phone, { name: 'Physics', parentId: null });
    const noteId = await createNote(phone, folderId, { title: 'Waves', style: 'plain', body: '' });
    await addNoteAttachment(phone, noteId, { kind: 'pdf', uri: 'file:///phone/waves.pdf', name: 'waves.pdf' });
    const store = new Map<string, string>();
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone', store).files);
    await runSync(tablet, 'user-1', server.sync, fakeFiles('tablet', store).files);
    expect((await listNoteAttachments(tablet, noteId)).map((a) => a.name)).toEqual(['waves.pdf']);
  });

  it('brings an image an AI app attached: loading at first, then shown with its caption', async () => {
    const noteId = await createNote(phone, null, { title: 'Intersections', style: 'plain', body: 'Where roads meet.' });
    const store = new Map<string, string>();
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone', store).files);

    // The server writes the row as backend/src/mcp/note-images.ts does (no uri: that is per device).
    const at = new Date(Date.now() + 1000).toISOString();
    server.rows.set('note_attachments/ai-1', {
      table: 'note_attachments',
      id: 'ai-1',
      modifiedAt: at,
      rev: 10_000,
      data: {
        id: 'ai-1',
        note_id: noteId,
        kind: 'image',
        name: 'crossroads.png',
        mime_type: 'image/png',
        created_at: at,
        deleted_at: null,
        remote_key: 'u/user-1/ai-1',
        caption: 'Figure 1: A crossroads',
        alt_text: 'Two roads crossing',
        position: 0,
      },
    });

    // The file isn't reachable yet (e.g. offline): the note lists it as downloading.
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone', store).files);
    expect(await listNoteAttachments(phone, noteId)).toMatchObject([{ id: 'ai-1', uri: '', caption: 'Figure 1: A crossroads' }]);
    expect(await countPendingChanges(phone)).toBe(0); // saving it is not a change to send back

    store.set('u/user-1/ai-1', 'png bytes');
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone', store).files);
    expect(await listNoteAttachments(phone, noteId)).toMatchObject([
      { uri: 'file:///phone/ai-1.bin', caption: 'Figure 1: A crossroads', altText: 'Two roads crossing', position: 0 },
    ]);
  });

  it('syncs a changed caption', async () => {
    const noteId = await createNote(phone, null, { title: 'Signals', style: 'plain', body: 'x' });
    const id = await addNoteAttachment(phone, noteId, { kind: 'image', uri: 'file:///phone/s.png', name: 's.png' });
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone').files);
    await phone.runAsync("UPDATE note_attachments SET caption = 'Signal phases' WHERE id = ?", id);
    expect(await countPendingChanges(phone)).toBe(1);
    await runSync(phone, 'user-1', server.sync, fakeFiles('phone').files);
    expect(server.rows.get(`note_attachments/${id}`)!.data.caption).toBe('Signal phases');
  });

  it('hands back the files to delete on sign-out', async () => {
    await cardWithImage(phone);
    expect(await clearAccountData(phone)).toEqual(['file:///phone/cell.jpg']);
  });
});
