import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import type { Db } from '../db/client.ts';
import { lockUser, writeChanges, type Change, type SyncedTable } from '../sync/sync.ts';

// Reads and writes a user's decks, cards, folders, notes and tags for the MCP tools.
//
// The server keeps each record as the app's own SQLite row (snake_case columns) in
// synced_rows, so rows written here must look exactly like the ones the app writes
// (see mobile/src/data/db.ts). The next sync carries them to the user's devices.

type Row = Record<string, unknown> & { id: string };

export type DeckRow = Row & { name: string; description: string; created_at: string; updated_at: string };
export type CardRow = Row & { deck_id: string; front: string; back: string; created_at: string };
export type FolderRow = Row & { parent_id: string | null; name: string };
export type NoteRow = Row & {
  folder_id: string | null;
  title: string;
  style: 'plain' | 'cornell';
  body: string;
  cornell_rows: string;
  summary: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type TagRow = Row & { name: string; color: string };
type NoteTagRow = { note_id: string; tag_id: string; deleted_at: string | null };

/** Same order as the app's tag colours (mobile/src/lib/tags.ts), so new tags look different. */
const TAG_COLORS = ['blue', 'teal', 'orange', 'red', 'amber', 'purple', 'pink', 'gray'] as const;

/** A problem the AI app can fix, e.g. an unknown id; it is shown to the AI instead of failing the call. */
export class ToolError extends Error {}

/** Sorts names the way people expect: "Chapter 2" before "Chapter 10", ignoring case. */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A user's records in one table that haven't been deleted. */
async function liveRows<T>(db: Db, userId: string, table: SyncedTable): Promise<T[]> {
  const result = await db.execute(sql`
    SELECT data FROM synced_rows
     WHERE user_id = ${userId} AND table_name = ${table} AND (data->>'deleted_at') IS NULL`);
  return (result.rows as { data: T }[]).map((r) => r.data);
}

async function liveRow<T>(db: Db, userId: string, table: SyncedTable, id: string): Promise<T | null> {
  const result = await db.execute(sql`
    SELECT data FROM synced_rows
     WHERE user_id = ${userId} AND table_name = ${table} AND row_id = ${id} AND (data->>'deleted_at') IS NULL`);
  return (result.rows as { data: T }[])[0]?.data ?? null;
}

/** Saves new rows for the user in one transaction. */
async function save(db: Db, userId: string, rows: { table: SyncedTable; id: string; data: Record<string, unknown> }[]) {
  const modifiedAt = new Date().toISOString();
  const changes: Change[] = rows.map((r) => ({ ...r, modifiedAt }));
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await writeChanges(tx, userId, changes);
  });
}

// --- folders -----------------------------------------------------------------------

/** "Class 10 / Physics / Chapter 1" for every folder, by id. */
function folderPaths(folders: FolderRow[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const paths = new Map<string, string>();
  for (const folder of folders) {
    const names: string[] = [];
    let current: FolderRow | undefined = folder;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    paths.set(folder.id, names.join(' / '));
  }
  return paths;
}

export async function listFolders(db: Db, userId: string): Promise<{ id: string; path: string }[]> {
  const paths = folderPaths(await liveRows<FolderRow>(db, userId, 'folders'));
  return [...paths].map(([id, path]) => ({ id, path })).sort((a, b) => compareNames(a.path, b.path));
}

// --- decks and cards ---------------------------------------------------------------

export async function listDecks(db: Db, userId: string) {
  const [decks, cards] = await Promise.all([
    liveRows<DeckRow>(db, userId, 'decks'),
    liveRows<CardRow>(db, userId, 'cards'),
  ]);
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.deck_id, (counts.get(card.deck_id) ?? 0) + 1);
  return decks
    .map((d) => ({ id: d.id, name: d.name, description: d.description, cardCount: counts.get(d.id) ?? 0 }))
    .sort((a, b) => compareNames(a.name, b.name));
}

export async function getDeck(db: Db, userId: string, deckId: string) {
  const deck = await liveRow<DeckRow>(db, userId, 'decks', deckId);
  if (!deck) throw new ToolError(`No deck with id ${deckId}. Use list_decks to see the decks.`);
  const cards = (await liveRows<CardRow>(db, userId, 'cards'))
    .filter((c) => c.deck_id === deckId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    cards: cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
  };
}

export type CardInput = { front: string; back: string };

function cardRows(deckId: string, cards: CardInput[], now: string) {
  // A millisecond apart, so the app shows them in the order given.
  const start = Date.parse(now);
  return cards.map((card, i) => {
    const id = randomUUID();
    const at = new Date(start + i).toISOString();
    return {
      table: 'cards' as const,
      id,
      data: {
        id,
        deck_id: deckId,
        front: card.front.trim(),
        back: card.back.trim(),
        created_at: at,
        updated_at: at,
        deleted_at: null,
        favorited_at: null,
        rating: null,
        rated_at: null,
      },
    };
  });
}

export async function createDeck(
  db: Db,
  userId: string,
  input: { name: string; description?: string; cards: CardInput[] },
): Promise<{ id: string; cardIds: string[] }> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const cards = cardRows(id, input.cards, now);
  await save(db, userId, [
    {
      table: 'decks',
      id,
      data: {
        id,
        name: input.name.trim(),
        description: (input.description ?? '').trim(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
        last_studied_at: null,
        study_seconds: 0,
      },
    },
    ...cards,
  ]);
  return { id, cardIds: cards.map((c) => c.id) };
}

export async function addCards(db: Db, userId: string, deckId: string, cards: CardInput[]): Promise<string[]> {
  const deck = await liveRow<DeckRow>(db, userId, 'decks', deckId);
  if (!deck) throw new ToolError(`No deck with id ${deckId}. Use list_decks to see the decks.`);
  const rows = cardRows(deckId, cards, new Date().toISOString());
  await save(db, userId, rows);
  return rows.map((r) => r.id);
}

// --- notes and tags ----------------------------------------------------------------

export type CornellRow = { cue: string; notes: string };

export type NoteInput = {
  title: string;
  /** Folder names from the top, e.g. ["Class 10", "Physics"]. Missing folders are made. */
  folderPath?: string[];
  style: 'plain' | 'cornell';
  body?: string;
  cornellRows?: CornellRow[];
  summary?: string;
  tags?: string[];
  /** The note's key points, one short line each, added to the folder's "Good to know" note. */
  goodToKnow?: string[];
};

/** The note in each folder that collects the key points of the other notes there. */
export const GOOD_TO_KNOW_TITLE = 'Good to know';

/**
 * Puts a topic's key points into the "Good to know" text as "## Topic" with bullets.
 * If the topic is already there (the AI rewrote that note), its section is replaced;
 * otherwise it is added at the end, so topics stay in the order they were written.
 */
export function withGoodToKnowSection(body: string, topic: string, points: string[]): string {
  const section = [`## ${topic.trim()}`, ...points.map((p) => `- ${p.trim().replace(/^[-•]\s*/, '')}`)].join('\n');
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## ') && sameName(line.slice(3), topic));
  if (start === -1) return body.trim() ? `${body.trimEnd()}\n\n${section}` : section;
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('## ')) end++;
  const before = lines.slice(0, start).join('\n').trimEnd();
  const after = lines.slice(end).join('\n').trim();
  return [before, section, after].filter(Boolean).join('\n\n');
}

async function noteTagsByNote(db: Db, userId: string): Promise<Map<string, string[]>> {
  const [links, tags] = await Promise.all([
    liveRows<NoteTagRow>(db, userId, 'note_tags'),
    liveRows<TagRow>(db, userId, 'tags'),
  ]);
  const tagNames = new Map(tags.map((t) => [t.id, t.name]));
  const byNote = new Map<string, string[]>();
  for (const link of links) {
    const name = tagNames.get(link.tag_id);
    if (!name) continue;
    byNote.set(link.note_id, [...(byNote.get(link.note_id) ?? []), name]);
  }
  return byNote;
}

export async function listNotes(db: Db, userId: string, filter: { folderPath?: string[]; tag?: string; search?: string }) {
  const [notes, folders, tagsByNote] = await Promise.all([
    liveRows<NoteRow>(db, userId, 'notes'),
    liveRows<FolderRow>(db, userId, 'folders'),
    noteTagsByNote(db, userId),
  ]);
  const paths = folderPaths(folders);
  const wantedPath = filter.folderPath?.map((n) => n.trim()).filter(Boolean).join(' / ');
  const search = filter.search?.trim().toLowerCase();
  return notes
    .map((n) => ({
      id: n.id,
      title: n.title,
      style: n.style,
      folder: n.folder_id ? (paths.get(n.folder_id) ?? '') : '',
      tags: tagsByNote.get(n.id) ?? [],
      createdBy: n.created_by,
      updatedAt: n.updated_at,
      text: `${n.title}\n${n.body}\n${n.cornell_rows}\n${n.summary}`.toLowerCase(),
    }))
    .filter((n) => {
      if (wantedPath && !(sameName(n.folder, wantedPath) || n.folder.toLowerCase().startsWith(`${wantedPath.toLowerCase()} / `)))
        return false;
      if (filter.tag && !n.tags.some((t) => sameName(t, filter.tag!))) return false;
      if (search && !n.text.includes(search)) return false;
      return true;
    })
    .sort((a, b) => compareNames(`${a.folder} / ${a.title}`, `${b.folder} / ${b.title}`))
    .map(({ text: _text, ...note }) => note);
}

function parseCornellRows(value: unknown): CornellRow[] {
  try {
    const rows = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(rows) ? rows.map((r) => ({ cue: String(r?.cue ?? ''), notes: String(r?.notes ?? '') })) : [];
  } catch {
    return [];
  }
}

export async function getNote(db: Db, userId: string, noteId: string) {
  const note = await liveRow<NoteRow>(db, userId, 'notes', noteId);
  if (!note) throw new ToolError(`No note with id ${noteId}. Use list_notes to find notes.`);
  const [folders, tagsByNote] = await Promise.all([liveRows<FolderRow>(db, userId, 'folders'), noteTagsByNote(db, userId)]);
  return {
    id: note.id,
    title: note.title,
    style: note.style,
    folder: note.folder_id ? (folderPaths(folders).get(note.folder_id) ?? '') : '',
    tags: tagsByNote.get(note.id) ?? [],
    ...(note.style === 'cornell'
      ? { cornellRows: parseCornellRows(note.cornell_rows), summary: note.summary }
      : { body: note.body }),
    createdBy: note.created_by,
    updatedAt: note.updated_at,
  };
}

/**
 * Creates a note, making any folders on its path and any tags it names that don't exist yet
 * (names are matched ignoring case, as the app does). `createdBy` is the AI app's name, which
 * the app shows as a badge on the note.
 */
export async function createNote(
  db: Db,
  userId: string,
  input: NoteInput,
  createdBy: string,
): Promise<{ id: string; folder: string; tags: string[]; goodToKnow?: 'added' | 'created' }> {
  const now = new Date().toISOString();
  const rows: { table: SyncedTable; id: string; data: Record<string, unknown> }[] = [];

  // Folders: walk the path, reusing folders that exist.
  const folders = await liveRows<FolderRow>(db, userId, 'folders');
  let parentId: string | null = null;
  const pathNames: string[] = [];
  for (const raw of input.folderPath ?? []) {
    const name = raw.trim();
    if (!name) continue;
    pathNames.push(name);
    const existing = folders
      .filter((f) => (f.parent_id ?? null) === parentId && sameName(f.name, name))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const id = randomUUID();
    const folder = { id, parent_id: parentId, name, created_at: now, updated_at: now, deleted_at: null, favorited_at: null };
    folders.push(folder);
    rows.push({ table: 'folders', id, data: folder });
    parentId = id;
  }

  // The note itself.
  const noteId = randomUUID();
  const cornell = input.style === 'cornell';
  rows.push({
    table: 'notes',
    id: noteId,
    data: {
      id: noteId,
      folder_id: parentId,
      title: input.title.trim(),
      style: input.style,
      body: cornell ? '' : (input.body ?? '').trim(),
      cornell_rows: JSON.stringify(
        cornell ? (input.cornellRows ?? []).map((r) => ({ cue: r.cue.trim(), notes: r.notes.trim() })) : [],
      ),
      summary: cornell ? (input.summary ?? '').trim() : '',
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      favorited_at: null,
    },
  });

  // Good to know: add this note's key points to the folder's summary note, making it if needed.
  const goodToKnowUpdate = await goodToKnowChange(db, userId, parentId, [{ topic: input.title, points: input.goodToKnow ?? [] }], createdBy, now);
  if (goodToKnowUpdate) rows.push(goodToKnowUpdate.row);
  const goodToKnow = goodToKnowUpdate?.status;

  // Tags: reuse by name, else make them with the next colour.
  const tags = await liveRows<TagRow>(db, userId, 'tags');
  const tagNames: string[] = [];
  for (const raw of input.tags ?? []) {
    const name = raw.trim();
    if (!name || tagNames.some((t) => sameName(t, name))) continue;
    let tag = tags
      .filter((t) => sameName(t.name, name))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    if (!tag) {
      const id = randomUUID();
      tag = { id, name, color: TAG_COLORS[tags.length % TAG_COLORS.length], created_at: now, updated_at: now, deleted_at: null };
      tags.push(tag);
      rows.push({ table: 'tags', id, data: tag });
    }
    tagNames.push(tag.name);
    rows.push({
      table: 'note_tags',
      id: `${noteId}:${tag.id}`,
      data: { note_id: noteId, tag_id: tag.id, created_at: now, deleted_at: null },
    });
  }

  await save(db, userId, rows);
  return { id: noteId, folder: pathNames.join(' / '), tags: tagNames, goodToKnow };
}

// --- good to know ----------------------------------------------------------------

export type GoodToKnowTopic = { topic: string; points: string[] };

/**
 * The row that puts these topics' key points into a folder's "Good to know" note:
 * the existing note with the sections added or replaced, or a new note. Null when
 * there are no points to add.
 */
async function goodToKnowChange(
  db: Db,
  userId: string,
  folderId: string | null,
  topics: GoodToKnowTopic[],
  createdBy: string,
  now: string,
): Promise<{ row: { table: SyncedTable; id: string; data: Record<string, unknown> }; status: 'added' | 'created' } | null> {
  const wanted = topics
    .map((t) => ({ topic: t.topic.trim(), points: t.points.map((p) => p.trim()).filter(Boolean) }))
    .filter((t) => t.topic && t.points.length > 0);
  if (wanted.length === 0) return null;
  const apply = (text: string) => wanted.reduce((acc, t) => withGoodToKnowSection(acc, t.topic, t.points), text);

  const existing = (await liveRows<NoteRow>(db, userId, 'notes'))
    .filter((n) => (n.folder_id ?? null) === folderId && sameName(n.title, GOOD_TO_KNOW_TITLE))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  if (existing) {
    // A Cornell "Good to know" (the student changed it) gets the points in its summary instead.
    const field = existing.style === 'cornell' ? 'summary' : 'body';
    return {
      row: { table: 'notes', id: existing.id, data: { ...existing, [field]: apply(existing[field]), updated_at: now } },
      status: 'added',
    };
  }
  const id = randomUUID();
  return {
    row: {
      table: 'notes',
      id,
      data: {
        id,
        folder_id: folderId,
        title: GOOD_TO_KNOW_TITLE,
        style: 'plain',
        body: apply(''),
        cornell_rows: '[]',
        summary: '',
        created_by: createdBy,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        favorited_at: null,
      },
    },
    status: 'created',
  };
}

/**
 * Adds key points for notes that already exist (e.g. written before "Good to know"
 * was there) to a folder's "Good to know" note. The folder must exist.
 */
export async function addGoodToKnow(
  db: Db,
  userId: string,
  folderPath: string[],
  topics: GoodToKnowTopic[],
  createdBy: string,
): Promise<{ folder: string; status: 'added' | 'created'; topics: number }> {
  const folders = await liveRows<FolderRow>(db, userId, 'folders');
  let folderId: string | null = null;
  const names: string[] = [];
  for (const raw of folderPath) {
    const name = raw.trim();
    if (!name) continue;
    const found = folders
      .filter((f) => (f.parent_id ?? null) === folderId && sameName(f.name, name))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    if (!found) throw new ToolError(`No folder "${[...names, name].join(' / ')}". Use list_folders to see the folders.`);
    folderId = found.id;
    names.push(found.name);
  }
  const change = await goodToKnowChange(db, userId, folderId, topics, createdBy, new Date().toISOString());
  if (!change) throw new ToolError('Pass at least one topic with key points.');
  await save(db, userId, [change.row]);
  return { folder: names.join(' / ') || '(top level)', status: change.status, topics: topics.length };
}
