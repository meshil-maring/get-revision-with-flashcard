import type { SQLiteDatabase } from 'expo-sqlite';

import { getNotePage, listWrittenPages, saveNotePage } from '@/data/note-pages';
import { createNote, deleteNote } from '@/data/notes';
import { emptyInk, type Ink } from '@/lib/ink';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;
beforeEach(async () => {
  db = await createTestDb();
});

const written = (x: number): Ink => ({ ...emptyInk(), strokes: [{ c: '#1f2933', w: 5, p: [x, x, x + 10, x + 10] }] });

describe('handwriting pages for headings and questions', () => {
  it('keeps a separate page for each heading of each note', async () => {
    const a = await createNote(db, null, { title: 'Quadratics', style: 'plain', body: '## Intro' });
    const b = await createNote(db, null, { title: 'Circles', style: 'plain', body: '## Intro' });
    await saveNotePage(db, a, 'h:intro', 'Intro', [written(1)]);
    await saveNotePage(db, a, 'q:q1', 'Q1.', [written(2)]);
    await saveNotePage(db, b, 'h:intro', 'Intro', [written(3)]);

    expect(await getNotePage(db, a, 'h:intro')).toEqual([written(1)]);
    expect(await getNotePage(db, b, 'h:intro')).toEqual([written(3)]);
    expect(await getNotePage(db, a, 'h:other')).toBeNull();
    expect(await listWrittenPages(db, a)).toEqual(['h:intro', 'q:q1']);

    // Writing again replaces the page.
    await saveNotePage(db, a, 'h:intro', 'Intro', [written(9)]);
    expect(await getNotePage(db, a, 'h:intro')).toEqual([written(9)]);
  });

  it('forgets a page wiped clean, and never makes an empty one', async () => {
    const a = await createNote(db, null, { title: 'Quadratics', style: 'plain', body: '' });
    await saveNotePage(db, a, 'h:empty', 'Empty', [emptyInk()]);
    await saveNotePage(db, a, 'h:intro', 'Intro', [written(1)]);
    await saveNotePage(db, a, 'h:intro', 'Intro', [emptyInk()]);
    expect(await listWrittenPages(db, a)).toEqual([]);
    expect(await getNotePage(db, a, 'h:intro')).toBeNull();
    // And it comes back when written on again.
    await saveNotePage(db, a, 'h:intro', 'Intro', [written(4)]);
    expect(await listWrittenPages(db, a)).toEqual(['h:intro']);
  });

  it('deletes a note’s pages with it, and syncs them', async () => {
    const a = await createNote(db, null, { title: 'Quadratics', style: 'plain', body: '' });
    await saveNotePage(db, a, 'h:intro', 'Intro', [written(1)]);
    await deleteNote(db, a);
    expect(await listWrittenPages(db, a)).toEqual([]);
  });
});

describe('more than one page for a heading', () => {
  it('keeps every page, in order', async () => {
    const a = await createNote(db, null, { title: 'Quadratics', style: 'plain', body: '' });
    await saveNotePage(db, a, 'q:q1', 'Q1.', [written(1), emptyInk(), written(3)]);
    expect(await getNotePage(db, a, 'q:q1')).toEqual([written(1), emptyInk(), written(3)]);
    expect(await listWrittenPages(db, a)).toEqual(['q:q1']);
  });
});
