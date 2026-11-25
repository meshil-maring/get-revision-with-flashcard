import type { SQLiteDatabase } from 'expo-sqlite';

import {
  countFolderContents,
  createFolder,
  deleteFolder,
  getFolder,
  getFolderPath,
  listFolders,
  renameFolder,
} from '@/data/folders';
import {
  addNoteAttachment,
  createNote,
  deleteNote,
  deleteNoteAttachment,
  getNote,
  listNoteAttachments,
  listNotes,
  searchNotes,
  updateNote,
} from '@/data/notes';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;

beforeEach(async () => {
  db = await createTestDb();
});

/** Class 10 › Physics › Chapter 1 › Motion */
async function makeTree() {
  const classId = await createFolder(db, { parentId: null, name: 'Class 10' });
  const subject = await createFolder(db, { parentId: classId, name: 'Physics' });
  const chapter = await createFolder(db, { parentId: subject, name: 'Chapter 1' });
  const topic = await createFolder(db, { parentId: chapter, name: 'Motion' });
  return { classId, subject, chapter, topic };
}

describe('folders', () => {
  it('nests folders to any depth and lists only the direct children', async () => {
    const { classId, subject, chapter, topic } = await makeTree();

    expect((await listFolders(db, null)).map((f) => f.name)).toEqual(['Class 10']);
    expect((await listFolders(db, classId)).map((f) => f.name)).toEqual(['Physics']);
    expect((await listFolders(db, chapter)).map((f) => f.id)).toEqual([topic]);
    expect((await getFolder(db, topic))?.parentId).toBe(chapter);
    expect(subject).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sorts folders by number, so Class 2 comes before Class 10', async () => {
    for (const name of ['Class 10', 'Class 2', 'class 1']) await createFolder(db, { parentId: null, name });
    expect((await listFolders(db, null)).map((f) => f.name)).toEqual(['class 1', 'Class 2', 'Class 10']);
  });

  it('counts the folders and notes directly inside each folder', async () => {
    const { classId, subject } = await makeTree();
    await createFolder(db, { parentId: classId, name: 'Maths' });
    await createNote(db, classId, { title: 'Timetable', style: 'plain' });

    const [classFolder] = await listFolders(db, null);
    expect(classFolder).toMatchObject({ folderCount: 2, noteCount: 1 });
    expect((await listFolders(db, classId)).find((f) => f.id === subject)).toMatchObject({ folderCount: 1, noteCount: 0 });
  });

  it('gives the path from the top level down', async () => {
    const { topic } = await makeTree();
    expect((await getFolderPath(db, topic)).map((p) => p.name)).toEqual(['Class 10', 'Physics', 'Chapter 1', 'Motion']);
    expect(await getFolderPath(db, null)).toEqual([]);
  });

  it('renames a folder (trimmed)', async () => {
    const id = await createFolder(db, { parentId: null, name: 'Clas 10' });
    await renameFolder(db, id, '  Class 10 ');
    expect((await getFolder(db, id))?.name).toBe('Class 10');
  });

  it('deletes a folder with everything inside it, at any depth', async () => {
    const { classId, subject, topic } = await makeTree();
    const other = await createFolder(db, { parentId: null, name: 'Class 11' });
    const deepNote = await createNote(db, topic, { title: 'Speed', style: 'plain' });
    const subjectNote = await createNote(db, subject, { title: 'Units', style: 'plain' });
    const keptNote = await createNote(db, other, { title: 'Kept', style: 'plain' });

    expect(await countFolderContents(db, classId)).toEqual({ folders: 3, notes: 2 });

    await deleteFolder(db, classId);

    expect((await listFolders(db, null)).map((f) => f.id)).toEqual([other]);
    expect(await getFolder(db, topic)).toBeNull();
    expect(await getNote(db, deepNote)).toBeNull();
    expect(await getNote(db, subjectNote)).toBeNull();
    expect(await getNote(db, keptNote)).not.toBeNull();
    // Rows are kept for syncing later, but marked deleted.
    const row = await db.getFirstAsync<{ deleted_at: string | null }>('SELECT deleted_at FROM folders WHERE id = ?', topic);
    expect(row?.deleted_at).not.toBeNull();
  });
});

describe('notes', () => {
  it('creates plain notes in a folder or at the top level', async () => {
    const { topic } = await makeTree();
    const inTopic = await createNote(db, topic, { title: '  Speed ', style: 'plain', body: ' Speed: distance ÷ time ' });
    const top = await createNote(db, null, { title: 'Ideas', style: 'plain' });

    expect(await getNote(db, inTopic)).toMatchObject({
      folderId: topic,
      title: 'Speed',
      style: 'plain',
      body: 'Speed: distance ÷ time',
      rows: [],
    });
    expect((await listNotes(db, null)).map((n) => n.id)).toEqual([top]);
    expect((await listNotes(db, topic)).map((n) => n.id)).toEqual([inTopic]);
  });

  it('keeps Cornell rows and summary, dropping empty rows', async () => {
    const id = await createNote(db, null, {
      title: 'Inertia',
      style: 'cornell',
      rows: [
        { cue: 'What is inertia?', notes: 'Objects keep doing what they are doing.' },
        { cue: ' ', notes: '' },
      ],
      summary: 'Newton 1',
    });
    expect(await getNote(db, id)).toMatchObject({
      style: 'cornell',
      rows: [{ cue: 'What is inertia?', notes: 'Objects keep doing what they are doing.' }],
      summary: 'Newton 1',
    });
  });

  it('updates and deletes a note', async () => {
    const id = await createNote(db, null, { title: 'Draft', style: 'plain' });
    await updateNote(db, id, { title: 'Final', style: 'cornell', rows: [{ cue: 'Q', notes: 'A' }] });
    expect(await getNote(db, id)).toMatchObject({ title: 'Final', style: 'cornell', rows: [{ cue: 'Q', notes: 'A' }] });

    await deleteNote(db, id);
    expect(await getNote(db, id)).toBeNull();
    expect(await listNotes(db, null)).toEqual([]);
  });

  it('adds and removes attachments', async () => {
    const id = await createNote(db, null, { title: 'Diagram', style: 'plain' });
    const a = await addNoteAttachment(db, id, { kind: 'image', uri: 'file:///a.jpg', name: 'a.jpg' });
    await addNoteAttachment(db, id, { kind: 'pdf', uri: 'file:///b.pdf', name: 'b.pdf', mimeType: 'application/pdf' });

    expect((await listNoteAttachments(db, id)).map((x) => x.kind)).toEqual(['image', 'pdf']);
    await deleteNoteAttachment(db, a);
    expect((await listNoteAttachments(db, id)).map((x) => x.name)).toEqual(['b.pdf']);
  });
});

describe('searchNotes', () => {
  it('finds notes by title or text, any case, with where they are', async () => {
    const { topic } = await makeTree();
    await createNote(db, topic, { title: 'Speed', style: 'plain', body: 'Velocity has a direction.' });
    await createNote(db, null, {
      title: 'Forces',
      style: 'cornell',
      rows: [{ cue: 'Inertia', notes: 'Linked to VELOCITY changes' }],
    });
    await createNote(db, null, { title: 'Cells', style: 'plain', body: 'Mitosis' });

    const { notes } = await searchNotes(db, 'velocity');

    expect(notes.map((n) => n.title).sort()).toEqual(['Forces', 'Speed']);
    expect(notes.find((n) => n.title === 'Speed')?.path.map((p) => p.name)).toEqual([
      'Class 10',
      'Physics',
      'Chapter 1',
      'Motion',
    ]);
  });

  it('finds folders by name', async () => {
    await makeTree();
    const { folders } = await searchNotes(db, 'phys');
    expect(folders.map((f) => [f.name, f.path.map((p) => p.name)])).toEqual([['Physics', ['Class 10']]]);
  });

  it('does not match the hidden field names of Cornell notes, or treat % as a wildcard', async () => {
    await createNote(db, null, { title: 'A', style: 'cornell', rows: [{ cue: 'x', notes: 'y' }] });
    await createNote(db, null, { title: 'B', style: 'plain', body: '50% off' });

    expect((await searchNotes(db, 'cue')).notes).toEqual([]);
    expect((await searchNotes(db, '%')).notes.map((n) => n.title)).toEqual(['B']);
    expect(await searchNotes(db, '   ')).toEqual({ folders: [], notes: [] });
  });

  it('leaves out notes in deleted folders', async () => {
    const { classId, topic } = await makeTree();
    await createNote(db, topic, { title: 'Speed', style: 'plain' });
    await deleteFolder(db, classId);
    expect(await searchNotes(db, 'speed')).toEqual({ folders: [], notes: [] });
  });
});
