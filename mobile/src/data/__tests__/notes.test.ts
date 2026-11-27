import type { SQLiteDatabase } from 'expo-sqlite';

import {
  countFolderContents,
  createFolder,
  deleteFolder,
  ensureFolderPath,
  FolderMoveError,
  FolderNameTakenError,
  getFolder,
  getFolderPath,
  listFolders,
  moveFolders,
  renameFolder,
} from '@/data/folders';
import {
  addNoteAttachment,
  createNote,
  deleteNote,
  deleteNoteAttachment,
  getLastReadNote,
  getNote,
  listNoteAttachments,
  listNotes,
  markNoteRead,
  moveNotes,
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

  it('does not allow two folders with the same name in one place', async () => {
    const { classId } = await makeTree();
    await expect(createFolder(db, { parentId: classId, name: ' PHYSICS ' })).rejects.toBeInstanceOf(FolderNameTakenError);
    // Same name somewhere else is fine.
    await expect(createFolder(db, { parentId: null, name: 'Physics' })).resolves.toMatch(/^[0-9a-f-]{36}$/);

    const maths = await createFolder(db, { parentId: classId, name: 'Maths' });
    await expect(renameFolder(db, maths, 'physics')).rejects.toBeInstanceOf(FolderNameTakenError);
    await renameFolder(db, maths, 'MATHS'); // changing only the case of its own name is fine
    expect((await getFolder(db, maths))?.name).toBe('MATHS');
  });

  it('frees a name again once that folder is deleted', async () => {
    const id = await createFolder(db, { parentId: null, name: 'Class 10' });
    await deleteFolder(db, id);
    await expect(createFolder(db, { parentId: null, name: 'Class 10' })).resolves.toBeTruthy();
  });

  it('finds or makes the folders on a path of names', async () => {
    const { classId, subject, chapter } = await makeTree();

    // Existing folders are reused (any case); missing ones are made.
    const topic = await ensureFolderPath(db, ['class 10', ' Physics', 'CHAPTER 1', 'Forces']);
    expect(await getFolderPath(db, topic)).toEqual([
      { id: classId, name: 'Class 10' },
      { id: subject, name: 'Physics' },
      { id: chapter, name: 'Chapter 1' },
      { id: topic, name: 'Forces' },
    ]);
    // Running it again makes nothing new.
    expect(await ensureFolderPath(db, ['Class 10', 'Physics', 'Chapter 1', 'Forces'])).toBe(topic);
    expect(await listFolders(db, chapter)).toHaveLength(2); // Motion and Forces

    expect(await ensureFolderPath(db, [])).toBeNull();
    expect(await ensureFolderPath(db, ['', '  '])).toBeNull();
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

  it('lists the "Good to know" note last, even when it was made before other notes', async () => {
    const a = await createNote(db, null, { title: 'Topic A', style: 'plain' });
    const summary = await createNote(db, null, { title: ' good to know ', style: 'plain' });
    const b = await createNote(db, null, { title: 'Topic B', style: 'plain' });

    expect((await listNotes(db, null)).map((n) => n.id)).toEqual([a, b, summary]);
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

  it('remembers which AI app wrote a note, and keeps it when the user edits it', async () => {
    const byAi = await createNote(db, null, { title: 'Summary', style: 'plain', createdBy: ' Claude ' });
    const byUser = await createNote(db, null, { title: 'Mine', style: 'plain' });

    expect((await getNote(db, byAi))?.createdBy).toBe('Claude');
    expect((await getNote(db, byUser))?.createdBy).toBeNull();

    await updateNote(db, byAi, { title: 'Summary (edited)', style: 'plain' });
    expect((await getNote(db, byAi))?.createdBy).toBe('Claude');
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

  it('keeps attachments in order, new ones after those an AI app added', async () => {
    const id = await createNote(db, null, { title: 'Intersections', style: 'plain' });
    // As a sync saves an image an AI app attached: second place, not downloaded yet.
    await db.runAsync(
      `INSERT INTO note_attachments (id, note_id, kind, uri, name, mime_type, created_at, remote_key, caption, alt_text, position)
       VALUES ('ai-1', ?, 'image', '', 'crossroads.png', 'image/png', '2026-01-01T00:00:00.000Z', 'u/user-1/ai-1', 'Figure 1', 'Two roads crossing', 1)`,
      id,
    );
    await db.runAsync(
      `INSERT INTO note_attachments (id, note_id, kind, uri, name, created_at, position)
       VALUES ('first', ?, 'image', 'file:///first.jpg', 'first.jpg', '2026-06-01T00:00:00.000Z', 0)`,
      id,
    );
    await addNoteAttachment(db, id, { kind: 'image', uri: 'file:///mine.jpg', name: 'mine.jpg' });

    const list = await listNoteAttachments(db, id);
    expect(list.map((x) => [x.name, x.position])).toEqual([
      ['first.jpg', 0],
      ['crossroads.png', 1],
      ['mine.jpg', 2],
    ]);
    expect(list[1]).toMatchObject({ uri: '', caption: 'Figure 1', altText: 'Two roads crossing', remoteKey: 'u/user-1/ai-1' });
    expect(list[2]).toMatchObject({ caption: null, altText: null, remoteKey: null });
  });

  it('leaves out files that are neither on this device nor in the account', async () => {
    const id = await createNote(db, null, { title: 'Broken', style: 'plain' });
    await db.runAsync(
      `INSERT INTO note_attachments (id, note_id, kind, uri, name, created_at) VALUES ('x', ?, 'image', '', 'lost.png', '2026-01-01T00:00:00.000Z')`,
      id,
    );
    expect(await listNoteAttachments(db, id)).toEqual([]);
  });
});

describe('last read note', () => {
  it('remembers the note read last, with its folder, and forgets it once deleted', async () => {
    expect(await getLastReadNote(db)).toBeNull();
    const classId = await createFolder(db, { parentId: null, name: 'Class 10' });
    const biology = await createFolder(db, { parentId: classId, name: 'Biology' });
    const cells = await createNote(db, biology, { title: 'Cells', style: 'plain' });
    const top = await createNote(db, null, { title: 'Top', style: 'plain' });

    await markNoteRead(db, top);
    await markNoteRead(db, cells);
    const last = await getLastReadNote(db);
    expect(last).toMatchObject({ note: { id: cells, title: 'Cells' }, folder: 'Class 10 / Biology' });
    expect(Date.parse(last!.readAt)).not.toBeNaN();

    await deleteNote(db, cells);
    expect(await getLastReadNote(db)).toBeNull();
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

describe('moving', () => {
  it('moves notes into another folder and to the top level', async () => {
    const { subject, chapter } = await makeTree();
    const a = await createNote(db, chapter, { title: 'Speed', style: 'plain' });
    const b = await createNote(db, chapter, { title: 'Velocity', style: 'plain' });

    await moveNotes(db, [a, b], subject);
    expect((await listNotes(db, subject)).map((n) => n.title)).toEqual(['Speed', 'Velocity']);
    expect(await listNotes(db, chapter)).toEqual([]);

    await moveNotes(db, [a], null);
    expect((await listNotes(db, null)).map((n) => n.title)).toEqual(['Speed']);
  });

  it('moves folders with everything inside them', async () => {
    const { classId, chapter, topic } = await makeTree();
    await createNote(db, topic, { title: 'Speed', style: 'plain' });

    await moveFolders(db, [chapter], classId);

    expect(await getFolderPath(db, topic)).toEqual([
      { id: classId, name: 'Class 10' },
      { id: chapter, name: 'Chapter 1' },
      { id: topic, name: 'Motion' },
    ]);
    expect(await countFolderContents(db, chapter)).toEqual({ folders: 1, notes: 1 });
  });

  it("won't move a folder into itself or a folder inside it", async () => {
    const { subject, topic } = await makeTree();
    await expect(moveFolders(db, [subject], subject)).rejects.toThrow(FolderMoveError);
    await expect(moveFolders(db, [subject], topic)).rejects.toThrow(FolderMoveError);
    expect((await getFolder(db, subject))?.parentId).not.toBe(topic);
  });

  it('keeps names different in the new place, and moves nothing if one clashes', async () => {
    const { classId, subject } = await makeTree();
    const other = await createFolder(db, { parentId: null, name: 'Class 9' });
    const physics9 = await createFolder(db, { parentId: other, name: 'physics' });
    const maths9 = await createFolder(db, { parentId: other, name: 'Maths' });

    await expect(moveFolders(db, [maths9, physics9], classId)).rejects.toThrow(FolderNameTakenError);
    expect((await listFolders(db, classId)).map((f) => f.id)).toEqual([subject]);
  });
});
