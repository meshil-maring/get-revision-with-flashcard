import type { Card, Rating } from '@/data/types';

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

/** Reads a comma-separated list like "hard,new" from a URL, ignoring anything unknown. */
export function parseRatingFilters(value: string | undefined): RatingFilter[] {
  return (value ?? '')
    .split(',')
    .filter((r): r is RatingFilter => (RATING_FILTERS as string[]).includes(r));
}

/** Cards rated in a session, grouped by rating (hard first). Unrated cards are left out. */
export function groupByRating<T extends { id: string }>(
  cards: T[],
  ratings: Map<string, Rating>,
): { rating: Rating; cards: T[] }[] {
  const order: Rating[] = ['hard', 'ok', 'easy'];
  return order
    .map((rating) => ({ rating, cards: cards.filter((c) => ratings.get(c.id) === rating) }))
    .filter((group) => group.cards.length > 0);
}
