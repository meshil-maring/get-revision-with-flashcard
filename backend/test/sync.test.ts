import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Change, SyncResponse } from '../src/sync/sync.ts';
import { createTestServer } from './helpers.ts';

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeAll(async () => {
  server = await createTestServer();
});
afterAll(() => server.close());

async function sync(cookie: string, cursor: number, changes: Change[] = []) {
  const res = await server.request('/api/sync', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ cursor, changes }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

const deck = (id: string, name: string, modifiedAt: string): Change => ({
  table: 'decks',
  id,
  data: { id, name, description: '' },
  modifiedAt,
});

describe('sync', () => {
  it('needs a signed-in user', async () => {
    const res = await server.request('/api/sync', { method: 'POST', body: JSON.stringify({ cursor: 0, changes: [] }) });
    expect(res.status).toBe(401);
  });

  it('rejects unknown tables', async () => {
    const { cookie } = await server.signUp('bad@example.com');
    const res = await server.request('/api/sync', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ cursor: 0, changes: [{ table: 'user', id: 'x', data: {}, modifiedAt: new Date().toISOString() }] }),
    });
    expect(res.status).toBe(400);
  });

  it("sends one device's changes to another device", async () => {
    const { cookie } = await server.signUp('two-phones@example.com');
    const phone = await sync(cookie, 0, [deck('d1', 'Physics', '2026-11-25T10:00:00.000Z')]);
    expect(phone.changes).toHaveLength(1);

    const tablet = await sync(cookie, 0);
    expect(tablet.changes).toEqual([deck('d1', 'Physics', '2026-11-25T10:00:00.000Z')]);

    // Nothing new after the cursor.
    expect((await sync(cookie, tablet.cursor)).changes).toEqual([]);
  });

  it('keeps the newest change and returns the winner to a device that sent an older one', async () => {
    const { cookie } = await server.signUp('conflict@example.com');
    const first = await sync(cookie, 0, [deck('d1', 'New name', '2026-11-25T12:00:00.000Z')]);

    const stale = await sync(cookie, first.cursor, [deck('d1', 'Old name', '2026-11-25T11:00:00.000Z')]);
    expect(stale.changes).toEqual([deck('d1', 'New name', '2026-11-25T12:00:00.000Z')]);

    const fresh = await sync(cookie, 0);
    expect(fresh.changes.map((c) => c.data.name)).toEqual(['New name']);
  });

  it("keeps each user's data separate, even with the same ids", async () => {
    const a = await server.signUp('a@example.com');
    const b = await server.signUp('b@example.com');
    await sync(a.cookie, 0, [deck('same-id', 'A deck', '2026-11-25T10:00:00.000Z')]);
    await sync(b.cookie, 0, [deck('same-id', 'B deck', '2026-11-25T09:00:00.000Z')]);

    expect((await sync(a.cookie, 0)).changes.map((c) => c.data.name)).toEqual(['A deck']);
    expect((await sync(b.cookie, 0)).changes.map((c) => c.data.name)).toEqual(['B deck']);
  });

  it('pages large downloads', async () => {
    const { cookie } = await server.signUp('lots@example.com');
    const changes = Array.from({ length: 1000 }, (_, i) => deck(`d${i}`, `Deck ${i}`, '2026-11-25T10:00:00.000Z'));
    await sync(cookie, 0, changes);
    await sync(cookie, 0, [deck('last', 'Last', '2026-11-25T10:00:00.000Z')]);

    const page1 = await sync(cookie, 0);
    expect(page1.changes).toHaveLength(1000);
    expect(page1.more).toBe(true);
    const page2 = await sync(cookie, page1.cursor);
    expect(page2.changes.map((c) => c.id)).toEqual(['last']);
    expect(page2.more).toBe(false);
  });
});
