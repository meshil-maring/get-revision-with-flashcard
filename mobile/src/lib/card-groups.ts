import type { Card, CardGroup } from '@/data/types';

/** A part of a deck's card list: a group and its cards, or (group null) the cards in no group. */
export type CardSection = { group: CardGroup | null; cards: Card[] };

/**
 * Splits a deck's cards into its groups, in the groups' order, with the cards that aren't in a
 * group last. A card whose group no longer exists counts as not in a group. Empty groups are kept
 * (so a new group shows up before it has cards); the "no group" part only when it has cards.
 */
export function sectionCards(groups: CardGroup[], cards: Card[]): CardSection[] {
  const byGroup = new Map<string, Card[]>(groups.map((g) => [g.id, []]));
  const ungrouped: Card[] = [];
  for (const card of cards) {
    const list = card.groupId ? byGroup.get(card.groupId) : undefined;
    if (list) list.push(card);
    else ungrouped.push(card);
  }
  const sections: CardSection[] = groups.map((g) => ({ group: g, cards: byGroup.get(g.id)! }));
  if (ungrouped.length > 0) sections.push({ group: null, cards: ungrouped });
  return sections;
}

/** The cards in one group (null = the cards not in any group). */
export function cardsInGroup(groups: CardGroup[], cards: Card[], groupId: string | null): Card[] {
  return sectionCards(groups, cards).find((s) => (s.group?.id ?? null) === groupId)?.cards ?? [];
}
