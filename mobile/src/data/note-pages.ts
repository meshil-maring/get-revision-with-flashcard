import type { SQLiteDatabase } from 'expo-sqlite';

import { parseSheets, serializeSheets, sheetsHaveInk, type Ink } from '@/lib/ink';

// Handwriting pages that belong to a heading or question of a note: tap "1 Learning
// objectives" in the textbook view and write about it on its own page. A page is found by its
// note and its key (lib/textbook.ts pageKey), so each heading and question has a different one.

const pageId = (noteId: string, page: string) => `${noteId}:${page}`;

/** The heading's pages (one or more), or null when nothing has been written for it yet. */
export async function getNotePage(db: SQLiteDatabase, noteId: string, page: string): Promise<Ink[] | null> {
  const row = await db.getFirstAsync<{ ink: string }>(
    'SELECT ink FROM note_pages WHERE id = ? AND deleted_at IS NULL',
    pageId(noteId, page),
  );
  return row ? parseSheets(row.ink) : null;
}

/** Keys of the note's pages that have writing on them. */
export async function listWrittenPages(db: SQLiteDatabase, noteId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ page: string }>(
    'SELECT page FROM note_pages WHERE note_id = ? AND deleted_at IS NULL ORDER BY created_at',
    noteId,
  );
  return rows.map((r) => r.page);
}

/**
 * Saves a heading's pages. When none has anything written on it, they are removed (so it no longer shows as written),
 * and one that never had anything isn't made at all.
 */
export async function saveNotePage(
  db: SQLiteDatabase,
  noteId: string,
  page: string,
  title: string,
  sheets: Ink[],
): Promise<void> {
  const ink = serializeSheets(sheets);
  const id = pageId(noteId, page);
  const now = new Date().toISOString();
  if (!sheetsHaveInk(sheets)) {
    await db.runAsync(
      'UPDATE note_pages SET ink = ?, deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      ink,
      now,
      now,
      id,
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO note_pages (id, note_id, page, title, ink, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, ink = excluded.ink,
       updated_at = excluded.updated_at, deleted_at = NULL`,
    id,
    noteId,
    page,
    title.trim(),
    ink,
    now,
    now,
  );
}
