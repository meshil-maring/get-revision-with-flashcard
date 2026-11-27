import { randomUUID } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '../db/client.ts';
import { files } from '../db/schema.ts';
import { fileKey } from '../files/routes.ts';
import { LINK_SECONDS, type FileStorage } from '../files/storage.ts';
import { removeFileIfUnused } from '../files/uploads.ts';
import { lockUser, writeChanges, type Change } from '../sync/sync.ts';
import { buildNote, liveRow, ToolError, type NewRow, type NoteInput, type NoteRow } from './store.ts';

// Images on notes, for the MCP tools. An attached image is a note_attachments row, exactly
// as the app writes one (mobile/src/data/db.ts), pointing at the stored file by remote_key.
// The app downloads the file on its next sync. One upload can be attached to several notes;
// its file is removed only when no attachment uses it any more.

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

type NoteAttachmentRow = {
  id: string;
  note_id: string;
  kind: string;
  name: string;
  mime_type: string | null;
  created_at: string;
  deleted_at: string | null;
  remote_key: string | null;
  caption?: string | null;
  alt_text?: string | null;
  position?: number | null;
};

/**
 * An image to attach: its id from upload_image, with optional words to show with it, and
 * optionally the Cornell row (1 = first) to show it in instead of after the note.
 */
export type ImageRef = { attachmentId: string; caption?: string; altText?: string; cornellRow?: number };

export type AttachmentInfo = {
  attachment_id: string;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  caption: string | null;
  alt_text: string | null;
  display_order: number;
  created_at: string;
  /** False while the file is only on the device that attached it (not uploaded by its next sync yet). */
  uploaded: boolean;
};

// --- images shown inside the note's text -------------------------------------------------
// A line ":::image <attachment id>" in a note's text shows that attached image right there
// (mobile/src/lib/rich-text.ts), e.g. inside the Cornell row it explains. Images without
// such a line show after the note.

const IMAGE_LINE = /^:::\s*image\s+([A-Za-z0-9-]{1,100})\s*$/i;

/** The image ids a text shows in place. */
export function imageRefsIn(text: string): string[] {
  return text
    .split('\n')
    .map((line) => IMAGE_LINE.exec(line.trim())?.[1])
    .filter((ref): ref is string => ref !== undefined);
}

function withoutImageRefs(text: string, ids: Set<string>): string {
  return text
    .split('\n')
    .filter((line) => {
      const ref = IMAGE_LINE.exec(line.trim())?.[1];
      return ref === undefined || !ids.has(ref);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type CornellRows = { cue: string; notes: string }[];

function cornellRowsOf(note: Record<string, unknown>): CornellRows {
  try {
    const rows = JSON.parse(String(note.cornell_rows ?? '[]'));
    return Array.isArray(rows) ? rows.map((r) => ({ cue: String(r?.cue ?? ''), notes: String(r?.notes ?? '') })) : [];
  } catch {
    return [];
  }
}

/** Every text of a note that can show images, as one string. */
function noteText(note: Record<string, unknown>): string {
  return [String(note.body ?? ''), ...cornellRowsOf(note).map((r) => r.notes), String(note.summary ?? '')].join('\n');
}

/**
 * The note with an ":::image <id>" line added at the end of each image's Cornell row, or
 * null when nothing changes. Throws a ToolError for a plain note or a row that isn't there.
 */
function placeInRows(note: Record<string, unknown>, placements: { attachmentId: string; cornellRow?: number }[]) {
  const wanted = placements.filter((p) => p.cornellRow !== undefined);
  if (wanted.length === 0) return null;
  if (note.style !== 'cornell') {
    throw new ToolError(
      'cornell_row is only for Cornell notes. In a plain note, images show after the text (or write a line ' +
        '":::image <attachment_id>" in the body where it should go).',
    );
  }
  const rows = cornellRowsOf(note);
  let changed = false;
  for (const { attachmentId, cornellRow } of wanted) {
    const row = rows[cornellRow! - 1];
    if (!row) throw new ToolError(`The note has ${rows.length} Cornell rows, so there is no row ${cornellRow}.`);
    // Moved, not copied: out of any other row it was in.
    const id = new Set([attachmentId]);
    for (const other of rows) {
      if (other !== row && imageRefsIn(other.notes).includes(attachmentId)) {
        other.notes = withoutImageRefs(other.notes, id);
        changed = true;
      }
    }
    if (imageRefsIn(row.notes).includes(attachmentId)) continue;
    row.notes = `${row.notes.trimEnd()}${row.notes.trim() ? '\n\n' : ''}:::image ${attachmentId}`;
    changed = true;
  }
  return changed ? { ...note, cornell_rows: JSON.stringify(rows) } : null;
}

/** The note without the ":::image" lines for these ids, or null when it has none. */
function unplace(note: Record<string, unknown>, ids: Set<string>) {
  if (!imageRefsIn(noteText(note)).some((ref) => ids.has(ref))) return null;
  const rows = cornellRowsOf(note).map((r) => ({ ...r, notes: withoutImageRefs(r.notes, ids) }));
  return {
    ...note,
    body: withoutImageRefs(String(note.body ?? ''), ids),
    cornell_rows: JSON.stringify(rows),
    summary: withoutImageRefs(String(note.summary ?? ''), ids),
  };
}

/** Where the note shows an image: in a Cornell row, in the body or summary, or after the note. */
function shownIn(note: Record<string, unknown>, ids: string[]): string {
  const has = (text: string) => imageRefsIn(text).some((ref) => ids.includes(ref));
  const row = cornellRowsOf(note).findIndex((r) => has(r.notes));
  if (note.style === 'cornell' && row !== -1) return `cornell row ${row + 1}`;
  if (note.style !== 'cornell' && has(String(note.body ?? ''))) return 'in the body';
  if (note.style === 'cornell' && has(String(note.summary ?? ''))) return 'in the summary';
  return 'after the note';
}

/** The id AI apps use for an attachment: the stored file's id (as upload_image gave it). */
function attachmentIdOf(row: NoteAttachmentRow): string {
  return row.remote_key ? (row.remote_key.split('/').pop() ?? row.id) : row.id;
}

/** The note's live attachments, in the order the app shows them. */
async function noteAttachments(tx: Tx | Db, userId: string, noteId: string): Promise<NoteAttachmentRow[]> {
  const result = await tx.execute(sql`
    SELECT data FROM synced_rows
     WHERE user_id = ${userId} AND table_name = 'note_attachments'
       AND data->>'note_id' = ${noteId} AND (data->>'deleted_at') IS NULL`);
  return (result.rows as { data: NoteAttachmentRow }[])
    .map((r) => r.data)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
}

async function requireNote(tx: Tx | Db, userId: string, noteId: string): Promise<NoteRow> {
  const note = await liveRow<NoteRow>(tx as Db, userId, 'notes', noteId);
  if (!note) throw new ToolError(`No note with id ${noteId}. Use list_notes to find notes.`);
  return note;
}

/**
 * The user's uploaded images with these ids. Ids are looked up under the user's own storage
 * folder, so another user's id is simply not found.
 */
async function requireUploads(tx: Tx | Db, userId: string, images: ImageRef[]) {
  const ids = images.map((i) => i.attachmentId);
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated) throw new ToolError(`Image ${repeated} is listed twice.`);
  const keys = ids.map((id) => fileKey(userId, id));
  const found = keys.length
    ? await tx.select().from(files).where(and(eq(files.userId, userId), inArray(files.key, keys)))
    : [];
  const byKey = new Map(found.map((f) => [f.key, f]));
  return images.map((image) => {
    const record = byKey.get(fileKey(userId, image.attachmentId));
    if (!record) {
      throw new ToolError(`No uploaded image with id ${image.attachmentId}. Upload it with upload_image first.`);
    }
    if (!record.uploadedAt) {
      if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) {
        throw new ToolError(`The upload link for image ${image.attachmentId} expired. Call upload_image again.`);
      }
      throw new ToolError(
        `Image ${image.attachmentId} has not been uploaded yet: ask the user to open the upload link, choose the ` +
          'picture and press Upload, then try again.',
      );
    }
    if (!record.mimeType.startsWith('image/')) throw new ToolError(`${image.attachmentId} is not an image.`);
    return { image, record };
  });
}

type Upload = Awaited<ReturnType<typeof requireUploads>>[number];

function info(row: NoteAttachmentRow, order: number, size: number | null): AttachmentInfo {
  return {
    attachment_id: attachmentIdOf(row),
    filename: row.name,
    mime_type: row.mime_type,
    file_size: size,
    caption: row.caption ?? null,
    alt_text: row.alt_text ?? null,
    display_order: order,
    created_at: row.created_at,
    uploaded: row.remote_key !== null,
  };
}

/**
 * The rows that attach these uploads to a note, after its existing attachments. An image
 * that is already on the note isn't added twice: its caption and alt text are updated instead.
 */
async function attachmentRows(tx: Tx, userId: string, noteId: string, existing: NoteAttachmentRow[], uploads: Upload[], now: string) {
  // Row ids: the upload's own id (as the app does), unless a row (maybe deleted) already has it.
  const wanted = uploads.map((u) => u.image.attachmentId);
  const taken = wanted.length
    ? new Set(
        (
          await tx.execute(sql`
            SELECT row_id FROM synced_rows WHERE user_id = ${userId} AND table_name = 'note_attachments'
               AND row_id IN (${sql.join(wanted.map((id) => sql`${id}`), sql`, `)})`)
        ).rows.map((r) => (r as { row_id: string }).row_id),
      )
    : new Set<string>();

  let position = existing.reduce((max, a) => Math.max(max, a.position ?? 0), -1);
  const start = Date.parse(now);
  const rows: NewRow[] = [];
  const results: { row: NoteAttachmentRow; size: number; status: 'attached' | 'already attached' }[] = [];
  uploads.forEach(({ image, record }, i) => {
    const caption = image.caption?.trim() || null;
    const altText = image.altText?.trim() || null;
    const same = existing.find((a) => a.remote_key === record.key);
    if (same) {
      const updated = {
        ...same,
        ...(caption !== null ? { caption } : {}),
        ...(altText !== null ? { alt_text: altText } : {}),
      };
      if (caption !== null || altText !== null) rows.push({ table: 'note_attachments', id: same.id, data: updated });
      results.push({ row: updated, size: record.size, status: 'already attached' });
      return;
    }
    position += 1;
    const id = taken.has(image.attachmentId) ? randomUUID() : image.attachmentId;
    const row: NoteAttachmentRow = {
      id,
      note_id: noteId,
      kind: 'image',
      name: record.name ?? 'image',
      mime_type: record.mimeType,
      // A millisecond apart, so app versions that sort by time keep the order given.
      created_at: new Date(start + i).toISOString(),
      deleted_at: null,
      remote_key: record.key,
      caption,
      alt_text: altText,
      position,
    };
    rows.push({ table: 'note_attachments', id, data: row });
    results.push({ row, size: record.size, status: 'attached' });
  });
  return { rows, results };
}

/** Saves rows and keeps the attached uploads for good (they no longer expire). */
async function saveAttached(tx: Tx, userId: string, rows: NewRow[], uploads: Upload[], modifiedAt: string) {
  const changes: Change[] = rows.map((r) => ({ ...r, modifiedAt }));
  await writeChanges(tx, userId, changes);
  const keys = uploads.map((u) => u.record.key);
  if (keys.length) await tx.update(files).set({ expiresAt: null }).where(and(eq(files.userId, userId), inArray(files.key, keys)));
}

/** Attaches uploaded images to one of the user's notes. */
export async function attachImages(db: Db, userId: string, noteId: string, images: ImageRef[]) {
  if (images.length === 0) throw new ToolError('Pass at least one image.');
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const note = await requireNote(tx, userId, noteId);
    const uploads = await requireUploads(tx, userId, images);
    const placed = placeInRows(note, images); // checked before anything is saved
    const existing = await noteAttachments(tx, userId, noteId);
    const now = new Date().toISOString();
    const { rows, results } = await attachmentRows(tx, userId, noteId, existing, uploads, now);
    if (placed) rows.push({ table: 'notes', id: noteId, data: { ...placed, updated_at: now } });
    await saveAttached(tx, userId, rows, uploads, now);
    const order = await noteAttachments(tx, userId, noteId);
    const saved = placed ?? note;
    return results.map((r, i) => ({
      status: r.status,
      ...info(r.row, order.findIndex((a) => a.id === r.row.id) + 1, r.size),
      shown: shownIn(saved, [images[i].attachmentId, r.row.id]),
    }));
  });
}

/**
 * Creates a note with images in one transaction: if any image can't be attached, nothing is
 * saved (no note without its images).
 */
export async function createNoteWithImages(db: Db, userId: string, input: NoteInput, images: ImageRef[], createdBy: string) {
  await requireUploads(db, userId, images); // fail before building anything
  // ":::image" lines the AI app wrote must name images it is attaching, or they'd show nothing.
  const listed = new Set(images.map((i) => i.attachmentId));
  const written = imageRefsIn(
    [input.body ?? '', ...(input.cornellRows ?? []).map((r) => r.notes), input.summary ?? ''].join('\n'),
  );
  const unknown = written.find((ref) => !listed.has(ref));
  if (unknown) throw new ToolError(`The text shows image ${unknown} (":::image ${unknown}"), but it is not in images.`);

  const { rows: noteRows, note } = await buildNote(db, userId, input, createdBy);
  const noteRow = noteRows.find((r) => r.table === 'notes' && r.id === note.id)!;
  const placed = placeInRows(noteRow.data, images);
  if (placed) noteRow.data = placed;
  const attachments = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const uploads = await requireUploads(tx, userId, images); // again, under the lock
    const now = new Date().toISOString();
    const { rows, results } = await attachmentRows(tx, userId, note.id, [], uploads, now);
    await saveAttached(tx, userId, [...noteRows, ...rows], uploads, now);
    return results.map((r, i) => ({ ...info(r.row, i + 1, r.size), shown: shownIn(noteRow.data, [images[i].attachmentId, r.row.id]) }));
  });
  return { note, attachments };
}

/** The note's attachments, with short-lived links to view the uploaded ones. */
export async function listAttachments(db: Db, storage: FileStorage, userId: string, noteId: string) {
  const note = await requireNote(db, userId, noteId);
  const rows = await noteAttachments(db, userId, noteId);
  const keys = rows.map((r) => r.remote_key).filter((k): k is string => k !== null && k.startsWith(`u/${userId}/`));
  const stored = keys.length
    ? await db.select().from(files).where(and(eq(files.userId, userId), inArray(files.key, keys)))
    : [];
  const byKey = new Map(stored.map((f) => [f.key, f]));
  const attachments = [];
  for (const [i, row] of rows.entries()) {
    const file = row.remote_key ? byKey.get(row.remote_key) : undefined;
    const viewable = file?.uploadedAt != null;
    attachments.push({
      ...info(row, i + 1, file?.size ?? null),
      shown: row.kind === 'image' ? shownIn(note, [attachmentIdOf(row), row.id]) : 'after the note',
      display_url: viewable ? await storage.downloadUrl(file.key, file.mimeType) : null,
    });
  }
  return { noteId, attachments, linksExpireInSeconds: LINK_SECONDS };
}

/**
 * Takes an image off a note. Its stored file is removed too unless another note (or card)
 * still uses it.
 */
export async function removeAttachment(db: Db, storage: FileStorage, userId: string, noteId: string, attachmentId: string) {
  const key = fileKey(userId, attachmentId);
  const removed = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const note = await requireNote(tx, userId, noteId);
    const matches = (await noteAttachments(tx, userId, noteId)).filter(
      (a) => a.id === attachmentId || a.remote_key === key,
    );
    if (matches.length === 0) {
      throw new ToolError(`Note ${noteId} has no attachment ${attachmentId}. Use list_note_attachments to see them.`);
    }
    const now = new Date().toISOString();
    await writeChanges(
      tx,
      userId,
      matches.map((a) => ({ table: 'note_attachments' as const, id: a.id, data: { ...a, deleted_at: now }, modifiedAt: now })),
    );
    // Its ":::image" line goes too, so the note doesn't keep an empty spot for it.
    const unplaced = unplace(note, new Set([attachmentId, ...matches.flatMap((a) => [a.id, attachmentIdOf(a)])]));
    if (unplaced) {
      await writeChanges(tx, userId, [{ table: 'notes', id: noteId, data: { ...unplaced, updated_at: now }, modifiedAt: now }]);
    }
    return matches;
  });
  const fileKeys = [...new Set(removed.map((a) => a.remote_key).filter((k): k is string => k !== null))];
  let fileDeleted = false;
  for (const k of fileKeys) fileDeleted = (await removeFileIfUnused(db, storage, userId, k)) || fileDeleted;
  return {
    noteId,
    attachment_id: attachmentId,
    removed: true,
    fileDeleted,
    ...(fileKeys.length > 0 && !fileDeleted ? { note: 'The image is still used elsewhere, so its file was kept.' } : {}),
  };
}
