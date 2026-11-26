import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { Db } from '../db/client.ts';
import * as store from './store.ts';

/** Who is calling: the signed-in user, and the AI app's name (shown on notes it writes). */
export type McpCaller = { userId: string; appName: string };

const FORMATTING =
  'Text can use light formatting: "# Heading", "## Subheading", "### Heading 3", "#### Heading 4", "- bullet", "1. numbered", tables ("| A | B |" rows, with a "|---|---|" line under the header row), **bold**, *italic*, __underline__, ==highlight==.';

const text = (max: number) => z.string().trim().min(1).max(max);
const card = z.object({
  front: text(5000).describe('The question or prompt.'),
  back: text(10000).describe(`The answer. ${FORMATTING}`),
  group: z
    .string()
    .trim()
    .max(100)
    .optional()
    .describe(
      'Optional group inside the deck to put the card in, e.g. "Chapter 1" or "Formulas". Reuses the deck\'s group ' +
        'with this name, or makes it. Leave out for no group.',
    ),
});
const cards = z.array(card).min(1).max(200);
const folderPath = z
  .array(text(100))
  .max(10)
  .describe('Folder names from the top level down, e.g. ["Class 10", "Physics", "Chapter 1"]. Empty = top level.');

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Runs a tool, turning a ToolError into an error message the AI can read and act on. */
async function run(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return json(await work());
  } catch (error) {
    if (error instanceof store.ToolError) return { isError: true, content: [{ type: 'text', text: error.message }] };
    throw error;
  }
}

/** Every tool this server offers, as AI apps see them (also shown by /health). */
export const MCP_TOOL_NAMES = [
  'list_decks',
  'get_deck',
  'create_deck',
  'add_cards',
  'list_folders',
  'list_notes',
  'get_note',
  'create_note',
  'add_good_to_know',
] as const;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

/** The StudyMe MCP server for one request from one user. */
export function createMcpServer(db: Db, caller: McpCaller): McpServer {
  const { userId } = caller;
  const server = new McpServer(
    { name: 'studyme', title: 'StudyMe', version: '1.0.0' },
    {
      instructions:
        "StudyMe is the user's study app: flashcard decks and notes in folders. Use these tools to read what the user " +
        'already has and to add new decks, cards and notes for them. Look before you add: check list_decks before ' +
        'making a deck, and list_folders before choosing where a note goes, so you reuse what exists. Keep cards short ' +
        'and focused on one fact each. New items appear in the app on its next sync.',
    },
  );

  server.registerTool(
    'list_decks',
    {
      title: 'List flashcard decks',
      description: "The user's flashcard decks, with how many cards each has.",
      annotations: READ_ONLY,
    },
    () => run(() => store.listDecks(db, userId)),
  );

  server.registerTool(
    'get_deck',
    {
      title: 'Read a deck',
      description:
        "A deck's groups and cards (front, back and group), e.g. to avoid adding cards it already has or to reuse its groups.",
      inputSchema: { deck_id: z.string().min(1).describe('From list_decks.') },
      annotations: READ_ONLY,
    },
    ({ deck_id }) => run(() => store.getDeck(db, userId, deck_id)),
  );

  server.registerTool(
    'create_deck',
    {
      title: 'Create a deck',
      description:
        'Makes a new flashcard deck with its cards (up to 200). Cards can be sorted into groups inside the deck ' +
        `(e.g. one per chapter or subtopic) with each card's \`group\`. ${FORMATTING}`,
      inputSchema: {
        name: text(200).describe('Deck name, e.g. "Biology: Cell Structure".'),
        description: z.string().trim().max(1000).optional().describe('One line about what the deck covers.'),
        cards,
      },
      annotations: ADDS,
    },
    ({ name, description, cards }) =>
      run(async () => {
        const deck = await store.createDeck(db, userId, { name, description, cards });
        return { deckId: deck.id, name, cardsAdded: deck.cardIds.length, groupsMade: deck.groupsMade };
      }),
  );

  server.registerTool(
    'add_cards',
    {
      title: 'Add cards to a deck',
      description:
        "Adds cards (up to 200) to an existing deck, optionally into groups (each card's `group`; use get_deck to " +
        `see the deck's groups). ${FORMATTING}`,
      inputSchema: { deck_id: z.string().min(1).describe('From list_decks.'), cards },
      annotations: ADDS,
    },
    ({ deck_id, cards }) =>
      run(async () => {
        const added = await store.addCards(db, userId, deck_id, cards);
        return { deckId: deck_id, cardsAdded: added.cardIds.length, groupsMade: added.groupsMade };
      }),
  );

  server.registerTool(
    'list_folders',
    {
      title: 'List note folders',
      description: 'Every note folder as a path, e.g. "Class 10 / Physics / Chapter 1".',
      annotations: READ_ONLY,
    },
    () => run(() => store.listFolders(db, userId)),
  );

  server.registerTool(
    'list_notes',
    {
      title: 'Find notes',
      description: 'Lists notes (title, folder, tags), optionally only those in a folder, with a tag, or containing some words.',
      inputSchema: {
        folder_path: folderPath.optional().describe('Only notes in this folder or the folders inside it.'),
        tag: z.string().trim().max(100).optional().describe('Only notes with this tag.'),
        search: z.string().trim().max(200).optional().describe('Only notes whose text contains this.'),
      },
      annotations: READ_ONLY,
    },
    ({ folder_path, tag, search }) => run(() => store.listNotes(db, userId, { folderPath: folder_path, tag, search })),
  );

  server.registerTool(
    'get_note',
    {
      title: 'Read a note',
      description: "A note's full text, e.g. to make flashcards from it.",
      inputSchema: { note_id: z.string().min(1).describe('From list_notes.') },
      annotations: READ_ONLY,
    },
    ({ note_id }) => run(() => store.getNote(db, userId, note_id)),
  );

  server.registerTool(
    'create_note',
    {
      title: 'Create a note',
      description:
        'Writes a study note into a folder (folders that do not exist yet are made). Style "plain" uses `body`; ' +
        'style "cornell" uses `cornell_rows` (cue questions on the left, notes on the right) and a `summary`. ' +
        'The app shows the title above the note, so do not repeat it as a heading at the start of `body`. ' +
        `Always pass \`good_to_know\`: the note's few most important points, short. They are collected, topic by ` +
        `topic, into the folder's "${store.GOOD_TO_KNOW_TITLE}" note (made the first time), so the student can revise ` +
        `the whole folder from one page. Never create a note titled "${store.GOOD_TO_KNOW_TITLE}" yourself. ` +
        FORMATTING,
      inputSchema: {
        title: text(200),
        folder_path: folderPath.optional(),
        style: z.enum(['plain', 'cornell']).default('plain'),
        body: z.string().max(100_000).optional().describe('For plain notes.'),
        cornell_rows: z
          .array(z.object({ cue: z.string().max(2000), notes: z.string().max(20_000) }))
          .max(100)
          .optional()
          .describe('For Cornell notes.'),
        summary: z.string().max(10_000).optional().describe('For Cornell notes.'),
        tags: z.array(text(50)).max(10).optional().describe('Tag names; new ones are made.'),
        good_to_know: z
          .array(text(300))
          .max(8)
          .optional()
          .describe(
            `2 to 5 key points from this note, one short line each (plain sentences, no bullet marks). ` +
              `Added under the note's title in the folder's "${store.GOOD_TO_KNOW_TITLE}" note.`,
          ),
      },
      annotations: ADDS,
    },
    (args) =>
      run(async () => {
        if (args.title.trim().toLowerCase() === store.GOOD_TO_KNOW_TITLE.toLowerCase())
          throw new store.ToolError(
            `"${store.GOOD_TO_KNOW_TITLE}" is kept for you: write the topic as its own note and pass its key points in good_to_know.`,
          );
        if (args.style === 'plain' && !args.body?.trim()) throw new store.ToolError('A plain note needs a body.');
        if (args.style === 'cornell' && !args.cornell_rows?.length && !args.summary?.trim())
          throw new store.ToolError('A Cornell note needs cornell_rows or a summary.');
        const note = await store.createNote(
          db,
          userId,
          {
            title: args.title,
            folderPath: args.folder_path,
            style: args.style,
            body: args.body,
            cornellRows: args.cornell_rows,
            summary: args.summary,
            tags: args.tags,
            goodToKnow: args.good_to_know,
          },
          caller.appName,
        );
        return {
          noteId: note.id,
          title: args.title,
          folder: note.folder || '(top level)',
          tags: note.tags,
          goodToKnow: note.goodToKnow ?? 'not added: pass good_to_know with the key points next time',
        };
      }),
  );

  server.registerTool(
    'add_good_to_know',
    {
      title: 'Add key points to Good to know',
      description:
        `Adds key points for notes that already exist to their folder's "${store.GOOD_TO_KNOW_TITLE}" note ` +
        '(made if missing). Use it when the student asks for "good to know" on existing notes: read each note ' +
        'with get_note, then pass one topic per note. New notes get theirs through create_note instead. A topic ' +
        "that is already there has its points replaced.",
      inputSchema: {
        folder_path: folderPath,
        topics: z
          .array(
            z.object({
              topic: text(200).describe("The note's title."),
              points: z.array(text(300)).min(1).max(8).describe('2 to 5 key points, one short line each.'),
            }),
          )
          .min(1)
          .max(50),
      },
      annotations: ADDS,
    },
    ({ folder_path, topics }) => run(() => store.addGoodToKnow(db, userId, folder_path, topics, caller.appName)),
  );

  return server;
}
