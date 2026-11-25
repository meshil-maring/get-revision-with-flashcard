import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { listAllFolders, pathFromFolders, toFolder } from './folders';
import type {
  AttachmentKind,
  CornellRow,
  Folder,
  FolderSearchResult,
  Note,
  NoteAttachment,
  NoteInput,
  NoteSearchResult,
  NoteSource,
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
    style: row.style === 'cornell' ? 'cornell' : 'plain',
    body: row.body,
    rows: parseRows(row.cornell_rows),
    summary: row.summary,
    createdBy: row.created_by ?? null,
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
    body: (input.body ?? '').trim(),
    rows: JSON.stringify(rows),
    summary: (input.summary ?? '').trim(),
  };
}

/** The notes directly in a folder (null = top level), oldest first. */
export async function listNotes(db: SQLiteDatabase, folderId: string | null): Promise<Note[]> {
  const rows = await db.getAllAsync<NoteRow>(
    'SELECT * FROM notes WHERE folder_id IS ? AND deleted_at IS NULL ORDER BY created_at ASC',
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
};

export async function listNoteAttachments(db: SQLiteDatabase, noteId: string): Promise<NoteAttachment[]> {
  const rows = await db.getAllAsync<NoteAttachmentRow>(
    'SELECT * FROM note_attachments WHERE note_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
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
  }));
}

export async function addNoteAttachment(
  db: SQLiteDatabase,
  noteId: string,
  input: { kind: AttachmentKind; uri: string; name: string; mimeType?: string | null },
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO note_attachments (id, note_id, kind, uri, name, mime_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    noteId,
    input.kind,
    input.uri,
    input.name,
    input.mimeType ?? null,
    new Date().toISOString(),
  );
  return id;
}

export async function deleteNoteAttachment(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE note_attachments SET deleted_at = ? WHERE id = ?', new Date().toISOString(), id);
}
