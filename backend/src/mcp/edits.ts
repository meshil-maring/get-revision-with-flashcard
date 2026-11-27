import type { Db } from '../db/client.ts';
import {
  deckGroups,
  ensureFolderPath,
  findFolder,
  folderPaths,
  GOOD_TO_KNOW_TITLE,
  goodToKnowChange,
  liveRow,
  liveRows,
  noteTagRows,
  resolveGroups,
  sameName,
  save,
  ToolError,
  type CardRow,
  type CornellRow,
  type DeckRow,
  type FolderRow,
  type NewRow,
  type NoteRow,
  type NoteTagRow,
  type TagRow,
} from './store.ts';

// Changes to what the user already has, for the MCP tools: rename, edit, move and delete decks,
// cards, notes and folders. They work like the same actions in the app (mobile/src/data/*.ts):
// deleting only marks rows deleted, a folder takes its notes and folders with it, and a deck its
// cards and groups. Each call saves everything together or nothing.

const deleted = (row: Record<string, unknown>, now: string) => ({ ...row, deleted_at: now, updated_at: now });

/** The rows with these ids, or a ToolError naming the ones that don't exist. */
function pick<T extends { id: string }>(rows: T[], ids: string[], what: string, hint: string): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const unique = [...new Set(ids)];
  const missing = unique.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new ToolError(`No ${what} with id ${missing.join(', ')}. ${hint}`);
  return unique.map((id) => byId.get(id)!);
}

// --- decks, groups and cards -------------------------------------------------------

export async function updateDeck(
  db: Db,
  userId: string,
  deckId: string,
  input: { name?: string; description?: string; renameGroups?: { from: string; to: string }[]; deleteGroups?: string[] },
) {
  const deck = await liveRow<DeckRow>(db, userId, 'decks', deckId);
  if (!deck) throw new ToolError(`No deck with id ${deckId}. Use list_decks to see the decks.`);
  const now = new Date().toISOString();
  const rows: NewRow[] = [];

  if (input.name !== undefined || input.description !== undefined) {
    rows.push({
      table: 'decks',
      id: deck.id,
      data: {
        ...deck,
        name: input.name?.trim() || deck.name,
        description: input.description !== undefined ? input.description.trim() : deck.description,
        updated_at: now,
      },
    });
  }

  const groups = await deckGroups(db, userId, deckId);
  const findGroup = (name: string) => {
    const group = groups.find((g) => sameName(g.name, name));
    if (!group) throw new ToolError(`The deck has no group "${name}". Its groups: ${groups.map((g) => g.name).join(', ') || 'none'}.`);
    return group;
  };

  const renamed: string[] = [];
  for (const { from, to } of input.renameGroups ?? []) {
    const group = findGroup(from);
    const name = to.trim();
    if (groups.some((g) => g.id !== group.id && sameName(g.name, name)))
      throw new ToolError(`The deck already has a group "${name}".`);
    group.name = name;
    rows.push({ table: 'card_groups', id: group.id, data: { ...group, updated_at: now } });
    renamed.push(`${from} → ${name}`);
  }

  // A deleted group's cards stay in the deck, without a group (as in the app).
  let cardsUngrouped = 0;
  const removed: string[] = [];
  const deleteIds = new Set((input.deleteGroups ?? []).map((name) => findGroup(name).id));
  if (deleteIds.size > 0) {
    for (const card of await liveRows<CardRow>(db, userId, 'cards')) {
      if (card.deck_id !== deckId || !card.group_id || !deleteIds.has(card.group_id)) continue;
      rows.push({ table: 'cards', id: card.id, data: { ...card, group_id: null, updated_at: now } });
      cardsUngrouped++;
    }
    for (const group of groups.filter((g) => deleteIds.has(g.id))) {
      rows.push({ table: 'card_groups', id: group.id, data: deleted(group, now) });
      removed.push(group.name);
    }
  }

  if (rows.length === 0) throw new ToolError('Nothing to change: pass name, description, rename_groups or delete_groups.');
  await save(db, userId, rows);
  return {
    deckId,
    name: input.name?.trim() || deck.name,
    ...(renamed.length ? { groupsRenamed: renamed } : {}),
    ...(removed.length ? { groupsDeleted: removed, cardsUngrouped } : {}),
  };
}

/** Deletes a deck with its cards and groups. */
export async function deleteDeck(db: Db, userId: string, deckId: string) {
  const deck = await liveRow<DeckRow>(db, userId, 'decks', deckId);
  if (!deck) throw new ToolError(`No deck with id ${deckId}. Use list_decks to see the decks.`);
  const now = new Date().toISOString();
  const cards = (await liveRows<CardRow>(db, userId, 'cards')).filter((c) => c.deck_id === deckId);
  const groups = await deckGroups(db, userId, deckId);
  await save(db, userId, [
    ...cards.map((c) => ({ table: 'cards' as const, id: c.id, data: deleted(c, now) })),
    ...groups.map((g) => ({ table: 'card_groups' as const, id: g.id, data: deleted(g, now) })),
    { table: 'decks', id: deck.id, data: deleted(deck, now) },
  ]);
  return { deleted: deck.name, cardsDeleted: cards.length };
}

export type CardEdit = { cardId: string; front?: string; back?: string; group?: string };

/** Changes cards' front, back or group ("" = no group; a new group name is made in the card's deck). */
export async function updateCards(db: Db, userId: string, edits: CardEdit[]) {
  const cards = pick(
    await liveRows<CardRow>(db, userId, 'cards'),
    edits.map((e) => e.cardId),
    'card',
    'Use get_deck to see card ids.',
  );
  const byId = new Map(cards.map((c) => [c.id, c]));
  const now = new Date().toISOString();
  const rows: NewRow[] = [];
  const groupsMade: string[] = [];
  const groupsByDeck = new Map<string, Awaited<ReturnType<typeof deckGroups>>>();

  for (const edit of edits) {
    const card = byId.get(edit.cardId)!;
    const updated: CardRow = { ...card, updated_at: now };
    if (edit.front !== undefined) updated.front = edit.front.trim();
    if (edit.back !== undefined) updated.back = edit.back.trim();
    if (edit.group !== undefined) {
      if (!edit.group.trim()) updated.group_id = null;
      else {
        if (!groupsByDeck.has(card.deck_id)) groupsByDeck.set(card.deck_id, await deckGroups(db, userId, card.deck_id));
        const existing = groupsByDeck.get(card.deck_id)!;
        const resolved = resolveGroups(card.deck_id, existing, [{ front: '', back: '', group: edit.group }], now);
        for (const row of resolved.newRows) existing.push(row.data as (typeof existing)[number]);
        rows.push(...resolved.newRows);
        groupsMade.push(...resolved.groupNames);
        updated.group_id = resolved.groupIds[0];
      }
    }
    byId.set(card.id, updated);
  }
  rows.push(...[...byId.values()].map((c) => ({ table: 'cards' as const, id: c.id, data: c })));
  await save(db, userId, rows);
  return { cardsUpdated: byId.size, groupsMade };
}

/** Moves cards into a deck (and optionally a group of it, made if missing). */
export async function moveCards(db: Db, userId: string, cardIds: string[], deckId: string, group?: string) {
  const deck = await liveRow<DeckRow>(db, userId, 'decks', deckId);
  if (!deck) throw new ToolError(`No deck with id ${deckId}. Use list_decks to see the decks.`);
  const cards = pick(await liveRows<CardRow>(db, userId, 'cards'), cardIds, 'card', 'Use get_deck to see card ids.');
  const now = new Date().toISOString();
  const resolved = resolveGroups(deckId, await deckGroups(db, userId, deckId), [{ front: '', back: '', group }], now);
  const groupId = resolved.groupIds[0];
  await save(db, userId, [
    ...resolved.newRows,
    ...cards.map((c) => ({ table: 'cards' as const, id: c.id, data: { ...c, deck_id: deckId, group_id: groupId, updated_at: now } })),
  ]);
  return { cardsMoved: cards.length, deck: deck.name, ...(group?.trim() ? { group: group.trim() } : {}), groupsMade: resolved.groupNames };
}

export async function deleteCards(db: Db, userId: string, cardIds: string[]) {
  const cards = pick(await liveRows<CardRow>(db, userId, 'cards'), cardIds, 'card', 'Use get_deck to see card ids.');
  const now = new Date().toISOString();
  await save(db, userId, cards.map((c) => ({ table: 'cards' as const, id: c.id, data: deleted(c, now) })));
  return { cardsDeleted: cards.length };
}

// --- notes -------------------------------------------------------------------------

export type NoteEdit = {
  title?: string;
  style?: 'plain' | 'cornell';
  body?: string;
  cornellRows?: CornellRow[];
  summary?: string;
  /** Replaces the note's tags (up to three); [] takes them all off. */
  tags?: string[];
  /** New key points for the note in its folder's "Good to know" (replacing the old ones). */
  goodToKnow?: string[];
};

/** Changes a note: only the fields given; the rest stay as they are. */
export async function updateNote(db: Db, userId: string, noteId: string, edit: NoteEdit, appName: string) {
  const note = await liveRow<NoteRow>(db, userId, 'notes', noteId);
  if (!note) throw new ToolError(`No note with id ${noteId}. Use list_notes to find notes.`);
  const isGoodToKnow = sameName(note.title, GOOD_TO_KNOW_TITLE);
  const title = edit.title?.trim() || note.title;
  if (!isGoodToKnow && sameName(title, GOOD_TO_KNOW_TITLE))
    throw new ToolError(`"${GOOD_TO_KNOW_TITLE}" is kept for the folder's key points; choose another title.`);
  if (isGoodToKnow && edit.goodToKnow?.length)
    throw new ToolError(`This is the "${GOOD_TO_KNOW_TITLE}" note: edit its body instead of passing good_to_know.`);

  const now = new Date().toISOString();
  const style = edit.style ?? note.style;
  const updated: NoteRow = {
    ...note,
    title,
    style,
    body: edit.body !== undefined ? edit.body.trim() : note.body,
    cornell_rows:
      edit.cornellRows !== undefined
        ? JSON.stringify(
            edit.cornellRows.map((r) => ({ cue: r.cue.trim(), notes: r.notes.trim() })).filter((r) => r.cue || r.notes),
          )
        : note.cornell_rows,
    summary: edit.summary !== undefined ? edit.summary.trim() : note.summary,
    updated_at: now,
  };
  if (style === 'plain' && !updated.body) throw new ToolError('A plain note needs a body.');
  if (style === 'cornell' && updated.cornell_rows === '[]' && !updated.summary)
    throw new ToolError('A Cornell note needs cornell_rows or a summary.');

  const rows: NewRow[] = [{ table: 'notes', id: note.id, data: updated }];
  let tags: string[] | undefined;
  if (edit.tags !== undefined) {
    const [allTags, links] = await Promise.all([
      liveRows<TagRow>(db, userId, 'tags'),
      liveRows<NoteTagRow>(db, userId, 'note_tags'),
    ]);
    const tagged = noteTagRows(allTags, links.filter((l) => l.note_id === note.id), note.id, edit.tags, now);
    rows.push(...tagged.rows);
    tags = tagged.names;
  }
  let goodToKnow: 'added' | 'created' | undefined;
  if (edit.goodToKnow?.length) {
    const change = await goodToKnowChange(db, userId, note.folder_id ?? null, [{ topic: title, points: edit.goodToKnow }], appName, now);
    if (change) {
      rows.push(change.row);
      goodToKnow = change.status;
    }
  }
  await save(db, userId, rows);
  return {
    noteId: note.id,
    title,
    style,
    changed: Object.keys(edit).filter((k) => edit[k as keyof NoteEdit] !== undefined),
    ...(tags ? { tags } : {}),
    ...(goodToKnow ? { goodToKnow } : {}),
  };
}

/** Moves notes into a folder (folders on the path that don't exist yet are made). */
export async function moveNotes(db: Db, userId: string, noteIds: string[], folderPath: string[]) {
  const notes = pick(await liveRows<NoteRow>(db, userId, 'notes'), noteIds, 'note', 'Use list_notes to find notes.');
  const now = new Date().toISOString();
  const target = ensureFolderPath(await liveRows<FolderRow>(db, userId, 'folders'), folderPath, now);
  await save(db, userId, [
    ...target.rows,
    ...notes.map((n) => ({ table: 'notes' as const, id: n.id, data: { ...n, folder_id: target.id, updated_at: now } })),
  ]);
  return { notesMoved: notes.length, folder: target.names.join(' / ') || '(top level)' };
}

export async function deleteNotes(db: Db, userId: string, noteIds: string[]) {
  const notes = pick(await liveRows<NoteRow>(db, userId, 'notes'), noteIds, 'note', 'Use list_notes to find notes.');
  const now = new Date().toISOString();
  await save(db, userId, notes.map((n) => ({ table: 'notes' as const, id: n.id, data: deleted(n, now) })));
  return { notesDeleted: notes.map((n) => n.title) };
}

// --- folders -----------------------------------------------------------------------

/** The folder at a path (not the top level), with every folder for checks. */
async function existingFolder(db: Db, userId: string, path: string[]) {
  const folders = await liveRows<FolderRow>(db, userId, 'folders');
  const { id } = findFolder(folders, path);
  if (!id) throw new ToolError('Give the path of a folder; the top level itself cannot be changed.');
  return { folder: folders.find((f) => f.id === id)!, folders };
}

function assertNameFree(folders: FolderRow[], parentId: string | null, name: string, exceptId: string) {
  if (folders.some((f) => f.id !== exceptId && (f.parent_id ?? null) === parentId && sameName(f.name, name)))
    throw new ToolError(`There is already a folder called "${name.trim()}" there.`);
}

export async function renameFolder(db: Db, userId: string, path: string[], newName: string) {
  const { folder, folders } = await existingFolder(db, userId, path);
  const name = newName.trim();
  assertNameFree(folders, folder.parent_id ?? null, name, folder.id);
  const now = new Date().toISOString();
  await save(db, userId, [{ table: 'folders', id: folder.id, data: { ...folder, name, updated_at: now } }]);
  folder.name = name;
  return { folder: folderPaths(folders).get(folder.id) };
}

/** Moves a folder, with everything in it, into another folder that exists (empty path = top level). */
export async function moveFolder(db: Db, userId: string, path: string[], toPath: string[]) {
  const { folder, folders } = await existingFolder(db, userId, path);
  const target = findFolder(folders, toPath);
  // Not into itself or a folder inside it.
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (let at: string | null = target.id; at; at = byId.get(at)?.parent_id ?? null) {
    if (at === folder.id) throw new ToolError(`"${folder.name}" can't go inside itself or one of its own folders.`);
  }
  assertNameFree(folders, target.id, folder.name, folder.id);
  const now = new Date().toISOString();
  await save(db, userId, [{ table: 'folders', id: folder.id, data: { ...folder, parent_id: target.id, updated_at: now } }]);
  folder.parent_id = target.id;
  return { folder: folderPaths(folders).get(folder.id) };
}

/** Deletes a folder with every folder and note inside it. */
export async function deleteFolder(db: Db, userId: string, path: string[]) {
  const { folder, folders } = await existingFolder(db, userId, path);
  const subtree = new Set([folder.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders) {
      if (f.parent_id && subtree.has(f.parent_id) && !subtree.has(f.id)) {
        subtree.add(f.id);
        grew = true;
      }
    }
  }
  const notes = (await liveRows<NoteRow>(db, userId, 'notes')).filter((n) => n.folder_id && subtree.has(n.folder_id));
  const now = new Date().toISOString();
  const pathName = folderPaths(folders).get(folder.id);
  await save(db, userId, [
    ...notes.map((n) => ({ table: 'notes' as const, id: n.id, data: deleted(n, now) })),
    ...folders.filter((f) => subtree.has(f.id)).map((f) => ({ table: 'folders' as const, id: f.id, data: deleted(f, now) })),
  ]);
  return { deleted: pathName, foldersDeleted: subtree.size, notesDeleted: notes.length };
}
