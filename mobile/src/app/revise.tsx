import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { StudySession } from '@/components/study-session';
import { listCardsForDecks, listFavoriteCards } from '@/data/cards';
import { listDecks } from '@/data/decks';
import type { Card } from '@/data/types';
import { filterCards, parseRatingFilters } from '@/lib/revision';

type Loaded = { deckNames: Map<string, string>; cards: Card[] };

/**
 * Revise cards from several decks together.
 * URL: /revise?decks=id1,id2[&ratings=hard,new][&favorites=1]
 * With favorites=1 and no decks, revises every favourite card.
 */
export default function ReviseScreen() {
  const {
    decks: deckParam = '',
    ratings: ratingParam,
    favorites: favoritesParam,
  } = useLocalSearchParams<{ decks?: string; ratings?: string; favorites?: string }>();
  const db = useSQLiteContext();
  const [loaded, setLoaded] = useState<Loaded | null>(null); // null = loading
  const favoritesOnly = favoritesParam === '1';

  useEffect(() => {
    let cancelled = false;
    const requested = deckParam.split(',').filter(Boolean);
    (async () => {
      const allDecks = await listDecks(db);
      let cards: Card[];
      if (requested.length === 0 && favoritesOnly) {
        cards = await listFavoriteCards(db);
      } else {
        // Only decks that still exist.
        const existing = new Set(allDecks.map((d) => d.id));
        cards = await listCardsForDecks(db, requested.filter((id) => existing.has(id)));
      }
      cards = filterCards(cards, { ratings: parseRatingFilters(ratingParam), favoritesOnly });
      if (cancelled) return;
      setLoaded({ deckNames: new Map(allDecks.map((d) => [d.id, d.name])), cards });
    })();
    return () => {
      cancelled = true;
    };
  }, [db, deckParam, ratingParam, favoritesOnly]);

  if (loaded === null) {
    return <Stack.Screen options={{ title: 'Revision' }} />;
  }

  const deckCount = new Set(loaded.cards.map((c) => c.deckId)).size;
  const title =
    favoritesOnly && deckParam === ''
      ? 'Favourites'
      : `Revision · ${deckCount} ${deckCount === 1 ? 'deck' : 'decks'}`;

  return (
    <StudySession
      title={title}
      cards={loaded.cards}
      emptyText="No cards match what you picked."
      backLabel={favoritesOnly && deckParam === '' ? 'Back to favourites' : 'Back to deck selection'}
      initialShuffle
      cardLabel={(card) => loaded.deckNames.get(card.deckId)}
    />
  );
}
