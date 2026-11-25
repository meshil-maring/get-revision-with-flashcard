import type { Card, Rating } from '@/data/types';
import { filterCards, groupByRating, parseRatingFilters } from '@/lib/revision';

function card(id: string, rating: Rating | null, favorite = false): Card {
  return {
    id,
    deckId: 'd',
    front: id,
    back: '',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    favoritedAt: favorite ? '2026-01-01' : null,
    rating,
    ratedAt: null,
  };
}

const cards = [card('a', 'hard', true), card('b', 'ok'), card('c', 'easy', true), card('d', null)];

describe('filterCards', () => {
  it('keeps everything with no filter', () => {
    expect(filterCards(cards, {})).toEqual(cards);
    expect(filterCards(cards, { ratings: [] })).toEqual(cards);
  });

  it('keeps cards with the chosen ratings, "new" meaning not rated yet', () => {
    expect(filterCards(cards, { ratings: ['hard', 'new'] }).map((c) => c.id)).toEqual(['a', 'd']);
  });

  it('can keep favourites only, together with ratings', () => {
    expect(filterCards(cards, { favoritesOnly: true }).map((c) => c.id)).toEqual(['a', 'c']);
    expect(filterCards(cards, { favoritesOnly: true, ratings: ['easy'] }).map((c) => c.id)).toEqual(['c']);
  });
});

describe('parseRatingFilters', () => {
  it('ignores unknown values', () => {
    expect(parseRatingFilters('hard,bogus,new')).toEqual(['hard', 'new']);
    expect(parseRatingFilters(undefined)).toEqual([]);
  });
});

describe('groupByRating', () => {
  it('groups hard first and skips empty groups and unrated cards', () => {
    const ratings = new Map<string, Rating>([
      ['a', 'easy'],
      ['b', 'hard'],
      ['c', 'easy'],
    ]);
    expect(groupByRating(cards, ratings)).toEqual([
      { rating: 'hard', cards: [cards[1]] },
      { rating: 'easy', cards: [cards[0], cards[2]] },
    ]);
  });
});
