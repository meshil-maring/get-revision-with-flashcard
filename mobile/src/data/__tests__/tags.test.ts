import type { SQLiteDatabase } from 'expo-sqlite';

import { createFolder, deleteFolder, setFolderFavorite } from '@/data/folders';
import { createNote, deleteNote, listFavorites, listNotesWithTag, setNoteFavorite, updateNote } from '@/data/notes';
import {
  createTag,
  deleteTag,
  ensureTag,
  getTag,
  listTags,
  listTagsForNotes,
  searchTags,
  setNoteTags,
  TagNameTakenError,
  updateTag,
} from '@/data/tags';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;

beforeEach(async () => {
  db = await createTestDb();
});

describe('tags', () => {
  it('makes tags with the next colour when none is given, sorted by name', async () => {
    const exam2 = await createTag(db, { name: ' Exam 2 ' });
    const exam10 = await createTag(db, { name: 'Exam 10', color: 'red' });
    await createTag(db, { name: 'Important' });

    expect((await listTags(db)).map((t) => [t.name, t.color])).toEqual([
      ['Exam 2', 'blue'],
      ['Exam 10', 'red'],
      ['Important', 'orange'], // third tag → third colour
    ]);
    expect(await getTag(db, exam2)).toMatchObject({ name: 'Exam 2' });
    expect(exam10).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not allow two tags with the same name (any case)', async () => {
    const a = await createTag(db, { name: 'Exam 1' });
    const b = await createTag(db, { name: 'Revise' });
    await expect(createTag(db, { name: 'exam 1' })).rejects.toBeInstanceOf(TagNameTakenError);
    await expect(updateTag(db, b, { name: 'EXAM 1', color: 'blue' })).rejects.toBeInstanceOf(TagNameTakenError);

    await updateTag(db, a, { name: 'EXAM 1', color: 'purple' }); // its own name, new case and colour
    expect(await getTag(db, a)).toMatchObject({ name: 'EXAM 1', color: 'purple' });
  });

  it('ensureTag reuses a tag or makes it', async () => {
    const a = await ensureTag(db, 'Important');
    expect(await ensureTag(db, ' important ')).toBe(a);
    expect(await listTags(db)).toHaveLength(1);
  });

  it('puts tags on notes, takes them off, and can add them back', async () => {
    const note = await createNote(db, null, { title: 'Speed', style: 'plain' });
    const exam = await createTag(db, { name: 'Exam 1' });
    const hard = await createTag(db, { name: 'Hard' });

    await setNoteTags(db, note, [hard, exam, exam]);
    expect((await listTagsForNotes(db, [note])).get(note)?.map((t) => t.name)).toEqual(['Exam 1', 'Hard']);

    await setNoteTags(db, note, [exam]);
    expect((await listTagsForNotes(db, [note])).get(note)?.map((t) => t.name)).toEqual(['Exam 1']);

    await setNoteTags(db, note, [exam, hard]); // added back after being removed
    expect((await listTagsForNotes(db, [note])).get(note)).toHaveLength(2);

    await setNoteTags(db, note, []);
    expect((await listTagsForNotes(db, [note])).get(note)).toBeUndefined();
  });

  it('counts and lists the notes with a tag, from every folder, leaving out deleted ones', async () => {
    const classId = await createFolder(db, { parentId: null, name: 'Class 10' });
    const physics = await createFolder(db, { parentId: classId, name: 'Physics' });
    const biology = await createFolder(db, { parentId: null, name: 'Biology' });
    const exam = await createTag(db, { name: 'Exam 1' });

    const speed = await createNote(db, physics, { title: 'Speed', style: 'plain' });
    const cells = await createNote(db, biology, { title: 'Cells', style: 'plain' });
    const gone = await createNote(db, null, { title: 'Gone', style: 'plain' });
    for (const id of [speed, cells, gone]) await setNoteTags(db, id, [exam]);
    await deleteNote(db, gone);

    expect((await listTags(db))[0].noteCount).toBe(2);
    const notes = await listNotesWithTag(db, exam);
    expect(notes.map((n) => [n.title, n.path.map((p) => p.name)])).toEqual([
      ['Cells', ['Biology']],
      ['Speed', ['Class 10', 'Physics']],
    ]);
  });

  it('keeps the notes when a tag is deleted', async () => {
    const note = await createNote(db, null, { title: 'Speed', style: 'plain' });
    const exam = await createTag(db, { name: 'Exam 1' });
    await setNoteTags(db, note, [exam]);

    await deleteTag(db, exam);

    expect(await listTags(db)).toEqual([]);
    expect((await listTagsForNotes(db, [note])).get(note)).toBeUndefined();
    expect(await listNotesWithTag(db, exam)).toEqual([]);
    await expect(createTag(db, { name: 'Exam 1' })).resolves.toBeTruthy(); // name free again
  });

  it('deletes tags that have no notes left, but keeps ones never used yet', async () => {
    const a = await createNote(db, null, { title: 'Speed', style: 'plain' });
    const b = await createNote(db, null, { title: 'Cells', style: 'plain' });
    const removed = await createTag(db, { name: 'Removed' });
    const orphaned = await createTag(db, { name: 'Orphaned' });
    const kept = await createTag(db, { name: 'Kept' });
    await createTag(db, { name: 'Fresh' });

    await setNoteTags(db, a, [removed, kept]);
    await setNoteTags(db, b, [orphaned]);
    await setNoteTags(db, a, [kept]); // "Removed" taken off its only note
    await deleteNote(db, b); // "Orphaned" loses its only note

    expect((await listTags(db)).map((t) => [t.name, t.noteCount])).toEqual([
      ['Fresh', 0],
      ['Kept', 1],
    ]);
    await expect(createTag(db, { name: 'Removed' })).resolves.toBeTruthy(); // name free again
  });

  it('finds tags by part of the name', async () => {
    await createTag(db, { name: 'Exam 1' });
    await createTag(db, { name: 'Important' });
    expect((await searchTags(db, 'XAM')).map((t) => t.name)).toEqual(['Exam 1']);
    expect(await searchTags(db, ' ')).toEqual([]);
  });
});

describe('favourites', () => {
  it('lists starred folders and notes, newest first, with where they are', async () => {
    const classId = await createFolder(db, { parentId: null, name: 'Class 10' });
    const physics = await createFolder(db, { parentId: classId, name: 'Physics' });
    const note = await createNote(db, physics, { title: 'Speed', style: 'plain' });
    await createNote(db, physics, { title: 'Not starred', style: 'plain' });

    await setFolderFavorite(db, classId, true);
    await new Promise((r) => setTimeout(r, 5));
    await setFolderFavorite(db, physics, true);
    await setNoteFavorite(db, note, true);

    const favorites = await listFavorites(db);
    expect(favorites.folders.map((f) => [f.name, f.path.map((p) => p.name), f.folderCount, f.noteCount])).toEqual([
      ['Physics', ['Class 10'], 0, 2],
      ['Class 10', [], 1, 0],
    ]);
    expect(favorites.notes.map((n) => [n.title, n.path.map((p) => p.name)])).toEqual([['Speed', ['Class 10', 'Physics']]]);
  });

  it('unstars, and does not change when a note was last edited', async () => {
    const note = await createNote(db, null, { title: 'Speed', style: 'plain' });
    const before = (await listFavorites(db)).notes;
    expect(before).toEqual([]);

    await setNoteFavorite(db, note, true);
    const starred = (await listFavorites(db)).notes[0];
    expect(starred.favoritedAt).not.toBeNull();
    expect(starred.updatedAt).toBe(starred.createdAt);

    await updateNote(db, note, { title: 'Speed!', style: 'plain' });
    expect((await listFavorites(db)).notes[0].title).toBe('Speed!'); // editing keeps the star

    await setNoteFavorite(db, note, false);
    expect((await listFavorites(db)).notes).toEqual([]);
  });

  it('leaves out folders and notes that were deleted', async () => {
    const folder = await createFolder(db, { parentId: null, name: 'Class 10' });
    const note = await createNote(db, folder, { title: 'Speed', style: 'plain' });
    await setFolderFavorite(db, folder, true);
    await setNoteFavorite(db, note, true);

    await deleteFolder(db, folder);

    expect(await listFavorites(db)).toEqual({ folders: [], notes: [] });
  });
});
