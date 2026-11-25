import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Folder, FolderCrumb, FolderWithCounts } from './types';

type FolderRow = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Sorts names the way people number things: "Class 2" before "Class 10". */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** The folders directly inside a folder (null = top level), sorted by name. */
export async function listFolders(db: SQLiteDatabase, parentId: string | null): Promise<FolderWithCounts[]> {
  const rows = await db.getAllAsync<FolderRow & { folder_count: number; note_count: number }>(
    `SELECT f.*,
            (SELECT COUNT(*) FROM folders c WHERE c.parent_id = f.id AND c.deleted_at IS NULL) AS folder_count,
            (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id AND n.deleted_at IS NULL) AS note_count
       FROM folders f
      WHERE f.parent_id IS ? AND f.deleted_at IS NULL`,
    parentId,
  );
  return rows
    .map((row) => ({ ...toFolder(row), folderCount: row.folder_count, noteCount: row.note_count }))
    .sort((a, b) => compareNames(a.name, b.name));
}

export async function getFolder(db: SQLiteDatabase, id: string): Promise<Folder | null> {
  const row = await db.getFirstAsync<FolderRow>('SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL', id);
  return row ? toFolder(row) : null;
}

/** The folder and the folders it is in, top level first: [Class 10, Physics, Chapter 1]. */
export async function getFolderPath(db: SQLiteDatabase, id: string | null): Promise<FolderCrumb[]> {
  if (!id) return [];
  return db.getAllAsync<FolderCrumb>(
    `WITH RECURSIVE path(id, parent_id, name, depth) AS (
       SELECT id, parent_id, name, 0 FROM folders WHERE id = ?
       UNION ALL
       SELECT f.id, f.parent_id, f.name, path.depth + 1 FROM folders f JOIN path ON f.id = path.parent_id
     )
     SELECT id, name FROM path ORDER BY depth DESC`,
    id,
  );
}

/** Every folder, for working out paths without one query per folder. */
export async function listAllFolders(db: SQLiteDatabase): Promise<Folder[]> {
  const rows = await db.getAllAsync<FolderRow>('SELECT * FROM folders WHERE deleted_at IS NULL');
  return rows.map(toFolder);
}

/** The path to a folder, worked out from a list of every folder. */
export function pathFromFolders(byId: Map<string, Folder>, id: string | null): FolderCrumb[] {
  const path: FolderCrumb[] = [];
  const seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift({ id: current.id, name: current.name });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export async function createFolder(
  db: SQLiteDatabase,
  input: { parentId: string | null; name: string },
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO folders (id, parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    id,
    input.parentId,
    input.name.trim(),
    now,
    now,
  );
  return id;
}

export async function renameFolder(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  await db.runAsync(
    'UPDATE folders SET name = ?, updated_at = ? WHERE id = ?',
    name.trim(),
    new Date().toISOString(),
    id,
  );
}

// The folder and every folder inside it, at any depth.
const SUBTREE = `WITH RECURSIVE subtree(id) AS (
  SELECT ?
  UNION ALL
  SELECT f.id FROM folders f JOIN subtree ON f.parent_id = subtree.id WHERE f.deleted_at IS NULL
)`;

/** How many folders and notes are inside a folder, at any depth (for the delete warning). */
export async function countFolderContents(
  db: SQLiteDatabase,
  id: string,
): Promise<{ folders: number; notes: number }> {
  const row = await db.getFirstAsync<{ folders: number; notes: number }>(
    `${SUBTREE}
     SELECT (SELECT COUNT(*) FROM subtree) - 1 AS folders,
            (SELECT COUNT(*) FROM notes WHERE folder_id IN (SELECT id FROM subtree) AND deleted_at IS NULL) AS notes`,
    id,
  );
  return { folders: row?.folders ?? 0, notes: row?.notes ?? 0 };
}

/** Soft-deletes the folder and everything inside it: its folders, at any depth, and their notes. */
export async function deleteFolder(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `${SUBTREE}
       UPDATE notes SET deleted_at = ?, updated_at = ?
        WHERE folder_id IN (SELECT id FROM subtree) AND deleted_at IS NULL`,
      id,
      now,
      now,
    );
    await db.runAsync(
      `${SUBTREE}
       UPDATE folders SET deleted_at = ?, updated_at = ?
        WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL`,
      id,
      now,
      now,
    );
  });
}
