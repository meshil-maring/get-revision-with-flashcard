import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { Db } from '../db/client.ts';
import { fetchImage as defaultFetchImage, type ImageFetcher } from '../files/fetch-image.ts';
import { ImageError, mb } from '../files/images.ts';
import { createUploadLink, storeImage, UNATTACHED_HOURS, UPLOAD_LINK_MINUTES, type ImageDeps } from '../files/uploads.ts';
import { cleanDiagrams } from './diagrams.ts';
import * as noteImages from './note-images.ts';
import * as store from './store.ts';

/** Who is calling: the signed-in user, and the AI app's name (shown on notes it writes). */
export type McpCaller = { userId: string; appName: string };

/** What the image tools need: file storage and its limits, and where upload links point. */
export type McpImageOptions = ImageDeps & { baseURL: string; secret: string; fetchImage?: ImageFetcher };

const FORMATTING =
  'Text can use light formatting: "# Heading", "## Subheading", "### Heading 3", "#### Heading 4", "- bullet", "1. numbered", tables ("| A | B |" rows, with a "|---|---|" line under the header row), **bold**, *italic*, __underline__, ==highlight==.';

/** Boxes and diagrams, for notes only (they'd crowd a flashcard). */
const NOTE_EXTRAS =
  'Notes can also have boxes, each on its own lines and closed by a line with only ":::": ' +
  '":::good Advantages" (its "- " points show with a green ✓), ":::bad Limitations" (red ✗) and ":::note Title" ' +
  '(a purple box for other groups of points, e.g. measures or key facts). A :::good box straight after a :::bad ' +
  "one (or the other way round) sits beside it on wide screens. " +
  'DIAGRAMS: when the topic has a shape (a layout, structure, parts of something, a process, a cycle, a flow), ' +
  'add one labelled diagram where it belongs, written as SVG between ":::diagram <caption>" and ":::". ' +
  'Draw it so it reads well on a phone: viewBox about 400 wide (e.g. "0 0 400 300"), font-family="sans-serif", ' +
  'font-size 14 to 18, every label spelled out in full, at most about 10 labels, nothing tiny. Style it like ' +
  'hand-made study notes: dark grey (#374151) outlines 2 to 3 wide, soft fills (green #dcfce7, lavender #ede9fe, ' +
  'yellow #fef3c7), labels in rounded lavender boxes with a thin line or arrow to what they name, purple ' +
  '(#7c5cd6) arrows for movement or flow (use <marker> for arrowheads), round corners (rx). Plain SVG only: ' +
  'shapes, paths, text, markers, gradients. Scripts, event handlers, <foreignObject>, images, links, CSS and ' +
  'filters are removed or not drawn. Keep each diagram under 60,000 characters.';

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
    if (error instanceof store.ToolError || error instanceof ImageError) {
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
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
  'upload_image',
  'attach_image_to_note',
  'create_note_with_images',
  'list_note_attachments',
  'remove_note_attachment',
] as const;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const REMOVES = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

/** An uploaded image's id: from upload_image or list_note_attachments. */
const attachmentId = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,100}$/, 'An attachment id from upload_image or list_note_attachments.')
  .describe('The attachment_id from upload_image (or list_note_attachments).');
const caption = z.string().trim().max(500).optional().describe('Shown under the image, e.g. "Figure 1: A four-way intersection".');
const altText = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .describe('What the image shows, for screen readers and read-aloud, e.g. "Diagram of the conflict points at a crossroads".');
const cornellRow = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Cornell notes only: the row (1 = first) to show the image in, under that row\'s notes, e.g. the row the ' +
      'picture explains. Leave out to show it after the note.',
  );

/**
 * A file the user attached in ChatGPT. ChatGPT fills this in for fields listed in
 * _meta["openai/fileParams"] (all four properties must be declared; download_url and file_id
 * required); the server downloads download_url itself.
 */
const chatGptFile = z
  .object({
    download_url: z.string().describe('Temporary link to the file.'),
    file_id: z.string().describe("The file's id in ChatGPT."),
    mime_type: z.string().optional(),
    file_name: z.string().optional(),
  })
  .describe('An image the user attached in ChatGPT (ChatGPT fills this in).');

/** The fields of a new note, shared by create_note and create_note_with_images. */
const noteFields = {
  title: text(200),
  folder_path: folderPath.optional(),
  style: z.enum(['plain', 'cornell']).default('plain'),
  body: z.string().max(100_000).optional().describe('For plain notes.'),
  cornell_rows: z
    .array(
      z.object({
        cue: z.string().max(2000).describe('A short question or keyword, e.g. "How does traffic move?".'),
        notes: z.string().max(80_000).describe('The answer: bullets, tables, boxes or a diagram.'),
      }),
    )
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
};

type NoteArgs = { [K in keyof typeof noteFields]: z.infer<(typeof noteFields)[K]> };

/** Checks a new note's fields and turns them into the store's input (cleaning diagrams). */
function noteInput(args: NoteArgs): store.NoteInput {
  if (args.title.trim().toLowerCase() === store.GOOD_TO_KNOW_TITLE.toLowerCase())
    throw new store.ToolError(
      `"${store.GOOD_TO_KNOW_TITLE}" is kept for you: write the topic as its own note and pass its key points in good_to_know.`,
    );
  if (args.style === 'plain' && !args.body?.trim()) throw new store.ToolError('A plain note needs a body.');
  if (args.style === 'cornell' && !args.cornell_rows?.length && !args.summary?.trim())
    throw new store.ToolError('A Cornell note needs cornell_rows or a summary.');
  return {
    title: args.title,
    folderPath: args.folder_path,
    style: args.style,
    body: cleanDiagrams(args.body, 'body'),
    cornellRows: args.cornell_rows?.map((row, i) => ({
      cue: row.cue,
      notes: cleanDiagrams(row.notes, `cornell_rows[${i}]`) ?? '',
    })),
    summary: cleanDiagrams(args.summary, 'summary'),
    tags: args.tags,
    goodToKnow: args.good_to_know,
  };
}

/** Bytes from base64 (also a data: URL); a readable error for anything else. */
function decodeBase64(value: string): { bytes: Uint8Array; type: string | null } {
  const dataUrl = /^data:([^;,]+)?(?:;[^,]*)?;base64,/i.exec(value);
  const body = (dataUrl ? value.slice(dataUrl[0].length) : value).replace(/\s+/g, '');
  if (body.length === 0 || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(body)) throw new ImageError('image_base64 is not valid base64.');
  return { bytes: new Uint8Array(Buffer.from(body, 'base64')), type: dataUrl?.[1] ?? null };
}

/** The StudyMe MCP server for one request from one user. */
export function createMcpServer(db: Db, caller: McpCaller, images: McpImageOptions): McpServer {
  const { userId } = caller;
  const fetchImage = images.fetchImage ?? defaultFetchImage;
  const server = new McpServer(
    { name: 'studyme', title: 'StudyMe', version: '1.0.0' },
    {
      instructions:
        "StudyMe is the user's study app: flashcard decks and notes in folders. Use these tools to read what the user " +
        'already has and to add new decks, cards and notes for them. Look before you add: check list_decks before ' +
        'making a deck, and list_folders before choosing where a note goes, so you reuse what exists. Keep cards short ' +
        'and focused on one fact each. To put a picture in a note, upload it with upload_image, then attach it with ' +
        'attach_image_to_note or create_note_with_images. New items appear in the app on its next sync.',
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
        'When the student asks for Cornell notes, make a full Cornell page: one row per cue question (What is it? ' +
        'Main parts? How does it work? Advantages? Limitations? Where is it used?), notes that answer it with short ' +
        'bullets, a comparison table where two things are compared, a labelled diagram in the row it explains, ' +
        'advantages and limitations as a :::good box and a :::bad box in the same row, and a 2 to 3 sentence summary. ' +
        `${FORMATTING} ${NOTE_EXTRAS}`,
      inputSchema: noteFields,
      annotations: ADDS,
    },
    (args) =>
      run(async () => {
        const note = await store.createNote(db, userId, noteInput(args), caller.appName);
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

  // --- images ---------------------------------------------------------------------------

  server.registerTool(
    'upload_image',
    {
      title: 'Upload an image',
      description:
        `Saves a PNG, JPEG or WebP image (up to ${mb(images.config.maxImageBytes)}) to the user's StudyMe account ` +
        'and returns its attachment_id. Give the image in ONE of these ways: `image` (ChatGPT fills this in with a ' +
        'file the user attached), `image_url` (a public https link to the image), or `image_base64` (the file\'s ' +
        "bytes, only if you really have them; never make them up). If you can't give the image any of these ways " +
        '(e.g. the user attached it in Claude), call this with none of them: you get an `upload_url`; show it to the ' +
        'user, ask them to open it, choose the picture and press Upload, and wait until they say it is done. ' +
        'The upload is complete when this returns status "uploaded" (or once the user has used the link); then pass ' +
        'attachment_id to attach_image_to_note or create_note_with_images. An image not attached within ' +
        `${UNATTACHED_HOURS} hours is removed. The file type is checked from the file's contents.`,
      inputSchema: {
        image: chatGptFile.optional(),
        image_url: z.string().trim().max(2000).optional().describe('A public https:// link to a PNG, JPEG or WebP image.'),
        image_base64: z
          .string()
          // Twice the limit, so a slightly-too-big image gets the size check's clearer message.
          .max(Math.ceil((images.config.maxImageBytes * 8) / 3) + 1000)
          .optional()
          .describe('The image file as base64 (a data: URL works too).'),
        filename: z.string().trim().max(200).optional().describe('A name for the file, e.g. "intersection-diagram.png".'),
        mime_type: z
          .string()
          .trim()
          .max(100)
          .optional()
          .describe('image/png, image/jpeg or image/webp. Optional: the real type is read from the file.'),
      },
      annotations: ADDS,
      _meta: { 'openai/fileParams': ['image'] },
    },
    (args) =>
      run(async () => {
        const sources = [args.image, args.image_url, args.image_base64].filter((v) => v !== undefined && v !== '');
        if (sources.length > 1) throw new store.ToolError('Give the image in one way only: image, image_url or image_base64.');
        if (sources.length === 0) {
          const link = await createUploadLink(images, userId, {
            baseURL: images.baseURL,
            secret: images.secret,
            fileName: args.filename,
          });
          return {
            attachment_id: link.attachmentId,
            status: 'waiting for the user to upload',
            upload_url: link.uploadUrl,
            link_expires_at: link.expiresAt,
            next:
              'Show the user upload_url and ask them to open it, choose the image and press Upload (the link works ' +
              `once, for ${UPLOAD_LINK_MINUTES} minutes). When they say it is done, pass attachment_id to ` +
              'attach_image_to_note or create_note_with_images.',
          };
        }
        let bytes: Uint8Array;
        let declaredType = args.mime_type || null;
        let fileName = args.filename || null;
        if (args.image_base64) {
          const decoded = decodeBase64(args.image_base64);
          bytes = decoded.bytes;
          declaredType ??= decoded.type;
        } else {
          const fetched = await fetchImage(args.image?.download_url ?? args.image_url!, {
            maxBytes: images.config.maxImageBytes,
          });
          bytes = fetched.bytes;
          // A server's Content-Type is only a hint (many send octet-stream), so it isn't used: the bytes decide.
          declaredType ??= args.image?.mime_type || null;
          fileName ??= args.image?.file_name || fetched.fileName;
        }
        const stored = await storeImage(images, userId, { bytes, fileName, declaredType });
        return {
          attachment_id: stored.attachmentId,
          status: 'uploaded',
          filename: stored.fileName,
          mime_type: stored.type,
          file_size: stored.size,
          width: stored.width,
          height: stored.height,
          expires_if_not_attached_at: stored.expiresAt,
          next: 'Pass attachment_id to attach_image_to_note (an existing note) or create_note_with_images (a new note).',
        };
      }),
  );

  server.registerTool(
    'attach_image_to_note',
    {
      title: 'Attach an image to a note',
      description:
        "Adds an uploaded image (from upload_image) to one of the user's notes, with an optional caption and alt " +
        'text. On a Cornell note, pass `cornell_row` to show it inside the row it belongs to (read the note with ' +
        'get_note to choose); otherwise it shows after the note. The upload must be complete first. Attaching the ' +
        'same image to the same note again only updates its caption and alt text (and can move it into a row). ' +
        'One image can be attached to several notes.',
      inputSchema: {
        note_id: z.string().min(1).describe('From list_notes or create_note.'),
        attachment_id: attachmentId,
        caption,
        alt_text: altText,
        cornell_row: cornellRow,
      },
      annotations: { ...ADDS, idempotentHint: true },
    },
    ({ note_id, attachment_id, caption, alt_text, cornell_row }) =>
      run(async () => {
        const [attached] = await noteImages.attachImages(db, userId, note_id, [
          { attachmentId: attachment_id, caption, altText: alt_text, cornellRow: cornell_row },
        ]);
        return { noteId: note_id, ...attached };
      }),
  );

  server.registerTool(
    'create_note_with_images',
    {
      title: 'Create a note with images',
      description:
        'Like create_note, and also attaches uploaded images (from upload_image) to the new note in the order given, ' +
        'each with an optional caption and alt text. For a Cornell note, give each image the `cornell_row` it ' +
        'explains, so it shows inside that row; images without one show after the note. In a plain note, a line ' +
        '":::image <attachment_id>" in `body` shows that image there. Everything is saved together: if any image ' +
        'is missing or not uploaded yet, no note is made. Always pass `good_to_know` (see create_note). ' +
        `${FORMATTING} ${NOTE_EXTRAS}`,
      inputSchema: {
        ...noteFields,
        images: z
          .array(z.object({ attachment_id: attachmentId, caption, alt_text: altText, cornell_row: cornellRow }))
          .min(1)
          .max(20)
          .describe('The images, in the order they should appear.'),
      },
      annotations: ADDS,
    },
    ({ images: imageArgs, ...args }) =>
      run(async () => {
        const { note, attachments } = await noteImages.createNoteWithImages(
          db,
          userId,
          noteInput(args),
          imageArgs.map((i) => ({
            attachmentId: i.attachment_id,
            caption: i.caption,
            altText: i.alt_text,
            cornellRow: i.cornell_row,
          })),
          caller.appName,
        );
        return {
          noteId: note.id,
          title: args.title,
          folder: note.folder || '(top level)',
          tags: note.tags,
          goodToKnow: note.goodToKnow ?? 'not added: pass good_to_know with the key points next time',
          attachments,
        };
      }),
  );

  server.registerTool(
    'list_note_attachments',
    {
      title: "List a note's attachments",
      description:
        "A note's images and other attached files in display order: each one's attachment_id, file name, type, size, " +
        'caption, alt text, and a display_url to view it (the link works for a short time).',
      inputSchema: { note_id: z.string().min(1).describe('From list_notes.') },
      annotations: READ_ONLY,
    },
    ({ note_id }) => run(() => noteImages.listAttachments(db, images.storage, userId, note_id)),
  );

  server.registerTool(
    'remove_note_attachment',
    {
      title: 'Remove an attachment from a note',
      description:
        "Takes an attachment off a note. Its file is deleted from the user's account too, unless another note still " +
        'uses the same image. Use list_note_attachments to find the attachment_id.',
      inputSchema: { note_id: z.string().min(1).describe('From list_notes.'), attachment_id: attachmentId },
      annotations: REMOVES,
    },
    ({ note_id, attachment_id }) => run(() => noteImages.removeAttachment(db, images.storage, userId, note_id, attachment_id)),
  );

  return server;
}
