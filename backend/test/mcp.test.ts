import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SyncResponse } from '../src/sync/sync.ts';
import { createTestServer } from './helpers.ts';
import {
  authorizeUrl,
  BASE,
  base64url,
  callTool,
  connect,
  mcp,
  MCP_URL,
  oauthQueryOf,
  redirectUrl,
  registerClient,
  useServer,
} from './mcp-client.ts';

// The whole path an AI app (ChatGPT, Claude) takes: discover → register → user signs in and
// allows → token → MCP tool calls → the data reaches the user's devices through sync.

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeAll(async () => {
  server = await createTestServer();
  useServer(server);
});
afterAll(() => server.close());

describe('MCP discovery', () => {
  it('turns away a call without a token, pointing to the resource metadata', async () => {
    const res = await mcp(null, 'tools/list');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource');
  });

  it('publishes the protected resource metadata', async () => {
    const res = await server.app.request(`${BASE}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resource: string; authorization_servers: string[] };
    expect(body.resource).toBe(MCP_URL);
    expect(body.authorization_servers).toEqual([`${BASE}/api/auth`]);
  });

  it('publishes the authorization server metadata at the RFC 8414 path', async () => {
    const res = await server.app.request(`${BASE}/.well-known/oauth-authorization-server/api/auth`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe(`${BASE}/api/auth`);
    expect(body.registration_endpoint).toBe(`${BASE}/api/auth/oauth2/register`);
    expect(body.authorization_endpoint).toBe(`${BASE}/api/auth/oauth2/authorize`);
    expect(body.token_endpoint).toBe(`${BASE}/api/auth/oauth2/token`);
  });
});

describe('connecting an AI app', () => {
  it('sends a signed-out user to the sign-in page, then on to consent after signing in', async () => {
    const clientId = await registerClient();
    const { cookie } = await server.signUp('signed-out@example.com');
    void cookie;
    const verifier = base64url(randomBytes(32));
    const authorize = await server.request(authorizeUrl(clientId, verifier));
    const signInLocation = await redirectUrl(authorize);
    expect(signInLocation).toContain('/oauth/sign-in');

    const page = await server.request(new URL(signInLocation, BASE).pathname + new URL(signInLocation, BASE).search);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('ChatGPT');

    const signIn = await server.request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({
        email: 'signed-out@example.com',
        password: 'correct-horse-battery',
        oauth_query: oauthQueryOf(signInLocation),
      }),
    });
    expect(signIn.status, await signIn.clone().text()).toBe(200);
    expect(await redirectUrl(signIn)).toContain('/oauth/consent');
  });

  it('lets the AI app read and add decks, cards and notes for that user only', async () => {
    const clientId = await registerClient('ChatGPT');
    const { cookie } = await server.signUp('student@example.com');
    const token = await connect(cookie, clientId);

    const tools = (await (await mcp(token, 'tools/list')).json()) as { result: { tools: { name: string }[] } };
    // /health lists the same tools, to check a deploy without signing in.
    const health = (await (await server.app.request('/health')).json()) as { mcpTools: string[] };
    expect([...health.mcpTools].sort()).toEqual(tools.result.tools.map((t) => t.name).sort());
    expect(tools.result.tools.map((t) => t.name).sort()).toEqual(
      [
        'add_cards',
        'add_good_to_know',
        'create_deck',
        'create_note',
        'get_deck',
        'get_note',
        'list_decks',
        'list_folders',
        'list_notes',
        'upload_image',
        'attach_image_to_note',
        'create_note_with_images',
        'list_note_attachments',
        'remove_note_attachment',
      ].sort(),
    );

    const deck = await callTool(token, 'create_deck', {
      name: 'Cell Biology',
      description: 'Organelles',
      cards: [
        { front: 'Powerhouse of the cell?', back: '**Mitochondria**' },
        { front: 'Where is DNA kept?', back: 'The nucleus' },
      ],
    });
    expect(deck.data).toMatchObject({ name: 'Cell Biology', cardsAdded: 2 });
    const added = await callTool(token, 'add_cards', {
      deck_id: deck.data.deckId,
      cards: [{ front: 'What makes proteins?', back: 'Ribosomes' }],
    });
    expect(added.data.cardsAdded).toBe(1);
    expect((await callTool(token, 'list_decks')).data).toEqual([
      { id: deck.data.deckId, name: 'Cell Biology', description: 'Organelles', cardCount: 3 },
    ]);
    const full = await callTool(token, 'get_deck', { deck_id: deck.data.deckId });
    expect(full.data.cards.map((c: { front: string }) => c.front)).toEqual([
      'Powerhouse of the cell?',
      'Where is DNA kept?',
      'What makes proteins?',
    ]);

    const note = await callTool(token, 'create_note', {
      title: 'Photosynthesis',
      folder_path: ['Class 10', 'Biology'],
      style: 'cornell',
      cornell_rows: [{ cue: 'What is made?', notes: 'Glucose and oxygen' }],
      summary: 'Plants turn light into food.',
      tags: ['Exam', 'exam', 'Plants'],
    });
    expect(note.data).toMatchObject({ folder: 'Class 10 / Biology', tags: ['Exam', 'Plants'] });
    // A second note in the same folder reuses it (names match ignoring case) and the "exam" tag.
    await callTool(token, 'create_note', {
      title: 'Respiration',
      folder_path: ['class 10', 'BIOLOGY'],
      body: '# Respiration\n- Glucose + oxygen → energy',
      tags: ['EXAM'],
    });
    expect((await callTool(token, 'list_folders')).data.map((f: { path: string }) => f.path)).toEqual([
      'Class 10',
      'Class 10 / Biology',
    ]);
    const examNotes = (await callTool(token, 'list_notes', { tag: 'exam' })).data;
    expect(examNotes.map((n: { title: string }) => n.title)).toEqual(['Photosynthesis', 'Respiration']);
    expect(examNotes[0]).toMatchObject({ folder: 'Class 10 / Biology', createdBy: 'ChatGPT' });
    expect((await callTool(token, 'list_notes', { search: 'GLUCOSE AND' })).data).toHaveLength(1);
    const read = await callTool(token, 'get_note', { note_id: note.data.noteId });
    expect(read.data).toMatchObject({
      style: 'cornell',
      cornellRows: [{ cue: 'What is made?', notes: 'Glucose and oxygen' }],
      summary: 'Plants turn light into food.',
    });

    const missing = await callTool(token, 'add_cards', { deck_id: 'nope', cards: [{ front: 'a', back: 'b' }] });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('list_decks');

    // The app gets it all on its next sync, as rows shaped like its own SQLite tables.
    const sync = await server.request('/api/sync', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ cursor: 0, changes: [] }),
    });
    const { changes } = (await sync.json()) as SyncResponse;
    const count = (table: string) => changes.filter((c) => c.table === table).length;
    expect([count('decks'), count('cards'), count('folders'), count('notes'), count('tags'), count('note_tags')]).toEqual([
      1, 3, 2, 2, 2, 3,
    ]);
    const savedNote = changes.find((c) => c.table === 'notes' && c.id === note.data.noteId)!.data;
    expect(savedNote).toMatchObject({ style: 'cornell', created_by: 'ChatGPT', deleted_at: null });
    expect(JSON.parse(savedNote.cornell_rows as string)).toEqual([{ cue: 'What is made?', notes: 'Glucose and oxygen' }]);
    expect(changes.find((c) => c.table === 'note_tags')!.id).toMatch(/^[\w-]+:[\w-]+$/);

    // Another user's token sees none of it.
    const other = await server.signUp('someone-else@example.com');
    const otherToken = await connect(other.cookie, clientId);
    expect((await callTool(otherToken, 'list_decks')).data).toEqual([]);
  });

  it('keeps diagrams and boxes in Cornell notes, cleaning the SVG, and turns away a broken diagram', async () => {
    const clientId = await registerClient('Claude');
    const { cookie } = await server.signUp('diagrams@example.com');
    const token = await connect(cookie, clientId);

    const note = await callTool(token, 'create_note', {
      title: 'Rotary Traffic Management',
      style: 'cornell',
      cornell_rows: [
        {
          cue: 'What are the main components?',
          notes: ':::diagram Parts of a rotary\n<svg viewBox="0 0 400 300" onload="x()"><circle r="50"/></svg>\n:::',
        },
        { cue: 'Advantages?', notes: ':::good Advantages\n- Smooth flow\n:::' },
      ],
      summary: 'A large circular intersection.',
      good_to_know: ['Traffic moves one way round a central island.'],
    });
    expect(note.isError).toBe(false);
    const read = await callTool(token, 'get_note', { note_id: note.data.noteId });
    expect(read.data.cornellRows[0].notes).toBe(
      ':::diagram Parts of a rotary\n<svg viewBox="0 0 400 300"><circle r="50"/></svg>\n:::',
    );
    expect(read.data.cornellRows[1].notes).toBe(':::good Advantages\n- Smooth flow\n:::');

    const broken = await callTool(token, 'create_note', {
      title: 'Broken',
      body: ':::diagram Half a drawing\n<svg><circle r="5"/>\n:::',
    });
    expect(broken.isError).toBe(true);
    expect(broken.text).toMatch(/no complete <svg>/);
  });

  it('lets the AI app sort cards into groups inside a deck, reusing groups by name', async () => {
    const clientId = await registerClient('Claude');
    const { cookie } = await server.signUp('grouper@example.com');
    const token = await connect(cookie, clientId);

    const deck = await callTool(token, 'create_deck', {
      name: 'Physics',
      cards: [
        { front: 'Unit of force?', back: 'Newton', group: 'Chapter 1' },
        { front: 'F = ?', back: 'ma', group: 'Formulas' },
        { front: 'Who wrote Principia?', back: 'Newton' },
      ],
    });
    expect(deck.data).toMatchObject({ cardsAdded: 3, groupsMade: ['Chapter 1', 'Formulas'] });

    const added = await callTool(token, 'add_cards', {
      deck_id: deck.data.deckId,
      cards: [
        { front: 'Unit of energy?', back: 'Joule', group: 'chapter 1' }, // same group, other case
        { front: 'p = ?', back: 'mv', group: 'Momentum' },
      ],
    });
    expect(added.data).toMatchObject({ cardsAdded: 2, groupsMade: ['Momentum'] });

    const full = await callTool(token, 'get_deck', { deck_id: deck.data.deckId });
    expect(full.data.groups).toEqual(['Chapter 1', 'Formulas', 'Momentum']);
    expect(full.data.cards.map((c: { front: string; group?: string }) => [c.front, c.group])).toEqual([
      ['Unit of force?', 'Chapter 1'],
      ['F = ?', 'Formulas'],
      ['Who wrote Principia?', undefined],
      ['Unit of energy?', 'Chapter 1'],
      ['p = ?', 'Momentum'],
    ]);

    // The app gets the groups as card_groups rows, and each card's group_id.
    const sync = await server.request('/api/sync', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ cursor: 0, changes: [] }),
    });
    const { changes } = (await sync.json()) as SyncResponse;
    const groups = changes.filter((c) => c.table === 'card_groups').map((c) => c.data);
    expect(groups.map((g) => [g.name, g.position, g.deck_id])).toEqual([
      ['Chapter 1', 0, deck.data.deckId],
      ['Formulas', 1, deck.data.deckId],
      ['Momentum', 2, deck.data.deckId],
    ]);
    const chapter1 = groups[0].id;
    const cards = changes.filter((c) => c.table === 'cards').map((c) => c.data);
    expect(cards.filter((c) => c.group_id === chapter1).map((c) => c.front)).toEqual(['Unit of force?', 'Unit of energy?']);
    expect(cards.find((c) => c.front === 'Who wrote Principia?')!.group_id).toBeNull();
  });

  it("collects each note's key points in its folder's Good to know note", async () => {
    const clientId = await registerClient('Claude');
    const { cookie } = await server.signUp('good-to-know@example.com');
    const token = await connect(cookie, clientId);
    const folder_path = ['Traffic', 'Unit 1'];

    const first = await callTool(token, 'create_note', {
      title: 'Traffic Management',
      folder_path,
      body: 'Planning and guiding traffic.',
      good_to_know: ['Aim: safe, smooth, easy travel', '- Safety comes first'],
    });
    expect(first.data.goodToKnow).toBe('created');
    const second = await callTool(token, 'create_note', {
      title: 'Level of Service',
      folder_path,
      body: 'Grades A to F.',
      good_to_know: ['LOS grades traffic from A (free) to F (breakdown)'],
    });
    expect(second.data.goodToKnow).toBe('added');
    // Rewriting a topic replaces its points instead of listing them twice.
    await callTool(token, 'create_note', {
      title: 'traffic management',
      folder_path,
      body: 'Planning, controlling and guiding traffic.',
      good_to_know: ['Aim: safe, smooth, easy travel for everyone'],
    });
    // A note without key points leaves it alone, and says so.
    const plain = await callTool(token, 'create_note', { title: 'Extra', folder_path, body: 'More.' });
    expect(plain.data.goodToKnow).toContain('not added');

    const inFolder = (await callTool(token, 'list_notes', { folder_path })).data as { id: string; title: string }[];
    const summaries = inFolder.filter((n) => n.title === 'Good to know');
    expect(summaries).toHaveLength(1);
    const summary = await callTool(token, 'get_note', { note_id: summaries[0].id });
    expect(summary.data.body).toBe(
      // The rewritten topic keeps its place, under the newest title.
      '## traffic management\n- Aim: safe, smooth, easy travel for everyone\n\n' +
        '## Level of Service\n- LOS grades traffic from A (free) to F (breakdown)',
    );

    // Notes written before Good to know existed can be added afterwards, at the top level too.
    const older = await callTool(token, 'add_good_to_know', {
      folder_path: [],
      topics: [
        { topic: 'Road Signs', points: ['Signs warn, guide and regulate'] },
        { topic: 'Highway Capacity', points: ['Most vehicles a road can carry per hour'] },
      ],
    });
    expect(older.data).toMatchObject({ folder: '(top level)', status: 'created', topics: 2 });
    const top = (await callTool(token, 'list_notes', {})).data as { id: string; title: string; folder: string }[];
    const topSummary = top.find((n) => n.title === 'Good to know' && n.folder === '')!;
    expect((await callTool(token, 'get_note', { note_id: topSummary.id })).data.body).toBe(
      '## Road Signs\n- Signs warn, guide and regulate\n\n## Highway Capacity\n- Most vehicles a road can carry per hour',
    );
    const missingFolder = await callTool(token, 'add_good_to_know', {
      folder_path: ['Nope'],
      topics: [{ topic: 'A', points: ['b'] }],
    });
    expect(missingFolder.isError).toBe(true);
    expect(missingFolder.text).toContain('list_folders');

    // The AI can't make its own "Good to know" note.
    const own = await callTool(token, 'create_note', { title: 'Good to Know', folder_path, body: 'x' });
    expect(own.isError).toBe(true);
    expect(own.text).toContain('good_to_know');
  });

  it('still gives a usable token when the AI app leaves out the resource', async () => {
    const clientId = await registerClient('Claude');
    const { cookie } = await server.signUp('no-resource@example.com');
    const token = await connect(cookie, clientId, false);
    expect((await callTool(token, 'list_decks')).data).toEqual([]);
  });

  it('lets local tools like the MCP Inspector register with a localhost callback', async () => {
    const res = await server.request('/api/auth/oauth2/register', {
      method: 'POST',
      body: JSON.stringify({
        client_name: 'MCP Inspector',
        redirect_uris: ['http://localhost:6274/oauth/callback'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(res.status, await res.clone().text()).toBeLessThan(300);
  });

  it('lets a browser-based client (MCP Inspector) register and get tokens, but not use the app API', async () => {
    const inspector = 'http://127.0.0.1:6274';
    const preflight = (path: string) =>
      server.app.request(`${BASE}${path}`, {
        method: 'OPTIONS',
        headers: { Origin: inspector, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      });
    for (const path of ['/api/auth/oauth2/register', '/api/auth/oauth2/token', '/mcp', '/.well-known/oauth-protected-resource/mcp']) {
      expect((await preflight(path)).headers.get('access-control-allow-origin'), path).toBe('*');
    }
    // The app's own API still only answers the app's origins.
    for (const path of ['/api/sync', '/api/auth/oauth2/consent', '/api/auth/sign-in/email']) {
      expect((await preflight(path)).headers.get('access-control-allow-origin'), path).not.toBe('*');
    }
  });

  it('turns away a session token or a forged bearer', async () => {
    const { cookie } = await server.signUp('forger@example.com');
    const session = cookie.split('=')[1] ?? '';
    expect((await mcp(session, 'tools/list')).status).toBe(401);
    expect((await mcp('a.b.c', 'tools/list')).status).toBe(401);
  });
});
