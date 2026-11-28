import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Centered, StudySession } from '@/components/study/study-session';
import { listGroups } from '@/data/card-groups';
import { listCards } from '@/data/cards';
import { getDeck, markDeckStudied } from '@/data/decks';
import { getAutoNext, getAutoNextPauseOnAnswer } from '@/data/settings';
import type { Card, CardGroup, Deck } from '@/data/types';
import { cardsInGroup } from '@/lib/card-groups';

type Loaded = {
  deck: Deck | null;
  group: CardGroup | null; // set when studying one group of the deck
  cards: Card[];
  autoNext: number;
  pauseOnAnswer: boolean;
};

/** Study one deck, one group of its cards (?groupId=…), or cards picked in the deck (?cards=id,id,…). */
export default function StudyScreen() {
  const { id, groupId, cards: picked } = useLocalSearchParams<{ id: string; groupId?: string; cards?: string }>();
  const db = useSQLiteContext();
  const [loaded, setLoaded] = useState<Loaded | null>(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDeck(db, id),
      listCards(db, id),
      groupId ? listGroups(db, id) : Promise.resolve([]),
      getAutoNext(db, id),
      getAutoNextPauseOnAnswer(db, id),
    ]).then(([deck, allCards, groups, autoNext, pauseOnAnswer]) => {
      if (cancelled) return;
      const group = groupId ? (groups.find((g) => g.id === groupId) ?? null) : null;
      // A group that no longer exists has no cards, rather than falling back to the whole deck.
      let cards = groupId ? (group ? cardsInGroup(groups, allCards, group.id) : []) : allCards;
      if (picked) {
        const ids = new Set(picked.split(','));
        cards = cards.filter((card) => ids.has(card.id));
      }
      setLoaded({ deck, group, cards, autoNext, pauseOnAnswer });
      // Shown under "Continue Studying" on Home.
      if (deck && cards.length > 0) markDeckStudied(db, deck.id);
    });
    return () => {
      cancelled = true;
    };
  }, [db, id, groupId, picked]);

  if (loaded === null) {
    return <Stack.Screen options={{ title: 'Study' }} />;
  }

  if (loaded.deck === null) {
    return (
      <Centered title="Not found">
        <Text className="text-lg text-muted">This deck no longer exists.</Text>
      </Centered>
    );
  }

  return (
    <StudySession
      title={`Study: ${loaded.deck.name}${loaded.group ? ` › ${loaded.group.name}` : picked ? ' › Selected cards' : ''}`}
      cards={loaded.cards}
      emptyText={
        picked
          ? 'These cards are no longer in this deck.'
          : groupId
            ? 'Add some cards to this group first.'
            : 'Add some cards to this deck first.'
      }
      backLabel="Back to deck"
      autoNextSeconds={loaded.autoNext}
      pauseOnAnswer={loaded.pauseOnAnswer}
    />
  );
}
