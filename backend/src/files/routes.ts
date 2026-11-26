import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import type { Auth } from '../auth/auth.ts';
import { requireSession, type SessionVars } from '../auth/require-session.ts';
import type { Db } from '../db/client.ts';
import { files } from '../db/schema.ts';
import type { FilesConfig } from '../env.ts';
import { LOCAL_FILES_PATH, type DiskStorage, type FileStorage } from './storage.ts';

/** File types the app can attach: images, PDFs and audio. */
export function isAllowedType(mimeType: string): boolean {
  return /^(image|audio)\/[\w.+-]+$/.test(mimeType) || mimeType === 'application/pdf';
}

/** Where a user's attachment is stored. Attachment ids are the app's UUIDs. */
export function fileKey(userId: string, attachmentId: string): string {
  return `u/${userId}/${attachmentId}`;
}

const attachmentId = z.string().regex(/^[A-Za-z0-9-]{1,100}$/);

const uploadRequest = z.object({
  id: attachmentId,
  size: z.number().int().min(1),
  mimeType: z.string().max(100),
});

const completeRequest = z.object({ id: attachmentId });

const downloadRequest = z.object({ keys: z.array(z.string().max(300)).min(1).max(100) });

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Bytes the user stores, not counting the given key (which is being replaced). */
async function usedBytes(db: Db, userId: string, exceptKey: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number>`coalesce(sum(${files.size}), 0)` })
    .from(files)
    .where(and(eq(files.userId, userId), ne(files.key, exceptKey)));
  return Number(row?.total ?? 0);
}

/**
 * POST /uploads           { id, size, mimeType } → { key, url }   (then PUT the file to url)
 * POST /uploads/complete  { id } → { key }                        (checks what was uploaded)
 * POST /download-urls     { keys } → { urls: { [key]: url } }
 */
export function fileRoutes(db: Db, auth: Auth, storage: FileStorage, config: FilesConfig) {
  return new Hono<SessionVars>()
    .use(requireSession(auth))
    .post('/uploads', async (c) => {
      const parsed = uploadRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'Bad upload request.', issues: parsed.error.issues }, 400);
      const { id, size, mimeType } = parsed.data;
      const userId = c.get('session').user.id;

      if (!isAllowedType(mimeType)) return c.json({ error: 'Only images, PDFs and audio can be attached.' }, 415);
      if (size > config.maxFileBytes) {
        return c.json({ error: `Files can be up to ${mb(config.maxFileBytes)}.` }, 413);
      }
      const key = fileKey(userId, id);
      if (size + (await usedBytes(db, userId, key)) > config.quotaBytes) {
        return c.json({ error: `Your account's ${mb(config.quotaBytes)} of file storage is full.` }, 413);
      }

      // Same attachment id → same key, so a retried upload replaces its earlier try.
      await db
        .insert(files)
        .values({ key, userId, size, mimeType })
        .onConflictDoUpdate({ target: files.key, set: { size, mimeType, uploadedAt: null } });
      return c.json({ key, url: await storage.uploadUrl(key, mimeType) });
    })
    .post('/uploads/complete', async (c) => {
      const parsed = completeRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'Bad request.', issues: parsed.error.issues }, 400);
      const userId = c.get('session').user.id;
      const key = fileKey(userId, parsed.data.id);

      const [record] = await db.select().from(files).where(eq(files.key, key));
      if (!record) return c.json({ error: 'Ask for an upload link first.' }, 404);

      // The upload link can't limit the size, so check the stored file itself.
      const size = await storage.size(key);
      if (size === null) return c.json({ error: 'The file has not been uploaded.' }, 409);
      if (size > config.maxFileBytes || size + (await usedBytes(db, userId, key)) > config.quotaBytes) {
        await storage.remove(key);
        await db.delete(files).where(eq(files.key, key));
        return c.json({ error: 'The file is too big.' }, 413);
      }
      await db.update(files).set({ size, uploadedAt: new Date().toISOString() }).where(eq(files.key, key));
      return c.json({ key });
    })
    .post('/download-urls', async (c) => {
      const parsed = downloadRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'Bad request.', issues: parsed.error.issues }, 400);
      // Only the user's own uploaded files; other keys are left out of the answer.
      const owned = await db
        .select({ key: files.key, mimeType: files.mimeType })
        .from(files)
        .where(
          and(eq(files.userId, c.get('session').user.id), inArray(files.key, parsed.data.keys), isNotNull(files.uploadedAt)),
        );
      const urls: Record<string, string> = {};
      for (const file of owned) urls[file.key] = await storage.downloadUrl(file.key, file.mimeType);
      return c.json({ urls });
    });
}

/** Serves the disk storage's signed links (development only; with R2 the app talks to R2). */
export function localFileRoutes(storage: DiskStorage, config: FilesConfig) {
  const keyOf = (path: string) => decodeURIComponent(path.slice(LOCAL_FILES_PATH.length + 1));
  return new Hono()
    .put('/*', bodyLimit({ maxSize: config.maxFileBytes, onError: (c) => c.json({ error: 'The file is too big.' }, 413) }), async (c) => {
      const key = keyOf(c.req.path);
      if (!storage.verify('PUT', key, c.req.query('expires') ?? '', c.req.query('signature') ?? '')) {
        return c.json({ error: 'This upload link is not valid.' }, 403);
      }
      await storage.write(key, new Uint8Array(await c.req.arrayBuffer()));
      return c.body(null, 200);
    })
    .get('/*', async (c) => {
      const key = keyOf(c.req.path);
      if (!storage.verify('GET', key, c.req.query('expires') ?? '', c.req.query('signature') ?? '')) {
        return c.json({ error: 'This download link is not valid.' }, 403);
      }
      const bytes = await storage.read(key);
      if (!bytes) return c.json({ error: 'No such file.' }, 404);
      const type = c.req.query('type') ?? '';
      return c.body(new Uint8Array(bytes), 200, {
        'Content-Type': isAllowedType(type) ? type : 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
    });
}

/**
 * After a sync: removes the stored files of attachments that are now deleted. Looks at the
 * saved rows (not the request), so a deletion that lost to a newer edit removes nothing.
 */
export async function removeDeletedFiles(db: Db, storage: FileStorage, userId: string, rowIds: string[]): Promise<void> {
  if (rowIds.length === 0) return;
  const result = await db.execute(sql`
    SELECT data->>'remote_key' AS key FROM synced_rows
     WHERE user_id = ${userId}
       AND table_name IN ('attachments', 'note_attachments')
       AND row_id IN (${sql.join(rowIds.map((id) => sql`${id}`), sql`, `)})
       AND data->>'deleted_at' IS NOT NULL
       AND data->>'remote_key' IS NOT NULL`);
  const ownPrefix = `u/${userId}/`;
  for (const { key } of result.rows as { key: string }[]) {
    if (!key.startsWith(ownPrefix)) continue;
    await storage.remove(key);
    await db.delete(files).where(and(eq(files.key, key), eq(files.userId, userId)));
  }
}
