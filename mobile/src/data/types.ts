// Shared data shapes. IDs are UUIDs created on the device so guest data can be
// synced to the server later (v2) without ID clashes.

export type Deck = {
  id: string;
  name: string;
  description: string;
  createdAt: string; // ISO date string
  updatedAt: string;
  deletedAt: string | null; // soft delete: set instead of removing the row
};

export type DeckWithCount = Deck & { cardCount: number };

export type Card = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
