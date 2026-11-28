import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SyncResponse } from '../src/sync/sync.ts';
import { createTestServer } from './helpers.ts';
import { callTool, connect, registerClient, useServer } from './mcp-client.ts';

// AI apps renaming, editing, moving and deleting what the user already has.

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeAll(async () => {
  server = await createTestServer();
  useServer(server);
});
afterAll(() => server.close());

let n = 0;
async function signIn() {
  const clientId = await registerClient('Claude');
  const { cookie } = await server.signUp(`edits-${++n}@example.com`);
  return { cookie, token: await connect(cookie, clientId) };
}

describe('changing decks and cards', () => {
  it('renames a deck, edits, regroups, moves and deletes cards, and deletes a deck', async () => {
    const { token } = await signIn();
    const bio = await callTool(token, 'create_deck', {
      name: 'Bio',
      cards: [
        { front: 'Q1', back: 'A1', group: 'Chapter 1' },
        { front: 'Q2', back: 'A2', group: 'Chapter 1' },
        { front: 'Q3', back: 'A3' },
      ],
    });
    const deckId = bio.data.deckId;
    const [c1, c2, c3] = (await callTool(token, 'get_deck', { deck_id: deckId })).data.cards.map((c: { id: string }) => c.id);

    const renamed = await callTool(token, 'update_deck', {
      deck_id: deckId,
      name: 'Biology',
      description: 'Cells',
      rename_groups: [{ from: 'chapter 1', to: 'Cells' }],
    });
    expect(renamed.data).toMatchObject({ name: 'Biology', groupsRenamed: ['chapter 1 → Cells'] });

    const edited = await callTool(token, 'update_cards', {
      cards: [
        { card_id: c1, back: 'A1 fixed' },
        { card_id: c3, group: 'Organs' },
        { card_id: c2, group: '' },
      ],
    });
    expect(edited.data).toEqual({ cardsUpdated: 3, groupsMade: ['Organs'] });
    let deck = (await callTool(token, 'get_deck', { deck_id: deckId })).data;
    expect(deck).toMatchObject({ name: 'Biology', description: 'Cells', groups: ['Cells', 'Organs'] });
    expect(deck.cards).toEqual([
      { id: c1, front: 'Q1', back: 'A1 fixed', group: 'Cells' },
      { id: c2, front: 'Q2', back: 'A2' },
      { id: c3, front: 'Q3', back: 'A3', group: 'Organs' },
    ]);

    // Deleting a group keeps its cards.
    const ungrouped = await callTool(token, 'update_deck', { deck_id: deckId, delete_groups: ['Cells'] });
    expect(ungrouped.data).toMatchObject({ groupsDeleted: ['Cells'], cardsUngrouped: 1 });
    expect((await callTool(token, 'get_deck', { deck_id: deckId })).data.cards[0]).toEqual({ id: c1, front: 'Q1', back: 'A1 fixed' });

    const chem = await callTool(token, 'create_deck', { name: 'Chem', cards: [{ front: 'H2O?', back: 'Water' }] });
    const moved = await callTool(token, 'move_cards', { card_ids: [c1], deck_id: chem.data.deckId, group: 'Moved' });
    expect(moved.data).toMatchObject({ cardsMoved: 1, deck: 'Chem', groupsMade: ['Moved'] });
    expect((await callTool(token, 'get_deck', { deck_id: chem.data.deckId })).data.cards).toHaveLength(2);

    expect((await callTool(token, 'delete_cards', { card_ids: [c2] })).data).toEqual({ cardsDeleted: 1 });
    const unknown = await callTool(token, 'delete_cards', { card_ids: [c2] });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain(c2);

    expect((await callTool(token, 'delete_deck', { deck_id: deckId })).data).toEqual({ deleted: 'Biology', cardsDeleted: 1 });
    expect((await callTool(token, 'list_decks')).data.map((d: { name: string }) => d.name)).toEqual(['Chem']);
    // The moved card went with Chem, not with the deleted deck.
    expect((await callTool(token, 'list_decks')).data[0].cardCount).toBe(2);
  });

  it('turns away a group rename that clashes, and changes nothing', async () => {
    const { token } = await signIn();
    const deck = await callTool(token, 'create_deck', {
      name: 'D',
      cards: [
        { front: 'a', back: 'b', group: 'One' },
        { front: 'c', back: 'd', group: 'Two' },
      ],
    });
    const clash = await callTool(token, 'update_deck', {
      deck_id: deck.data.deckId,
      name: 'Renamed',
      rename_groups: [{ from: 'One', to: 'two' }],
    });
    expect(clash.isError).toBe(true);
    expect((await callTool(token, 'get_deck', { deck_id: deck.data.deckId })).data).toMatchObject({ name: 'D', groups: ['One', 'Two'] });
  });
});

describe('changing notes and folders', () => {
  it('edits a note: text, title, style, tags and key points, keeping what is not passed', async () => {
    const { token } = await signIn();
    const note = await callTool(token, 'create_note', {
      title: 'Cells',
      folder_path: ['Bio'],
      body: 'Old body',
      tags: ['Exam', 'Hard'],
    });
    const id = note.data.noteId;

    const edited = await callTool(token, 'update_note', {
      note_id: id,
      title: 'Cell structure',
      body: 'New body',
      tags: ['hard', 'Revise'],
      good_to_know: ['Cells are small'],
    });
    expect(edited.data).toMatchObject({ title: 'Cell structure', tags: ['Hard', 'Revise'], goodToKnow: 'created' });
    expect((await callTool(token, 'get_note', { note_id: id })).data).toMatchObject({
      title: 'Cell structure',
      body: 'New body',
      folder: 'Bio',
      tags: ['Hard', 'Revise'],
    });

    // To Cornell: the body is kept for later, the rows are shown.
    await callTool(token, 'update_note', { note_id: id, style: 'cornell', cornell_rows: [{ cue: 'What?', notes: 'A unit' }] });
    expect((await callTool(token, 'get_note', { note_id: id })).data).toMatchObject({
      style: 'cornell',
      cornellRows: [{ cue: 'What?', notes: 'A unit' }],
    });
    // A Cornell note with nothing in it is refused.
    expect((await callTool(token, 'update_note', { note_id: id, cornell_rows: [] })).isError).toBe(true);
    expect((await callTool(token, 'update_note', { note_id: id, title: 'good to know' })).isError).toBe(true);
    expect((await callTool(token, 'update_note', { note_id: id, tags: [] })).data.tags).toEqual([]);
    expect((await callTool(token, 'list_notes', { tag: 'Hard' })).data).toEqual([]);
  });

  it('moves and deletes notes', async () => {
    const { token } = await signIn();
    const a = (await callTool(token, 'create_note', { title: 'A', body: 'a' })).data.noteId;
    const b = (await callTool(token, 'create_note', { title: 'B', body: 'b', folder_path: ['Old'] })).data.noteId;

    const moved = await callTool(token, 'move_notes', { note_ids: [a, b], folder_path: ['Class 10', 'New'] });
    expect(moved.data).toEqual({ notesMoved: 2, folder: 'Class 10 / New' });
    expect((await callTool(token, 'list_notes', { folder_path: ['Class 10'] })).data.map((x: { title: string }) => x.title)).toEqual(['A', 'B']);

    expect((await callTool(token, 'delete_notes', { note_ids: [a] })).data).toEqual({ notesDeleted: ['A'] });
    expect((await callTool(token, 'get_note', { note_id: a })).isError).toBe(true);
  });

  it('renames, moves and deletes folders like the app does', async () => {
    const { token, cookie } = await signIn();
    await callTool(token, 'create_note', { title: 'Speed', body: 'v = d/t', folder_path: ['Class 10', 'Physics', 'Ch 1'] });
    await callTool(token, 'create_note', { title: 'Cells', body: 'x', folder_path: ['Class 10', 'Biology'] });
    await callTool(token, 'create_note', { title: 'Top', body: 'x', folder_path: ['Science'] });
    const paths = async () => (await callTool(token, 'list_folders')).data.map((f: { path: string }) => f.path);

    expect((await callTool(token, 'rename_folder', { folder_path: ['class 10', 'physics'], new_name: 'Phys' })).data).toEqual({
      folder: 'Class 10 / Phys',
    });
    expect((await callTool(token, 'rename_folder', { folder_path: ['Class 10', 'Phys'], new_name: 'biology' })).isError).toBe(true);

    expect((await callTool(token, 'move_folder', { folder_path: ['Class 10', 'Phys'], to_folder_path: ['Science'] })).data).toEqual({
      folder: 'Science / Phys',
    });
    // Not into itself or one of its own folders, and not into a folder that doesn't exist.
    expect((await callTool(token, 'move_folder', { folder_path: ['Science'], to_folder_path: ['Science', 'Phys', 'Ch 1'] })).isError).toBe(true);
    expect((await callTool(token, 'move_folder', { folder_path: ['Science'], to_folder_path: ['Nope'] })).isError).toBe(true);
    expect(await paths()).toEqual(['Class 10', 'Class 10 / Biology', 'Science', 'Science / Phys', 'Science / Phys / Ch 1']);
    expect((await callTool(token, 'list_notes', { folder_path: ['Science', 'Phys'] })).data[0]).toMatchObject({
      title: 'Speed',
      folder: 'Science / Phys / Ch 1',
    });

    const gone = await callTool(token, 'delete_folder', { folder_path: ['Science'] });
    expect(gone.data).toEqual({ deleted: 'Science', foldersDeleted: 3, notesDeleted: 2 });
    expect(await paths()).toEqual(['Class 10', 'Class 10 / Biology']);
    expect((await callTool(token, 'list_notes')).data.map((x: { title: string }) => x.title)).toEqual(['Cells']);

    // Devices get the deletions as rows marked deleted, like the app's own.
    const sync = await server.request('/api/sync', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ cursor: 0, changes: [] }),
    });
    const { changes } = (await sync.json()) as SyncResponse;
    const deletedNotes = changes.filter((c) => c.table === 'notes' && c.data.deleted_at).map((c) => c.data.title);
    expect(deletedNotes.sort()).toEqual(['Speed', 'Top']);
  });
});

describe('handwritten notes', () => {
  it('shows a handwritten note without its drawing, keeps it out of text search, and leaves its writing alone', async () => {
    const { cookie, token } = await signIn();
    const now = new Date().toISOString();
    const drawing = JSON.stringify({ v: 1, paper: 'lined', height: 1414, strokes: [{ c: '#1f2933', w: 5, p: [10, 10, 50, 60] }] });
    const id = 'hand-1';
    // The app makes handwritten notes and syncs them up.
    const pushed = await server.request('/api/sync', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cursor: 0,
        changes: [
          {
            table: 'notes',
            id,
            modifiedAt: now,
            data: {
              id,
              folder_id: null,
              title: 'Photosynthesis sketch',
              style: 'handwritten',
              body: drawing,
              cornell_rows: '[]',
              summary: '',
              created_by: null,
              favorited_at: null,
              created_at: now,
              updated_at: now,
              deleted_at: null,
            },
          },
        ],
      }),
    });
    expect(pushed.status).toBe(200);

    const note = (await callTool(token, 'get_note', { note_id: id })).data;
    expect(note).toMatchObject({ title: 'Photosynthesis sketch', style: 'handwritten' });
    expect(note.body).toBeUndefined();
    expect(note.handwritten).toMatch(/by hand/);

    // The drawing's JSON doesn't match searches; the title does.
    expect((await callTool(token, 'list_notes', { search: 'strokes' })).data).toEqual([]);
    expect((await callTool(token, 'list_notes', { search: 'photosynthesis' })).data).toHaveLength(1);

    expect((await callTool(token, 'update_note', { note_id: id, body: 'typed over' })).isError).toBe(true);
    expect((await callTool(token, 'update_note', { note_id: id, style: 'plain' })).isError).toBe(true);
    const renamed = await callTool(token, 'update_note', { note_id: id, title: 'Leaf sketch' });
    expect(renamed.isError).toBeFalsy();
    const sync = await server.request('/api/sync', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ cursor: 0, changes: [] }),
    });
    const row = ((await sync.json()) as SyncResponse).changes.find((c) => c.table === 'notes' && c.id === id);
    expect(row?.data).toMatchObject({ title: 'Leaf sketch', style: 'handwritten', body: drawing });
  });
});
