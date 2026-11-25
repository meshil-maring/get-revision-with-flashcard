import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { StudySession } from '@/components/study-session';
import { listCardsForDecks } from '@/data/cards';
import { listDecks } from '@/data/decks';
import type { Card } from '@/data/types';

type Loaded = { deckNames: Map<string, string>; cards: Card[] };

/** Revise cards from several decks together. URL: /revise?decks=id1,id2 */
export default function ReviseScreen() {
  const { decks: deckParam = '' } = useLocalSearchParams<{ decks?: string }>();
  const db = useSQLiteContext();
  const [loaded, setLoaded] = useState<Loaded | null>(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    const requested = deckParam.split(',').filter(Boolean);
    (async () => {
      // Only decks that still exist.
      const allDecks = await listDecks(db);
      const existing = new Set(allDecks.map((d) => d.id));
      const deckIds = requested.filter((id) => existing.has(id));
      const cards = await listCardsForDecks(db, deckIds);
      if (cancelled) return;
      setLoaded({ deckNames: new Map(allDecks.map((d) => [d.id, d.name])), cards });
    })();
    return () => {
      cancelled = true;
    };
  }, [db, deckParam]);

  if (loaded === null) {
    return <Stack.Screen options={{ title: 'Revision' }} />;
  }

  const deckCount = new Set(loaded.cards.map((c) => c.deckId)).size;

  return (
    <StudySession
      title={`Revision · ${deckCount} ${deckCount === 1 ? 'deck' : 'decks'}`}
      cards={loaded.cards}
      emptyText="The decks you picked have no cards."
      backLabel="Back to deck selection"
      initialShuffle
      cardLabel={(card) => loaded.deckNames.get(card.deckId)}
    />
  );
}
