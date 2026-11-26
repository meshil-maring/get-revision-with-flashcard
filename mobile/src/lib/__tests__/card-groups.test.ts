import type { Card, CardGroup } from '@/data/types';
import { cardsInGroup, sectionCards } from '@/lib/card-groups';

const AT = '2026-01-01T00:00:00.000Z';

function group(id: string, position: number): CardGroup {
  return { id, deckId: 'd', name: id, position, createdAt: AT, updatedAt: AT, deletedAt: null };
}

function card(id: string, groupId: string | null): Card {
  return {
    id,
    deckId: 'd',
    groupId,
    front: id,
    back: '',
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    favoritedAt: null,
    rating: null,
    ratedAt: null,
  };
}

describe('sectionCards', () => {
  it('puts cards under their groups in order, with cards in no group last', () => {
    const groups = [group('g1', 0), group('g2', 1)];
    const cards = [card('a', null), card('b', 'g2'), card('c', 'g1'), card('d', 'g2')];

    expect(sectionCards(groups, cards).map((s) => [s.group?.id ?? null, s.cards.map((c) => c.id)])).toEqual([
      ['g1', ['c']],
      ['g2', ['b', 'd']],
      [null, ['a']],
    ]);
  });

  it('keeps empty groups, leaves out an empty "no group" part, and treats a missing group as none', () => {
    const groups = [group('g1', 0)];
    expect(sectionCards(groups, []).map((s) => s.group?.id ?? null)).toEqual(['g1']);
    expect(sectionCards(groups, [card('a', 'gone')]).map((s) => [s.group?.id ?? null, s.cards.length])).toEqual([
      ['g1', 0],
      [null, 1],
    ]);
  });

  it('picks the cards of one group', () => {
    const groups = [group('g1', 0)];
    const cards = [card('a', 'g1'), card('b', null)];
    expect(cardsInGroup(groups, cards, 'g1').map((c) => c.id)).toEqual(['a']);
    expect(cardsInGroup(groups, cards, null).map((c) => c.id)).toEqual(['b']);
  });
});
