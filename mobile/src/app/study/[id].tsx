import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Centered, StudySession } from '@/components/study-session';
import { listCards } from '@/data/cards';
import { getDeck, markDeckStudied } from '@/data/decks';
import type { Card, Deck } from '@/data/types';

type Loaded = { deck: Deck | null; cards: Card[] };

/** Study one deck. */
export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [loaded, setLoaded] = useState<Loaded | null>(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDeck(db, id), listCards(db, id)]).then(([deck, cards]) => {
      if (cancelled) return;
      setLoaded({ deck, cards });
      // Shown under "Continue Studying" on Home.
      if (deck && cards.length > 0) markDeckStudied(db, deck.id);
    });
    return () => {
      cancelled = true;
    };
  }, [db, id]);

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
      title={`Study: ${loaded.deck.name}`}
      cards={loaded.cards}
      emptyText="Add some cards to this deck first."
      backLabel="Back to deck"
    />
  );
}
