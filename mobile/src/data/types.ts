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
