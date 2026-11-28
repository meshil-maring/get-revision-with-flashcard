import type { Card, Rating } from '@/data/types';
import { cardMatches, filterCards, groupByRating, parseRatingFilters, rankByTime } from '@/lib/revision';

function card(id: string, rating: Rating | null, favorite = false): Card {
  return {
    id,
    deckId: 'd',
    groupId: null,
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
  it('groups Unmarked, Easy, OK, Hard and skips empty groups', () => {
    const ratings = new Map<string, Rating>([
      ['a', 'easy'],
      ['b', 'hard'],
      ['c', 'easy'],
    ]);
    expect(groupByRating(cards, ratings)).toEqual([
      { rating: 'new', cards: [cards[3]] },
      { rating: 'easy', cards: [cards[0], cards[2]] },
      { rating: 'hard', cards: [cards[1]] },
    ]);
  });
});

describe('rankByTime', () => {
  it('puts the slowest cards first', () => {
    const times = new Map([
      ['a', 2000],
      ['b', 9000],
      ['c', 500],
    ]);
    expect(rankByTime(cards, times).map((r) => [r.card.id, r.ms])).toEqual([
      ['b', 9000],
      ['a', 2000],
      ['c', 500],
      ['d', 0],
    ]);
  });
});

describe('cardMatches', () => {
  const c = { front: 'What is Osmosis?', back: 'Water moving through a **membrane**' };

  it('matches the question or answer, in any case', () => {
    expect(cardMatches(c, 'osmosis')).toBe(true);
    expect(cardMatches(c, 'WATER')).toBe(true);
    expect(cardMatches(c, 'mitosis')).toBe(false);
  });

  it('ignores formatting marks in the answer', () => {
    expect(cardMatches(c, 'a membrane')).toBe(true);
    expect(cardMatches(c, '**')).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(cardMatches(c, '  ')).toBe(true);
  });
});
