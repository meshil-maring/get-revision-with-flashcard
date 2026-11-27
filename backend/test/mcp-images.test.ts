import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FetchOptions } from '../src/files/fetch-image.ts';
import { ImageError } from '../src/files/images.ts';
import { removeExpiredUploads } from '../src/files/uploads.ts';
import type { SyncResponse } from '../src/sync/sync.ts';
import { createTestServer } from './helpers.ts';
import { b64, jpeg, PNG_1X1, WEBP_1X1 } from './image-fixtures.ts';
import { callTool, connect, mcp, registerClient, useServer } from './mcp-client.ts';

// The whole path of an image from an AI app to the student's devices:
// AI app → MCP upload_image → checked → object storage → attached to a note (synced row)
// → the app's next sync gets the row → the app downloads the file with a signed link.
// Only the network download of image links is replaced (fakeFetch); storage, database,
// OAuth, MCP and sync are the real ones.

const KB = 1024;

/** What the fake "internet" serves, by URL. */
const web = new Map<string, { bytes: Uint8Array; contentType: string; fileName?: string }>();
const fetched: string[] = [];
async function fakeFetch(url: string, { maxBytes }: FetchOptions) {
  fetched.push(url);
  const page = web.get(url);
  if (!page) throw new ImageError('The image link answered 404.', 502);
  if (page.bytes.length > maxBytes) throw new ImageError('Images can be up to …', 413);
  return { bytes: page.bytes, contentType: page.contentType, fileName: page.fileName ?? null };
}

let failStoragePuts = false;
let server: Awaited<ReturnType<typeof createTestServer>>;
beforeAll(async () => {
  server = await createTestServer(
    { MAX_IMAGE_MB: String(64 / 1024), IMAGE_UPLOADS_PER_HOUR: '20' }, // 64 KB images, for the size test
    {
      fetchImage: fakeFetch,
      wrapStorage: (storage) => ({
        ...storage,
        put: (key, bytes, type) => (failStoragePuts ? Promise.reject(new Error('R2 is down')) : storage.put(key, bytes, type)),
      }),
    },
  );
  useServer(server);
});
afterAll(() => server.close());

/** A signed-in student with an AI app connected: their app cookie and the AI app's token. */
async function student(email: string) {
  const { cookie, user } = await server.signUp(email);
  const token = await connect(cookie, await registerClient('ChatGPT'));
  return { cookie, token, userId: user.id };
}

async function uploadPng(token: string, bytes: Uint8Array = PNG_1X1, filename = 'diagram.png') {
  const res = await callTool(token, 'upload_image', { image_base64: b64(bytes), filename, mime_type: 'image/png' });
  expect(res.isError, res.text).toBe(false);
  return res.data as { attachment_id: string; status: string; filename: string; file_size: number };
}

async function newNote(token: string, title = 'Intersections') {
  const res = await callTool(token, 'create_note', {
    title,
    folder_path: ['Traffic Engineering'],
    body: 'Where roads meet.',
  });
  expect(res.isError, res.text).toBe(false);
  return (res.data as { noteId: string }).noteId;
}

/** What the student's device gets on a full sync, for one table. */
async function synced(cookie: string, table: string) {
  const res = await server.request('/api/sync', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ cursor: 0, changes: [] }) });
  expect(res.status).toBe(200);
  return ((await res.json()) as SyncResponse).changes.filter((c) => c.table === table);
}

/** What the app does to show an attachment: asks for a link to its remote_key, then downloads it. */
async function appDownload(cookie: string, key: string): Promise<{ status: number; bytes?: Uint8Array; type?: string | null }> {
  const res = await server.request('/api/files/download-urls', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ keys: [key] }) });
  const url = ((await res.json()) as { urls: Record<string, string> }).urls[key];
  if (!url) return { status: 404 };
  const u = new URL(url);
  const file = await server.request(u.pathname + u.search);
  return { status: file.status, bytes: new Uint8Array(await file.arrayBuffer()), type: file.headers.get('content-type') };
}

const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

describe('images through MCP', () => {
  it('needs a signed-in AI app', async () => {
    const res = await mcp(null, 'tools/call', { name: 'upload_image', arguments: { image_base64: b64(PNG_1X1) } });
    expect(res.status).toBe(401);
  });

  it('declares the ChatGPT file input the way ChatGPT expects', async () => {
    const { token } = await student('schema@example.com');
    const list = (await (await mcp(token, 'tools/list')).json()) as {
      result: { tools: { name: string; _meta?: Record<string, unknown>; inputSchema: { properties: Record<string, any> } }[] };
    };
    const upload = list.result.tools.find((t) => t.name === 'upload_image')!;
    expect(upload._meta?.['openai/fileParams']).toEqual(['image']);
    const file = upload.inputSchema.properties.image;
    expect(Object.keys(file.properties).sort()).toEqual(['download_url', 'file_id', 'file_name', 'mime_type']);
    expect([...file.required].sort()).toEqual(['download_url', 'file_id']);
  });

  it('uploads an image, attaches it to a note, and the app gets it on its next sync', async () => {
    const { cookie, token, userId } = await student('flow@example.com');
    const noteId = await newNote(token);

    const upload = await uploadPng(token, PNG_1X1, '../../Traffic Diagram.PNG');
    expect(upload).toMatchObject({ status: 'uploaded', filename: 'Traffic Diagram.png', file_size: PNG_1X1.length });

    const attached = await callTool(token, 'attach_image_to_note', {
      note_id: noteId,
      attachment_id: upload.attachment_id,
      caption: 'Figure 1: A crossroads',
      alt_text: 'Two roads crossing at right angles',
    });
    expect(attached.isError, attached.text).toBe(false);
    expect(attached.data).toMatchObject({
      noteId,
      status: 'attached',
      attachment_id: upload.attachment_id,
      filename: 'Traffic Diagram.png',
      mime_type: 'image/png',
      file_size: PNG_1X1.length,
      caption: 'Figure 1: A crossroads',
      alt_text: 'Two roads crossing at right angles',
      display_order: 1,
    });

    // The device gets an attachment row like the ones the app writes itself…
    const rows = await synced(cookie, 'note_attachments');
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({
      note_id: noteId,
      kind: 'image',
      name: 'Traffic Diagram.png',
      mime_type: 'image/png',
      remote_key: `u/${userId}/${upload.attachment_id}`,
      caption: 'Figure 1: A crossroads',
      alt_text: 'Two roads crossing at right angles',
      deleted_at: null,
    });
    // …and downloads the very same bytes.
    const download = await appDownload(cookie, rows[0].data.remote_key as string);
    expect(download.status).toBe(200);
    expect(download.type).toBe('image/png');
    expect(download.bytes).toEqual(new Uint8Array(PNG_1X1));
  });

  it('uploads several images (PNG, JPEG, WebP) and makes a note with them in order', async () => {
    const { cookie, token } = await student('many@example.com');
    const a = await uploadPng(token);
    const b = (await callTool(token, 'upload_image', { image_base64: `data:image/jpeg;base64,${b64(jpeg(800, 600))}` })).data;
    const c = (await callTool(token, 'upload_image', { image_base64: b64(WEBP_1X1), filename: 'third' })).data;
    expect([b.mime_type, b.width, b.height]).toEqual(['image/jpeg', 800, 600]);
    expect([c.mime_type, c.filename]).toEqual(['image/webp', 'third.webp']);

    const created = await callTool(token, 'create_note_with_images', {
      title: 'Signals',
      folder_path: ['Traffic Engineering', 'Intersections'],
      body: 'Phases and timing.',
      tags: ['traffic'],
      good_to_know: ['Signals separate conflicting movements in time.'],
      images: [
        { attachment_id: c.attachment_id, caption: 'First' },
        { attachment_id: a.attachment_id, caption: 'Second' },
        { attachment_id: b.attachment_id, caption: 'Third', alt_text: 'A signal head' },
      ],
    });
    expect(created.isError, created.text).toBe(false);
    expect(created.data.folder).toBe('Traffic Engineering / Intersections');
    expect(created.data.attachments.map((x: { caption: string }) => x.caption)).toEqual(['First', 'Second', 'Third']);

    const list = await callTool(token, 'list_note_attachments', { note_id: created.data.noteId });
    expect(list.isError, list.text).toBe(false);
    const attachments = list.data.attachments as { attachment_id: string; display_order: number; display_url: string; file_size: number }[];
    expect(attachments.map((x) => x.attachment_id)).toEqual([c.attachment_id, a.attachment_id, b.attachment_id]);
    expect(attachments.map((x) => x.display_order)).toEqual([1, 2, 3]);
    expect(attachments[1].file_size).toBe(PNG_1X1.length);
    // The display link works, and only for a while.
    const view = await server.request(pathOf(attachments[1].display_url));
    expect(view.status).toBe(200);
    expect(new Uint8Array(await view.arrayBuffer())).toEqual(new Uint8Array(PNG_1X1));
    expect(list.data.linksExpireInSeconds).toBeGreaterThan(0);

    const rows = (await synced(cookie, 'note_attachments')).map((r) => r.data);
    expect(rows.map((r) => r.position).sort()).toEqual([0, 1, 2]);
  });

  it('makes no note at all when one of its images is missing', async () => {
    const { token } = await student('atomic@example.com');
    const good = await uploadPng(token);
    const res = await callTool(token, 'create_note_with_images', {
      title: 'Half done',
      body: 'Text',
      images: [{ attachment_id: good.attachment_id }, { attachment_id: '00000000-0000-0000-0000-000000000000' }],
    });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/No uploaded image/);
    expect((await callTool(token, 'list_notes', {})).data).toEqual([]);
  });

  it('does not attach the same image to a note twice', async () => {
    const { cookie, token } = await student('twice@example.com');
    const noteId = await newNote(token);
    const image = await uploadPng(token);
    await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id: image.attachment_id });
    const again = await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id: image.attachment_id, caption: 'Better caption' });
    expect(again.data).toMatchObject({ status: 'already attached', caption: 'Better caption', display_order: 1 });
    const rows = await synced(cookie, 'note_attachments');
    expect(rows).toHaveLength(1);
    expect(rows[0].data.caption).toBe('Better caption');
  });

  it('removes an attachment, keeping the file while another note still uses it', async () => {
    const { cookie, token, userId } = await student('remove@example.com');
    const first = await newNote(token, 'First');
    const second = await newNote(token, 'Second');
    const image = await uploadPng(token);
    const key = `u/${userId}/${image.attachment_id}`;
    await callTool(token, 'attach_image_to_note', { note_id: first, attachment_id: image.attachment_id });
    await callTool(token, 'attach_image_to_note', { note_id: second, attachment_id: image.attachment_id });

    const off1 = await callTool(token, 'remove_note_attachment', { note_id: first, attachment_id: image.attachment_id });
    expect(off1.data).toMatchObject({ removed: true, fileDeleted: false });
    expect((await appDownload(cookie, key)).status).toBe(200);
    expect((await callTool(token, 'list_note_attachments', { note_id: first })).data.attachments).toEqual([]);

    const off2 = await callTool(token, 'remove_note_attachment', { note_id: second, attachment_id: image.attachment_id });
    expect(off2.data).toMatchObject({ removed: true, fileDeleted: true });
    expect((await appDownload(cookie, key)).status).toBe(404);
    expect(await server.storage.size(key)).toBeNull();

    // The devices hear about both removals.
    const rows = await synced(cookie, 'note_attachments');
    expect(rows.every((r) => r.data.deleted_at !== null)).toBe(true);

    const gone = await callTool(token, 'remove_note_attachment', { note_id: second, attachment_id: image.attachment_id });
    expect(gone.isError).toBe(true);
  });

  it("keeps an image the app deletes from one note while another note still uses it", async () => {
    const { cookie, token, userId } = await student('app-delete@example.com');
    const first = await newNote(token, 'First');
    const second = await newNote(token, 'Second');
    const image = await uploadPng(token);
    const key = `u/${userId}/${image.attachment_id}`;
    await callTool(token, 'attach_image_to_note', { note_id: first, attachment_id: image.attachment_id });
    await callTool(token, 'attach_image_to_note', { note_id: second, attachment_id: image.attachment_id });
    const row = (await synced(cookie, 'note_attachments')).find((r) => r.data.note_id === first)!;

    // The student deletes it from the first note in the app.
    const later = new Date(Date.now() + 1000).toISOString();
    await server.request('/api/sync', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ cursor: 0, changes: [{ table: 'note_attachments', id: row.id, data: { ...row.data, deleted_at: later }, modifiedAt: later }] }),
    });
    expect((await appDownload(cookie, key)).status).toBe(200);
  });
});

describe('what upload_image turns away', () => {
  it('a file that is not really an image, whatever it says it is', async () => {
    const { token } = await student('fake@example.com');
    const html = new TextEncoder().encode('<html><body>hi</body></html>');
    const res = await callTool(token, 'upload_image', { image_base64: b64(html), filename: 'cat.png', mime_type: 'image/png' });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/not a PNG, JPEG or WebP/);
  });

  it('types other than PNG, JPEG and WebP', async () => {
    const { token } = await student('mime@example.com');
    const res = await callTool(token, 'upload_image', { image_base64: b64(PNG_1X1), mime_type: 'image/svg+xml' });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/Only PNG, JPEG and WebP/);
  });

  it('images over the size limit', async () => {
    const { token } = await student('big@example.com');
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(65 * KB)]);
    const res = await callTool(token, 'upload_image', { image_base64: b64(big) });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/up to/);
  });

  it('bad base64, and more than one source at once', async () => {
    const { token } = await student('bad-input@example.com');
    expect((await callTool(token, 'upload_image', { image_base64: 'not base64!!' })).text).toMatch(/not valid base64/);
    const both = await callTool(token, 'upload_image', { image_base64: b64(PNG_1X1), image_url: 'https://example.com/a.png' });
    expect(both.text).toMatch(/one way only/);
  });

  it('when storage fails, saying so and keeping nothing', async () => {
    const { token } = await student('storage@example.com');
    failStoragePuts = true;
    try {
      const res = await callTool(token, 'upload_image', { image_base64: b64(PNG_1X1) });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/could not be saved/);
      expect(res.text).not.toMatch(/R2/); // no storage details for the AI app
    } finally {
      failStoragePuts = false;
    }
  });

  it('too many uploads in an hour', async () => {
    const { token } = await student('rate@example.com');
    for (let i = 0; i < 20; i++) await uploadPng(token);
    const res = await callTool(token, 'upload_image', { image_base64: b64(PNG_1X1) });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/Too many images/);
  });
});

describe('getting the image from the AI app', () => {
  it('downloads a ChatGPT file (fileParams) and an image link, trusting the bytes over the type', async () => {
    const { token } = await student('links@example.com');
    web.set('https://files.oaiusercontent.com/file-abc?sig=1', { bytes: jpeg(32, 16), contentType: 'application/octet-stream' });
    const chatgpt = await callTool(token, 'upload_image', {
      image: { download_url: 'https://files.oaiusercontent.com/file-abc?sig=1', file_id: 'file-abc', file_name: 'IMG_0042.jpeg' },
    });
    expect(chatgpt.isError, chatgpt.text).toBe(false);
    expect(chatgpt.data).toMatchObject({ filename: 'IMG_0042.jpg', mime_type: 'image/jpeg', width: 32, height: 16 });
    expect(fetched).toContain('https://files.oaiusercontent.com/file-abc?sig=1');

    web.set('https://upload.wikimedia.org/roundabout.png', { bytes: PNG_1X1, contentType: 'image/png', fileName: 'roundabout.png' });
    const link = await callTool(token, 'upload_image', { image_url: 'https://upload.wikimedia.org/roundabout.png' });
    expect(link.data).toMatchObject({ filename: 'roundabout.png', mime_type: 'image/png' });

    const missing = await callTool(token, 'upload_image', { image_url: 'https://example.com/nothing.png' });
    expect(missing.isError).toBe(true);
  });

  it('gives a one-time upload page when the AI app cannot pass the image (Claude)', async () => {
    const { token, cookie } = await student('page@example.com');
    const noteId = await newNote(token);
    const link = await callTool(token, 'upload_image', { filename: 'whiteboard' });
    expect(link.data.status).toBe('waiting for the user to upload');
    const { attachment_id, upload_url } = link.data as { attachment_id: string; upload_url: string };

    // Before the student uploads, attaching says what to do.
    const early = await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id });
    expect(early.text).toMatch(/not been uploaded yet/);

    const page = await server.app.request(pathOf(upload_url));
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await page.text()).toContain('type="file"');

    const form = new FormData();
    form.append('image', new File([new Uint8Array(PNG_1X1)], 'IMG_1.png', { type: 'image/png' }));
    const posted = await server.app.request(pathOf(upload_url), { method: 'POST', body: form });
    expect(posted.status, await posted.clone().text()).toBe(200);

    const attached = await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id });
    expect(attached.isError, attached.text).toBe(false);
    expect(attached.data.filename).toBe('IMG_1.png');
    const row = (await synced(cookie, 'note_attachments'))[0];
    expect((await appDownload(cookie, row.data.remote_key as string)).status).toBe(200);

    // The link works once.
    const again = new FormData();
    again.append('image', new File([new Uint8Array(PNG_1X1)], 'IMG_2.png', { type: 'image/png' }));
    expect((await server.app.request(pathOf(upload_url), { method: 'POST', body: again })).status).toBe(409);
    // A changed link does nothing.
    expect((await server.app.request(`${pathOf(upload_url)}x`)).status).toBe(410);
  });

  it('turns away a non-image on the upload page', async () => {
    const { token } = await student('page-bad@example.com');
    const { upload_url } = (await callTool(token, 'upload_image', {})).data as { upload_url: string };
    const form = new FormData();
    form.append('image', new File(['<svg onload=alert(1)>'], 'x.png', { type: 'image/png' }));
    const res = await server.app.request(pathOf(upload_url), { method: 'POST', body: form });
    expect(res.status).toBe(415);
  });
});

describe("other users' images and notes", () => {
  it('cannot be reached, attached, listed or removed', async () => {
    const alice = await student('alice@example.com');
    const bob = await student('bob@example.com');
    const aliceNote = await newNote(alice.token, 'Alice note');
    const bobNote = await newNote(bob.token, 'Bob note');
    const aliceImage = await uploadPng(alice.token);
    await callTool(alice.token, 'attach_image_to_note', { note_id: aliceNote, attachment_id: aliceImage.attachment_id });
    const bobImage = await uploadPng(bob.token);

    // Bob can't use Alice's image, even knowing its id…
    const steal = await callTool(bob.token, 'attach_image_to_note', { note_id: bobNote, attachment_id: aliceImage.attachment_id });
    expect(steal.isError).toBe(true);
    expect(steal.text).toMatch(/No uploaded image/);
    // …or put his image on Alice's note, list it, or remove from it.
    const intrude = await callTool(bob.token, 'attach_image_to_note', { note_id: aliceNote, attachment_id: bobImage.attachment_id });
    expect(intrude.text).toMatch(/No note/);
    expect((await callTool(bob.token, 'list_note_attachments', { note_id: aliceNote })).text).toMatch(/No note/);
    expect((await callTool(bob.token, 'remove_note_attachment', { note_id: aliceNote, attachment_id: aliceImage.attachment_id })).text).toMatch(/No note/);
    // Nor can his app download it.
    expect((await appDownload(bob.cookie, `u/${alice.userId}/${aliceImage.attachment_id}`)).status).toBe(404);
    // Alice's is untouched.
    expect((await callTool(alice.token, 'list_note_attachments', { note_id: aliceNote })).data.attachments).toHaveLength(1);
  });

  it('a note that does not exist', async () => {
    const { token } = await student('nonote@example.com');
    const image = await uploadPng(token);
    const res = await callTool(token, 'attach_image_to_note', { note_id: 'no-such-note', attachment_id: image.attachment_id });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/No note with id/);
  });
});

describe('unattached uploads', () => {
  it('are removed after they expire; attached ones are kept', async () => {
    const { token, userId } = await student('expire@example.com');
    const noteId = await newNote(token);
    const kept = await uploadPng(token);
    const dropped = await uploadPng(token);
    await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id: kept.attachment_id });

    const tomorrow = new Date(Date.now() + 25 * 3600_000);
    expect(await removeExpiredUploads(server.db, server.storage, tomorrow)).toBeGreaterThanOrEqual(1);
    expect(await server.storage.size(`u/${userId}/${dropped.attachment_id}`)).toBeNull();
    expect(await server.storage.size(`u/${userId}/${kept.attachment_id}`)).toBe(PNG_1X1.length);

    const late = await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id: dropped.attachment_id });
    expect(late.isError).toBe(true);
    expect(late.text).toMatch(/No uploaded image/);
  });
});

describe('images inside Cornell rows', () => {
  const cornell = {
    title: 'Intersections',
    style: 'cornell',
    folder_path: ['Traffic Engineering'],
    cornell_rows: [
      { cue: 'What is it?', notes: '- Where two or more roads meet' },
      { cue: 'Layout?', notes: '- Four arms\n- Conflict points' },
      { cue: 'Control?', notes: '- Signals or roundabouts' },
    ],
    summary: 'Intersections are where most conflicts happen.',
  };
  const rowsOf = async (token: string, noteId: string) =>
    (await callTool(token, 'get_note', { note_id: noteId })).data.cornellRows as { cue: string; notes: string }[];

  it('makes a Cornell note with each image inside the row it explains', async () => {
    const { token } = await student('cornell-new@example.com');
    const layout = await uploadPng(token);
    const extra = await uploadPng(token);
    const res = await callTool(token, 'create_note_with_images', {
      ...cornell,
      images: [
        { attachment_id: layout.attachment_id, caption: 'Figure 1: Layout', cornell_row: 2 },
        { attachment_id: extra.attachment_id, caption: 'More' },
      ],
    });
    expect(res.isError, res.text).toBe(false);
    expect(res.data.attachments.map((a: { shown: string }) => a.shown)).toEqual(['cornell row 2', 'after the note']);

    const rows = await rowsOf(token, res.data.noteId);
    expect(rows[1].notes).toBe(`- Four arms\n- Conflict points\n\n:::image ${layout.attachment_id}`);
    expect(rows[0].notes).not.toContain(':::image');

    const list = await callTool(token, 'list_note_attachments', { note_id: res.data.noteId });
    expect(list.data.attachments.map((a: { shown: string }) => a.shown)).toEqual(['cornell row 2', 'after the note']);
  });

  it('puts an image into a row of an existing note, and moves it to another row', async () => {
    const { token } = await student('cornell-attach@example.com');
    const noteId = (await callTool(token, 'create_note', cornell)).data.noteId;
    const image = await uploadPng(token);

    const first = await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id: image.attachment_id, cornell_row: 2 });
    expect(first.data).toMatchObject({ status: 'attached', shown: 'cornell row 2' });
    expect((await rowsOf(token, noteId))[1].notes).toContain(`:::image ${image.attachment_id}`);

    const moved = await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id: image.attachment_id, cornell_row: 3 });
    expect(moved.data).toMatchObject({ status: 'already attached', shown: 'cornell row 3' });
    const rows = await rowsOf(token, noteId);
    expect(rows[1].notes).toBe('- Four arms\n- Conflict points');
    expect(rows[2].notes).toBe(`- Signals or roundabouts\n\n:::image ${image.attachment_id}`);
  });

  it('takes the image out of its row when it is removed', async () => {
    const { token } = await student('cornell-remove@example.com');
    const noteId = (await callTool(token, 'create_note', cornell)).data.noteId;
    const image = await uploadPng(token);
    await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id: image.attachment_id, cornell_row: 1 });

    await callTool(token, 'remove_note_attachment', { note_id: noteId, attachment_id: image.attachment_id });
    expect((await rowsOf(token, noteId))[0].notes).toBe('- Where two or more roads meet');
  });

  it('turns away a row that is not there, or a row on a plain note, saving nothing', async () => {
    const { cookie, token } = await student('cornell-bad@example.com');
    const noteId = (await callTool(token, 'create_note', cornell)).data.noteId;
    const plainId = await newNote(token, 'Plain');
    const image = await uploadPng(token);

    const tooFar = await callTool(token, 'attach_image_to_note', { note_id: noteId, attachment_id: image.attachment_id, cornell_row: 9 });
    expect(tooFar.text).toMatch(/3 Cornell rows, so there is no row 9/);
    const plain = await callTool(token, 'attach_image_to_note', { note_id: plainId, attachment_id: image.attachment_id, cornell_row: 1 });
    expect(plain.text).toMatch(/only for Cornell notes/);
    expect(await synced(cookie, 'note_attachments')).toEqual([]);
  });

  it('shows an image where a plain note writes its line, and refuses a line for an image it lacks', async () => {
    const { token } = await student('plain-inline@example.com');
    const image = await uploadPng(token);
    const ok = await callTool(token, 'create_note_with_images', {
      title: 'Roundabouts',
      body: `Traffic goes one way round.\n:::image ${image.attachment_id}\nGive way to the right.`,
      images: [{ attachment_id: image.attachment_id }],
    });
    expect(ok.isError, ok.text).toBe(false);
    expect(ok.data.attachments[0].shown).toBe('in the body');

    const before = (await callTool(token, 'list_notes', {})).data.length;
    const bad = await callTool(token, 'create_note_with_images', {
      title: 'Broken',
      body: ':::image 11111111-2222-3333-4444-555555555555',
      images: [{ attachment_id: (await uploadPng(token)).attachment_id }],
    });
    expect(bad.text).toMatch(/not in images/);
    expect((await callTool(token, 'list_notes', {})).data.length).toBe(before);
  });
});
