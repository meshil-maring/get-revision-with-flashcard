import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import type { Auth } from '../auth/auth.ts';
import { requireSession, type SessionVars } from '../auth/require-session.ts';
import type { Db } from '../db/client.ts';
import { removeDeletedFiles } from '../files/routes.ts';
import type { FileStorage } from '../files/storage.ts';
import { sync, syncRequest } from './sync.ts';

/** POST / — see backend/README.md, "How sync works". */
export function syncRoutes(db: Db, auth: Auth, storage: FileStorage) {
  return new Hono<SessionVars>().use(requireSession(auth)).post('/', bodyLimit({ maxSize: 10 * 1024 * 1024 }), async (c) => {
    const parsed = syncRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad sync request.', issues: parsed.error.issues }, 400);
    const userId = c.get('session').user.id;
    const response = await sync(db, userId, parsed.data);

    const deletedAttachments = parsed.data.changes
      .filter((ch) => (ch.table === 'attachments' || ch.table === 'note_attachments') && ch.data.deleted_at)
      .map((ch) => ch.id);
    // The sync is saved; a storage hiccup here only leaves a file behind.
    await removeDeletedFiles(db, storage, userId, deletedAttachments).catch((error: unknown) => {
      console.error('Could not remove deleted files:', error);
    });
    return c.json(response);
  });
}
