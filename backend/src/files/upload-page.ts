import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { files } from '../db/schema.ts';
import { escapeHtml, page } from '../html.ts';
import { ImageError, mb } from './images.ts';
import { fileKey } from './routes.ts';
import { readUploadToken, storeImage, type ImageDeps } from './uploads.ts';

// /upload/<token>: the page an AI app's upload link opens, for when the AI app can't send the
// image itself. The signed token is the permission (like a storage upload link): it names the
// user and the attachment id, works once, and expires (see createUploadLink).

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

function html(c: Context, status: 200 | 400 | 404 | 409 | 410 | 413 | 415 | 429 | 502, title: string, body: string) {
  return c.html(page(title, body), status, SECURITY_HEADERS);
}

function message(c: Context, status: Parameters<typeof html>[1], title: string, text: string) {
  return html(c, status, title, `<h1>${escapeHtml(title)}</h1><div class="card"><p class="done">${escapeHtml(text)}</p></div>`);
}

const LINK_PROBLEM = 'Ask the AI app for a new upload link and try again.';

export function uploadPageRoutes(deps: ImageDeps, secret: string) {
  /** The link's attachment, if the link is genuine, unexpired and not used yet. */
  async function pendingUpload(token: string) {
    const link = readUploadToken(secret, token);
    if (!link) return { error: 'This upload link is not valid or has expired.' } as const;
    const [record] = await deps.db
      .select()
      .from(files)
      .where(and(eq(files.key, fileKey(link.userId, link.attachmentId)), eq(files.userId, link.userId)));
    if (!record) return { error: 'This upload link is not valid or has expired.' } as const;
    if (record.uploadedAt) return { error: 'An image was already uploaded with this link.', used: true } as const;
    return { link, record } as const;
  }

  return new Hono()
    .get('/:token', async (c) => {
      const found = await pendingUpload(c.req.param('token'));
      if ('error' in found) return message(c, found.used ? 409 : 410, 'Upload link', `${found.error} ${found.used ? '' : LINK_PROBLEM}`.trim());
      return html(
        c,
        200,
        'Upload an image',
        `<h1>Upload an image</h1>
<p>Choose the picture your AI app asked for. It goes to your StudyMe account and can then be added to a note.</p>
<form class="card" method="post" enctype="multipart/form-data">
  <label>Image (PNG, JPEG or WebP, up to ${escapeHtml(mb(deps.config.maxImageBytes))})
    <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required>
  </label>
  <button class="primary" type="submit">Upload</button>
</form>
<p class="small">This link works once and expires soon. Only open links your own AI app gave you.</p>`,
      );
    })
    .post(
      '/:token',
      bodyLimit({
        maxSize: deps.config.maxImageBytes + 64 * 1024,
        onError: (c) => message(c, 413, 'Too big', `Images can be up to ${mb(deps.config.maxImageBytes)}.`),
      }),
      async (c) => {
        const found = await pendingUpload(c.req.param('token'));
        if ('error' in found) return message(c, found.used ? 409 : 410, 'Upload link', `${found.error} ${found.used ? '' : LINK_PROBLEM}`.trim());
        const form = await c.req.parseBody().catch(() => null);
        const file = form?.image;
        if (!(file instanceof File) || file.size === 0) return message(c, 400, 'No image', 'Choose an image, then press Upload.');
        try {
          const stored = await storeImage(deps, found.link.userId, {
            id: found.link.attachmentId,
            bytes: new Uint8Array(await file.arrayBuffer()),
            fileName: file.name,
            declaredType: file.type || null,
          });
          return message(
            c,
            200,
            'Uploaded',
            `${stored.fileName} is in your StudyMe account. Go back to your AI app and tell it the image is uploaded.`,
          );
        } catch (error) {
          if (error instanceof ImageError) return message(c, error.status, 'Could not upload', error.message);
          throw error;
        }
      },
    );
}
