// Shared data shapes. IDs are UUIDs created on the device so guest data can be
// synced to the server later (v2) without ID clashes.

export type Deck = {
  id: string;
  name: string;
  description: string;
  createdAt: string; // ISO date string
  updatedAt: string;
  deletedAt: string | null; // soft delete: set instead of removing the row
  lastStudiedAt: string | null; // when a study session last opened this deck
  studySeconds: number; // total time spent studying this deck's cards
};

export type DeckWithCount = Deck & { cardCount: number };

/** How a card felt the last time it was revised. */
export type Rating = 'hard' | 'ok' | 'easy';

export type Card = {
  id: string;
  deckId: string;
  front: string; // plain text
  back: string; // light formatting, see src/lib/rich-text.ts
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  favoritedAt: string | null; // null = not a favourite
  rating: Rating | null; // null = not rated yet ("new")
  ratedAt: string | null;
};

/** A favourite card, with the deck it belongs to. */
export type FavoriteCard = Card & { deckName: string };

export type AttachmentKind = 'image' | 'pdf' | 'audio';
export type CardSide = 'front' | 'back';

// --- Notes ---------------------------------------------------------------------

/** A folder of notes. Folders can hold folders, to any depth (Class → Subject → Chapter → Topic). */
export type Folder = {
  id: string;
  parentId: string | null; // null = top level
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** A folder with how many folders and notes are directly inside it. */
export type FolderWithCounts = Folder & { folderCount: number; noteCount: number };

/** A folder on the way to another one, for showing "Class 10 › Physics". */
export type FolderCrumb = { id: string; name: string };

/** plain = one page of text; cornell = cue / notes rows with a summary at the bottom. */
export type NoteStyle = 'plain' | 'cornell';

/** One row of a Cornell note: a cue (keyword or question) and the notes next to it. */
export type CornellRow = { cue: string; notes: string };

export type Note = {
  id: string;
  folderId: string | null; // null = top level
  title: string;
  style: NoteStyle;
  body: string; // plain notes, light formatting (see src/lib/rich-text.ts)
  rows: CornellRow[]; // Cornell notes
  summary: string; // Cornell notes
  createdBy: string | null; // null = the user; else the AI app that wrote it, e.g. 'Claude'
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type NoteInput = {
  title: string;
  style: NoteStyle;
  body?: string;
  rows?: CornellRow[];
  summary?: string;
};

/** Who is creating a note: leave out for the user, or name the AI app (used only when creating). */
export type NoteSource = { createdBy?: string | null };

/** A note found by search, with the folders it is in. */
export type NoteSearchResult = Note & { path: FolderCrumb[] };
/** A folder found by search, with the folders it is in. */
export type FolderSearchResult = Folder & { path: FolderCrumb[] };

export type NoteAttachment = {
  id: string;
  noteId: string;
  kind: AttachmentKind;
  uri: string;
  name: string;
  mimeType: string | null;
  createdAt: string;
};

export type Attachment = {
  id: string;
  cardId: string;
  side: CardSide;
  kind: AttachmentKind;
  uri: string; // a file in the app's storage (a data: URL on web)
  name: string;
  mimeType: string | null;
  createdAt: string;
};
