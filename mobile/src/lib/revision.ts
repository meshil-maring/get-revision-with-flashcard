import type { Card, Rating } from '@/data/types';
import { toPlainText } from '@/lib/rich-text';

/** A rating, or 'new' for cards that haven't been rated yet. */
export type RatingFilter = Rating | 'new';

export const RATING_FILTERS: RatingFilter[] = ['hard', 'ok', 'easy', 'new'];

export const RATING_LABELS: Record<RatingFilter, string> = {
  hard: 'Hard',
  ok: 'OK',
  easy: 'Easy',
  new: 'New',
};

export type CardFilter = {
  /** Which ratings to include. Empty or missing = all. */
  ratings?: RatingFilter[];
  favoritesOnly?: boolean;
};

export function ratingOf(card: Pick<Card, 'rating'>): RatingFilter {
  return card.rating ?? 'new';
}

/** The cards that match the filter, in the same order. */
export function filterCards<T extends Card>(cards: T[], filter: CardFilter): T[] {
  const ratings = filter.ratings && filter.ratings.length > 0 ? new Set(filter.ratings) : null;
  return cards.filter(
    (card) =>
      (!filter.favoritesOnly || card.favoritedAt !== null) &&
      (ratings === null || ratings.has(ratingOf(card))),
  );
}

/** Whether the card's question or answer contains the query (any case, ignoring formatting marks). */
export function cardMatches(card: Pick<Card, 'front' | 'back'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return card.front.toLowerCase().includes(q) || toPlainText(card.back).toLowerCase().includes(q);
}

/** Reads a comma-separated list like "hard,new" from a URL, ignoring anything unknown. */
export function parseRatingFilters(value: string | undefined): RatingFilter[] {
  return (value ?? '')
    .split(',')
    .filter((r): r is RatingFilter => (RATING_FILTERS as string[]).includes(r));
}

/** Order of the groups at the end of a session: cards left unmarked first, then Easy, OK, Hard. */
export const SESSION_GROUP_ORDER: RatingFilter[] = ['new', 'easy', 'ok', 'hard'];

/** Names for the groups at the end of a session ("new" there means skipped without a rating). */
export const SESSION_GROUP_LABELS: Record<RatingFilter, string> = { ...RATING_LABELS, new: 'Unmarked' };

/** A session's cards grouped by the rating given in it; cards not rated go under 'new' (Unmarked). */
export function groupByRating<T extends { id: string }>(
  cards: T[],
  ratings: Map<string, Rating>,
): { rating: RatingFilter; cards: T[] }[] {
  return SESSION_GROUP_ORDER.map((rating) => ({
    rating,
    cards: cards.filter((c) => (ratings.get(c.id) ?? 'new') === rating),
  })).filter((group) => group.cards.length > 0);
}

/** Cards slowest first, with the time spent on each (ms). */
export function rankByTime<T extends { id: string }>(cards: T[], times: Map<string, number>): { card: T; ms: number }[] {
  return cards.map((card) => ({ card, ms: times.get(card.id) ?? 0 })).sort((a, b) => b.ms - a.ms);
}
