import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { isTagColor, nextTagColor } from '@/lib/tags';

import { compareNames } from './folders';
import type { Tag, TagColor, TagWithCount } from './types';

type TagRow = {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: isTagColor(row.color) ? row.color : 'blue',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Thrown when another tag already has that name. */
export class TagNameTakenError extends Error {
  constructor(name: string) {
    super(`There is already a tag called "${name}".`);
    this.name = 'TagNameTakenError';
  }
}

/**
 * Deletes tags that were on notes but have none left (taken off, or their notes deleted).
 * A tag that was never on a note is kept: it may have just been made, or synced before its notes.
 */
export async function deleteUnusedTags(db: SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE tags SET deleted_at = ?, updated_at = ?
      WHERE deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = tags.id)
        AND NOT EXISTS (SELECT 1 FROM note_tags nt JOIN notes n ON n.id = nt.note_id
                         WHERE nt.tag_id = tags.id AND nt.deleted_at IS NULL AND n.deleted_at IS NULL)`,
    now,
    now,
  );
}

/** Every tag with how many notes have it, sorted by name. Tags with no notes left are deleted first. */
export async function listTags(db: SQLiteDatabase): Promise<TagWithCount[]> {
  await deleteUnusedTags(db);
  const rows = await db.getAllAsync<TagRow & { note_count: number }>(
    `SELECT t.*,
            (SELECT COUNT(*) FROM note_tags nt JOIN notes n ON n.id = nt.note_id
              WHERE nt.tag_id = t.id AND nt.deleted_at IS NULL AND n.deleted_at IS NULL) AS note_count
       FROM tags t
      WHERE t.deleted_at IS NULL`,
  );
  return rows
    .map((row) => ({ ...toTag(row), noteCount: row.note_count }))
    .sort((a, b) => compareNames(a.name, b.name));
}

export async function getTag(db: SQLiteDatabase, id: string): Promise<Tag | null> {
  const row = await db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE id = ? AND deleted_at IS NULL', id);
  return row ? toTag(row) : null;
}

/** The tag with this name, ignoring case and spaces at the ends. */
export async function findTagByName(db: SQLiteDatabase, name: string): Promise<Tag | null> {
  const row = await db.getFirstAsync<TagRow>(
    `SELECT * FROM tags WHERE deleted_at IS NULL AND lower(trim(name)) = lower(?)
      ORDER BY created_at ASC, id ASC LIMIT 1`,
    name.trim(),
  );
  return row ? toTag(row) : null;
}

/** Makes a tag. Without a colour, it gets the next one in the palette. Names must be different. */
export async function createTag(db: SQLiteDatabase, input: { name: string; color?: TagColor }): Promise<string> {
  if (await findTagByName(db, input.name)) throw new TagNameTakenError(input.name.trim());
  let color = input.color;
  if (!color) {
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tags WHERE deleted_at IS NULL');
    color = nextTagColor(row?.n ?? 0);
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    id,
    input.name.trim(),
    color,
    now,
    now,
  );
  return id;
}

/** The tag with this name, made if it doesn't exist yet (for AI apps tagging notes through MCP). */
export async function ensureTag(db: SQLiteDatabase, name: string): Promise<string> {
  const existing = await findTagByName(db, name);
  return existing ? existing.id : createTag(db, { name });
}

export async function updateTag(db: SQLiteDatabase, id: string, input: { name: string; color: TagColor }): Promise<void> {
  const existing = await findTagByName(db, input.name);
  if (existing && existing.id !== id) throw new TagNameTakenError(input.name.trim());
  await db.runAsync(
    'UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?',
    input.name.trim(),
    input.color,
    new Date().toISOString(),
    id,
  );
}

/** Deletes a tag and takes it off every note. The notes themselves are kept. */
export async function deleteTag(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE note_tags SET deleted_at = ? WHERE tag_id = ? AND deleted_at IS NULL', now, id);
    await db.runAsync('UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
  });
}

/** Tags whose name contains the query (any case). */
export async function searchTags(db: SQLiteDatabase, query: string): Promise<TagWithCount[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return (await listTags(db)).filter((t) => t.name.toLowerCase().includes(q));
}

/** The tags on each of the given notes, sorted by name. */
export async function listTagsForNotes(db: SQLiteDatabase, noteIds: string[]): Promise<Map<string, Tag[]>> {
  const byNote = new Map<string, Tag[]>();
  if (noteIds.length === 0) return byNote;
  const placeholders = noteIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<TagRow & { note_id: string }>(
    `SELECT t.*, nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id IN (${placeholders}) AND nt.deleted_at IS NULL AND t.deleted_at IS NULL`,
    ...noteIds,
  );
  for (const row of rows) {
    const list = byNote.get(row.note_id) ?? [];
    list.push(toTag(row));
    byNote.set(row.note_id, list);
  }
  for (const list of byNote.values()) list.sort((a, b) => compareNames(a.name, b.name));
  return byNote;
}

/** Makes these the note's tags: adds the new ones and takes off the rest. */
export async function setNoteTags(db: SQLiteDatabase, noteId: string, tagIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  const wanted = [...new Set(tagIds)];
  await db.withTransactionAsync(async () => {
    const placeholders = wanted.map(() => '?').join(', ');
    await db.runAsync(
      `UPDATE note_tags SET deleted_at = ?
        WHERE note_id = ? AND deleted_at IS NULL ${wanted.length > 0 ? `AND tag_id NOT IN (${placeholders})` : ''}`,
      now,
      noteId,
      ...wanted,
    );
    for (const tagId of wanted) {
      await db.runAsync(
        `INSERT INTO note_tags (note_id, tag_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT (note_id, tag_id) DO UPDATE SET deleted_at = NULL
          WHERE note_tags.deleted_at IS NOT NULL`,
        noteId,
        tagId,
        now,
      );
    }
  });
}
