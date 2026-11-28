import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { compareNames, getFolderPath, listAllFolders, pathFromFolders, toFolder } from './folders';
import { getSetting, setSetting, SETTINGS } from './settings';
import type {
  AttachmentKind,
  CornellRow,
  FavoriteFolder,
  Folder,
  FolderSearchResult,
  Note,
  NoteAttachment,
  NoteInput,
  NoteSearchResult,
  NoteSource,
  NoteWithPath,
} from './types';

type NoteRow = {
  id: string;
  folder_id: string | null;
  title: string;
  style: string;
  body: string;
  cornell_rows: string;
  summary: string;
  created_by: string | null;
  favorited_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function parseRows(json: string): CornellRow[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.map((row) => ({
      cue: typeof row?.cue === 'string' ? row.cue : '',
      notes: typeof row?.notes === 'string' ? row.notes : '',
    }));
  } catch {
    return [];
  }
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    style: row.style === 'cornell' || row.style === 'handwritten' ? row.style : 'plain',
    body: row.body,
    rows: parseRows(row.cornell_rows),
    summary: row.summary,
    createdBy: row.created_by ?? null,
    favoritedAt: row.favorited_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Trims the text and drops Cornell rows that are completely empty. */
function cleanInput(input: NoteInput) {
  const rows = (input.rows ?? [])
    .map((r) => ({ cue: r.cue.trim(), notes: r.notes.trim() }))
    .filter((r) => r.cue || r.notes);
  return {
    title: input.title.trim(),
    style: input.style,
    // A drawing is saved exactly as it is.
    body: input.style === 'handwritten' ? (input.body ?? '') : (input.body ?? '').trim(),
    rows: JSON.stringify(rows),
    summary: (input.summary ?? '').trim(),
  };
}

/** The notes directly in a folder (null = top level), oldest first, with "Good to know" always last. */
export async function listNotes(db: SQLiteDatabase, folderId: string | null): Promise<Note[]> {
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT * FROM notes WHERE folder_id IS ? AND deleted_at IS NULL
      ORDER BY lower(trim(title)) = 'good to know', created_at ASC`,
    folderId,
  );
  return rows.map(toNote);
}

export async function getNote(db: SQLiteDatabase, id: string): Promise<Note | null> {
  const row = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL', id);
  return row ? toNote(row) : null;
}

/** Creates a note. Pass `createdBy` (e.g. 'Claude') when an AI app writes it. */
export async function createNote(
  db: SQLiteDatabase,
  folderId: string | null,
  input: NoteInput & NoteSource,
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const note = cleanInput(input);
  await db.runAsync(
    `INSERT INTO notes (id, folder_id, title, style, body, cornell_rows, summary, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    folderId,
    note.title,
    note.style,
    note.body,
    note.rows,
    note.summary,
    input.createdBy?.trim() || null,
    now,
    now,
  );
  return id;
}

export async function updateNote(db: SQLiteDatabase, id: string, input: NoteInput): Promise<void> {
  const note = cleanInput(input);
  await db.runAsync(
    `UPDATE notes SET title = ?, style = ?, body = ?, cornell_rows = ?, summary = ?, updated_at = ?
      WHERE id = ?`,
    note.title,
    note.style,
    note.body,
    note.rows,
    note.summary,
    new Date().toISOString(),
    id,
  );
}

/** Stars a note (or not). Doesn't change updated_at, like favourite cards. */
export async function setNoteFavorite(db: SQLiteDatabase, id: string, favorite: boolean): Promise<void> {
  await db.runAsync(
    'UPDATE notes SET favorited_at = ? WHERE id = ?',
    favorite ? new Date().toISOString() : null,
    id,
  );
}

/** Favourite folders and notes, newest favourite first, with where each one is. */
export async function listFavorites(
  db: SQLiteDatabase,
): Promise<{ folders: FavoriteFolder[]; notes: NoteWithPath[] }> {
  const [folderRows, noteRows, allFolders] = await Promise.all([
    db.getAllAsync<Parameters<typeof toFolder>[0] & { folder_count: number; note_count: number }>(
      `SELECT f.*,
              (SELECT COUNT(*) FROM folders c WHERE c.parent_id = f.id AND c.deleted_at IS NULL) AS folder_count,
              (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id AND n.deleted_at IS NULL) AS note_count
         FROM folders f
        WHERE f.favorited_at IS NOT NULL AND f.deleted_at IS NULL
        ORDER BY f.favorited_at DESC`,
    ),
    db.getAllAsync<NoteRow>(
      'SELECT * FROM notes WHERE favorited_at IS NOT NULL AND deleted_at IS NULL ORDER BY favorited_at DESC',
    ),
    listAllFolders(db),
  ]);
  const byId = new Map<string, Folder>(allFolders.map((f) => [f.id, f]));
  return {
    folders: folderRows.map((row) => ({
      ...toFolder(row),
      folderCount: row.folder_count,
      noteCount: row.note_count,
      path: pathFromFolders(byId, row.parent_id),
    })),
    notes: noteRows.map(toNote).map((n) => ({ ...n, path: pathFromFolders(byId, n.folderId) })),
  };
}

/** Notes with this tag, from every folder, with where each one is. Sorted by title. */
export async function listNotesWithTag(db: SQLiteDatabase, tagId: string): Promise<NoteWithPath[]> {
  const [rows, allFolders] = await Promise.all([
    db.getAllAsync<NoteRow>(
      `SELECT n.* FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id AND nt.deleted_at IS NULL
        WHERE nt.tag_id = ? AND n.deleted_at IS NULL`,
      tagId,
    ),
    listAllFolders(db),
  ]);
  const byId = new Map<string, Folder>(allFolders.map((f) => [f.id, f]));
  return rows
    .map(toNote)
    .map((n) => ({ ...n, path: pathFromFolders(byId, n.folderId) }))
    .sort((a, b) => compareNames(a.title, b.title));
}

/** Moves notes into another folder (null = top level). */
export async function moveNotes(db: SQLiteDatabase, ids: string[], folderId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync('UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ?', folderId, now, id);
    }
  });
}

export async function deleteNote(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

// --- Search ----------------------------------------------------------------------

/** Escapes % and _ so they are matched as themselves in a LIKE pattern. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Notes and folders whose text contains the query (any case), with the folders they are in. */
export async function searchNotes(
  db: SQLiteDatabase,
  query: string,
): Promise<{ folders: FolderSearchResult[]; notes: NoteSearchResult[] }> {
  const q = query.trim();
  if (!q) return { folders: [], notes: [] };
  const pattern = likePattern(q);

  const [noteRows, folderRows, allFolders] = await Promise.all([
    db.getAllAsync<NoteRow>(
      `SELECT * FROM notes
        WHERE deleted_at IS NULL
          AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\'
               OR cornell_rows LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')
        ORDER BY updated_at DESC
        LIMIT 50`,
      pattern,
      pattern,
      pattern,
      pattern,
    ),
    db.getAllAsync<Parameters<typeof toFolder>[0]>(
      `SELECT * FROM folders WHERE deleted_at IS NULL AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 20`,
      pattern,
    ),
    listAllFolders(db),
  ]);

  const byId = new Map<string, Folder>(allFolders.map((f) => [f.id, f]));
  return {
    folders: folderRows.map(toFolder).map((f) => ({ ...f, path: pathFromFolders(byId, f.parentId) })),
    notes: noteRows
      .map(toNote)
      // The JSON column can match on its keys ("cue", "notes"); only keep real matches.
      .filter((n) => noteText(n).toLowerCase().includes(q.toLowerCase()))
      .map((n) => ({ ...n, path: pathFromFolders(byId, n.folderId) })),
  };
}

/** All the words in a note, as one string (for search and previews). */
export function noteText(note: Pick<Note, 'title' | 'style' | 'body' | 'rows' | 'summary'>): string {
  if (note.style === 'handwritten') return note.title; // the drawing has no words to find
  if (note.style === 'cornell') {
    return [note.title, ...note.rows.flatMap((r) => [r.cue, r.notes]), note.summary].join('\n');
  }
  return [note.title, note.body].join('\n');
}

// --- Attachments ---------------------------------------------------------------------

type NoteAttachmentRow = {
  id: string;
  note_id: string;
  kind: string;
  uri: string;
  name: string;
  mime_type: string | null;
  created_at: string;
  caption: string | null;
  alt_text: string | null;
  position: number | null;
  remote_key: string | null;
};

/**
 * A note's attachments in order. Includes ones still downloading from the account
 * (uri '', e.g. an image an AI app just added), so the note can show them as loading.
 */
export async function listNoteAttachments(db: SQLiteDatabase, noteId: string): Promise<NoteAttachment[]> {
  const rows = await db.getAllAsync<NoteAttachmentRow>(
    `SELECT * FROM note_attachments
      WHERE note_id = ? AND deleted_at IS NULL AND (uri != '' OR remote_key IS NOT NULL)
      ORDER BY position ASC, created_at ASC`,
    noteId,
  );
  return rows.map((row) => ({
    id: row.id,
    noteId: row.note_id,
    kind: row.kind as AttachmentKind,
    uri: row.uri,
    name: row.name,
    mimeType: row.mime_type,
    createdAt: row.created_at,
    caption: row.caption || null,
    altText: row.alt_text || null,
    position: row.position ?? 0,
    remoteKey: row.remote_key,
  }));
}

export async function addNoteAttachment(
  db: SQLiteDatabase,
  noteId: string,
  input: { kind: AttachmentKind; uri: string; name: string; mimeType?: string | null },
): Promise<string> {
  const id = randomUUID();
  // After the note's other attachments (including ones an AI app added).
  await db.runAsync(
    `INSERT INTO note_attachments (id, note_id, kind, uri, name, mime_type, created_at, position)
     VALUES (?, ?, ?, ?, ?, ?, ?,
       (SELECT COALESCE(MAX(position), -1) + 1 FROM note_attachments WHERE note_id = ? AND deleted_at IS NULL))`,
    id,
    noteId,
    input.kind,
    input.uri,
    input.name,
    input.mimeType ?? null,
    new Date().toISOString(),
    noteId,
  );
  return id;
}

export async function deleteNoteAttachment(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE note_attachments SET deleted_at = ? WHERE id = ?', new Date().toISOString(), id);
}

/** Remembers this note as the last one read, for "Continue Studying" on Home. */
export async function markNoteRead(db: SQLiteDatabase, id: string): Promise<void> {
  await setSetting(db, SETTINGS.lastReadNote, JSON.stringify({ id, at: new Date().toISOString() }));
}

/** The note read most recently, when it was read and where it is (null if none, or it was deleted). */
export type LastReadNote = { note: Note; readAt: string; folder: string };

export async function getLastReadNote(db: SQLiteDatabase): Promise<LastReadNote | null> {
  const saved = await getSetting(db, SETTINGS.lastReadNote);
  if (!saved) return null;
  let last: { id?: unknown; at?: unknown };
  try {
    last = JSON.parse(saved);
  } catch {
    return null;
  }
  if (typeof last.id !== 'string' || typeof last.at !== 'string') return null;
  const note = await getNote(db, last.id);
  if (!note) return null;
  const path = await getFolderPath(db, note.folderId);
  return { note, readAt: last.at, folder: path.map((p) => p.name).join(' / ') };
}
