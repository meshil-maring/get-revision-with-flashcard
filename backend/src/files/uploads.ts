import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { and, eq, gt, isNotNull, lt, sql } from 'drizzle-orm';

import type { Db } from '../db/client.ts';
import { files } from '../db/schema.ts';
import type { FilesConfig } from '../env.ts';
import { lockUser } from '../sync/sync.ts';
import { checkImage, ImageError, mb, safeFileName, type CheckedImage } from './images.ts';
import { fileKey, usedBytes } from './routes.ts';
import type { FileStorage } from './storage.ts';

// Images AI apps upload for a user's notes (MCP upload_image, or the upload page it links to).
// They go to the same storage as the app's attachments, under the same u/<user>/<id> keys,
// and wait in "files" with an expiry until a tool attaches them to a note.

/** An uploaded image that no note uses is removed after this long. */
export const UNATTACHED_HOURS = 24;
/** How long an upload page link works. */
export const UPLOAD_LINK_MINUTES = 30;

export type ImageDeps = { db: Db; storage: FileStorage; config: FilesConfig };

export type StoredImage = CheckedImage & { attachmentId: string; key: string; fileName: string; expiresAt: string };

// Timestamps from the database are compared as dates, never as text: Postgres writes them as
// "2026-11-27 10:00:00+00", which doesn't sort like ISO "2026-11-27T10:00:00Z".
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

/** Uploads through MCP (and upload links handed out) in the last hour; app uploads don't count. */
async function checkRate({ db, config }: ImageDeps, userId: string): Promise<void> {
  const [row] = await db
    .select({ n: sql<string | number>`count(*)` })
    .from(files)
    .where(and(eq(files.userId, userId), isNotNull(files.name), gt(files.createdAt, sql`now() - interval '1 hour'`)));
  if (Number(row?.n ?? 0) >= config.imageUploadsPerHour) {
    throw new ImageError(`Too many images in the last hour (at most ${config.imageUploadsPerHour}). Try again later.`, 429);
  }
}

/**
 * Checks and stores an image for the user. With `id`, fills the upload link made for that id
 * (see createUploadLink); without, makes a new attachment id.
 */
export async function storeImage(
  deps: ImageDeps,
  userId: string,
  input: { id?: string; bytes: Uint8Array; fileName?: string | null; declaredType?: string | null },
): Promise<StoredImage> {
  const { db, storage, config } = deps;
  const image = checkImage(input.bytes, config.maxImageBytes, input.declaredType);

  const attachmentId = input.id ?? randomUUID();
  const key = fileKey(userId, attachmentId);
  let fileName = safeFileName(input.fileName, image.type);
  if (input.id) {
    const [pending] = await db.select().from(files).where(and(eq(files.key, key), eq(files.userId, userId)));
    if (!pending) throw new ImageError('This upload link is not valid.', 404);
    if (pending.uploadedAt) throw new ImageError('An image was already uploaded with this link.', 409);
    if (!pending.expiresAt || Date.parse(pending.expiresAt) < Date.now()) throw new ImageError('This upload link has expired.', 410);
    if (!input.fileName && pending.name) fileName = safeFileName(pending.name, image.type);
  } else {
    await checkRate(deps, userId);
  }
  if (image.size + (await usedBytes(db, userId, key)) > config.quotaBytes) {
    throw new ImageError(`The account's ${mb(config.quotaBytes)} of file storage is full.`, 413);
  }

  try {
    await storage.put(key, input.bytes, image.type);
  } catch (error) {
    console.error('Could not store an uploaded image:', error);
    throw new ImageError('The image could not be saved to storage. Please try again.', 502);
  }

  const expiresAt = hoursFromNow(UNATTACHED_HOURS);
  const now = new Date().toISOString();
  try {
    await db
      .insert(files)
      .values({ key, userId, size: image.size, mimeType: image.type, name: fileName, uploadedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: files.key,
        set: { size: image.size, mimeType: image.type, name: fileName, uploadedAt: now, expiresAt },
      });
  } catch (error) {
    // Without its record the file would never be found or cleaned up, so take it back out.
    await storage.remove(key).catch(() => undefined);
    throw error;
  }
  return { ...image, attachmentId, key, fileName, expiresAt };
}

// --- upload links ----------------------------------------------------------------------
// For AI apps that can't hand over the image itself (Claude.ai can't pass a chat attachment
// to a tool): the tool returns a link, the user opens it and picks the picture.

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(`image-upload\n${payload}`).digest('base64url');
}

export function uploadToken(secret: string, userId: string, attachmentId: string, expires: number): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, i: attachmentId, e: expires })).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

/** The user and attachment id a link was made for, or null if it was changed or has expired. */
export function readUploadToken(secret: string, token: string): { userId: string; attachmentId: string } | null {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, i, e } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { u: unknown; i: unknown; e: unknown };
    if (typeof u !== 'string' || typeof i !== 'string' || typeof e !== 'number' || e < Date.now() / 1000) return null;
    return { userId: u, attachmentId: i };
  } catch {
    return null;
  }
}

export const UPLOAD_PAGE_PATH = '/upload';

/** Makes a one-time upload page link; the image gets `attachmentId` once the user uploads it. */
export async function createUploadLink(
  deps: ImageDeps,
  userId: string,
  { baseURL, secret, fileName }: { baseURL: string; secret: string; fileName?: string | null },
): Promise<{ attachmentId: string; uploadUrl: string; expiresAt: string }> {
  await checkRate(deps, userId);
  const attachmentId = randomUUID();
  const expiresAt = new Date(Date.now() + UPLOAD_LINK_MINUTES * 60_000);
  const name = fileName ? safeFileName(fileName, 'image/png').replace(/\.png$/, '') : null;
  // A placeholder until the upload: no size yet, and removed with the other expired uploads.
  await deps.db.insert(files).values({
    key: fileKey(userId, attachmentId),
    userId,
    size: 0,
    mimeType: 'image/*',
    name: name ?? 'image',
    expiresAt: expiresAt.toISOString(),
  });
  const token = uploadToken(secret, userId, attachmentId, Math.floor(expiresAt.getTime() / 1000));
  return { attachmentId, uploadUrl: `${baseURL}${UPLOAD_PAGE_PATH}/${token}`, expiresAt: expiresAt.toISOString() };
}

// --- removing files ------------------------------------------------------------------------

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** True while a live card or note attachment of the user's still uses the stored file. */
export async function isFileInUse(tx: Tx | Db, userId: string, key: string): Promise<boolean> {
  const result = await tx.execute(sql`
    SELECT 1 FROM synced_rows
     WHERE user_id = ${userId}
       AND table_name IN ('attachments', 'note_attachments')
       AND data->>'remote_key' = ${key}
       AND data->>'deleted_at' IS NULL
     LIMIT 1`);
  return result.rows.length > 0;
}

/**
 * Removes a stored file and its record, unless an attachment still uses it (one uploaded
 * image can be attached to several notes). Returns whether it was removed.
 */
export async function removeFileIfUnused(db: Db, storage: FileStorage, userId: string, key: string): Promise<boolean> {
  if (!key.startsWith(`u/${userId}/`)) return false;
  const removed = await db.transaction(async (tx) => {
    await lockUser(tx, userId); // same lock as attaching, so the two can't cross
    if (await isFileInUse(tx, userId, key)) return false;
    await tx.delete(files).where(and(eq(files.key, key), eq(files.userId, userId)));
    return true;
  });
  // After the record is gone; a storage hiccup here only leaves an unreachable file behind.
  if (removed) await storage.remove(key).catch((error: unknown) => console.error('Could not remove a stored file:', error));
  return removed;
}

/** Removes uploads (and unused upload links) that were never attached in time. Returns how many. */
export async function removeExpiredUploads(db: Db, storage: FileStorage, now = new Date()): Promise<number> {
  const expired = await db
    .select({ key: files.key, userId: files.userId })
    .from(files)
    .where(lt(files.expiresAt, now.toISOString()))
    .limit(500);
  let removed = 0;
  for (const file of expired) {
    if (await removeFileIfUnused(db, storage, file.userId, file.key)) removed += 1;
    // In use after all (attached as it expired): keep it for good.
    else await db.update(files).set({ expiresAt: null }).where(eq(files.key, file.key));
  }
  return removed;
}
