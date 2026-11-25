import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Button, colors, DeckBadge, EmptyState, Icon, plural, ratingColors, ratingIcons } from '@/components/ui';
import { listCardsForDecks } from '@/data/cards';
import { listDecks } from '@/data/decks';
import type { Card, DeckWithCount } from '@/data/types';
import { filterCards, RATING_FILTERS, RATING_LABELS, type RatingFilter } from '@/lib/revision';

/**
 * Pick several decks and revise their cards in one session. You can also choose
 * which cards: by how hard they felt last time (Hard / OK / Easy / New) and favourites.
 */
export default function NewRevisionScreen() {
  const db = useSQLiteContext();
  const [decks, setDecks] = useState<DeckWithCount[] | null>(null); // null = loading
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Set<RatingFilter>>(new Set(RATING_FILTERS));
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const list = await listDecks(db);
        setCards((await listCardsForDecks(db, list.map((d) => d.id))) ?? []);
        setDecks(list);
      })();
    }, [db]),
  );

  const studyable = (decks ?? []).filter((d) => d.cardCount > 0);
  // Ignore selections for decks that were deleted or emptied since they were picked.
  const selected = studyable.filter((d) => selectedIds.has(d.id));
  const filter = { ratings: [...ratings], favoritesOnly };
  const filterActive = ratings.size < RATING_FILTERS.length || favoritesOnly;
  const matching = filterCards(cards, filter);
  const matchCount = (deckId: string) => matching.filter((c) => c.deckId === deckId).length;
  // With no card details (still loading), fall back to the deck's card count.
  const cardTotal = selected.reduce((sum, d) => sum + (filterActive ? matchCount(d.id) : d.cardCount), 0);
  const allSelected = studyable.length > 0 && selected.length === studyable.length;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(studyable.map((d) => d.id)));
  }

  function toggleRating(rating: RatingFilter) {
    setRatings((prev) => {
      const next = new Set(prev);
      if (next.has(rating)) next.delete(rating);
      else next.add(rating);
      return next;
    });
  }

  function start() {
    const params: Record<string, string> = { decks: selected.map((d) => d.id).join(',') };
    if (ratings.size < RATING_FILTERS.length) params.ratings = RATING_FILTERS.filter((r) => ratings.has(r)).join(',');
    if (favoritesOnly) params.favorites = '1';
    router.push({ pathname: '/revise', params });
  }

  if (decks === null) return <View className="flex-1 bg-page" />;

  return (
    <View className="flex-1 bg-page">
      <FlatList
        data={decks}
        keyExtractor={(deck) => deck.id}
        contentContainerClassName="w-full max-w-3xl self-center gap-2.5 px-4 pb-40 pt-2"
        ListHeaderComponent={
          decks.length > 0 ? (
            <View className="mb-2">
              <View className="mb-4 flex-row items-center gap-3 rounded-2xl bg-primary p-4">
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                  <Icon name="layers" size={22} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-white">Mix decks together</Text>
                  <Text className="text-sm leading-5 text-white/75">
                    Pick the decks to revise. Their cards are shuffled into one session.
                  </Text>
                </View>
              </View>
              <RevisionFilter
                ratings={ratings}
                onToggleRating={toggleRating}
                favoritesOnly={favoritesOnly}
                onToggleFavorites={() => setFavoritesOnly((f) => !f)}
              />
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-sm font-semibold text-muted">
                  {selected.length > 0 ? `${selected.length} selected` : 'Your decks'}
                </Text>
                {studyable.length > 0 ? (
                  <Pressable onPress={toggleAll} hitSlop={8}>
                    <Text className="text-sm font-semibold text-primary">
                      {allSelected ? 'Clear' : 'Select all'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState
            icon="layers-outline"
            title="No decks yet"
            text="Create decks in My Decks, then come back to revise them together."
            action={<Button label="Go to My Decks" icon="albums-outline" onPress={() => router.navigate('/')} />}
          />
        }
        renderItem={({ item: deck }) => {
          const empty = deck.cardCount === 0;
          const checked = !empty && selectedIds.has(deck.id);
          return (
            <Pressable
              disabled={empty}
              onPress={() => toggle(deck.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled: empty }}
              className={`flex-row items-center gap-3 rounded-2xl border-2 bg-white p-3.5 ${
                checked ? 'border-primary' : 'border-transparent'
              } ${empty ? 'opacity-50' : 'active:bg-surface'}`}
            >
              <DeckBadge name={deck.name} size={40} />
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink" numberOfLines={1}>
                  {deck.name}
                </Text>
                <Text className="text-sm text-muted">
                  {empty
                    ? 'No cards yet'
                    : filterActive
                      ? `${matchCount(deck.id)} of ${plural(deck.cardCount, 'card')} match`
                      : plural(deck.cardCount, 'card')}
                </Text>
              </View>
              <View
                className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                  checked ? 'border-primary bg-primary' : 'border-line'
                }`}
              >
                {checked ? <Icon name="checkmark" size={14} color="#ffffff" /> : null}
              </View>
            </Pressable>
          );
        }}
      />

      {decks.length > 0 ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-white px-4 pb-5 pt-3">
          <View className="w-full max-w-184 self-center">
            <Text className="mb-2 text-center text-sm text-muted">
              {selected.length === 0
                ? 'Select at least one deck'
                : cardTotal === 0
                  ? 'No cards match the filter'
                : `${plural(selected.length, 'deck')} · ${plural(cardTotal, 'card')}`}
            </Text>
            <Button label="Start revision" icon="play" variant="cta" disabled={cardTotal === 0} onPress={start} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Which cards to include: chips for each rating, plus "Favourites only". */
function RevisionFilter({
  ratings,
  onToggleRating,
  favoritesOnly,
  onToggleFavorites,
}: {
  ratings: Set<RatingFilter>;
  onToggleRating: (rating: RatingFilter) => void;
  favoritesOnly: boolean;
  onToggleFavorites: () => void;
}) {
  return (
    <View className="mb-4 rounded-2xl border border-line bg-white p-3.5">
      <Text className="mb-1 text-base font-bold text-ink">Which cards?</Text>
      <Text className="mb-3 text-sm text-muted">Based on how you rated them last time.</Text>
      <View className="mb-3 flex-row flex-wrap gap-2">
        {RATING_FILTERS.map((rating) => {
          const on = ratings.has(rating);
          const color = ratingColors[rating];
          return (
            <Pressable
              key={rating}
              onPress={() => onToggleRating(rating)}
              accessibilityRole="checkbox"
              accessibilityLabel={RATING_LABELS[rating]}
              accessibilityState={{ checked: on }}
              className="flex-row items-center gap-1.5 rounded-full px-3 py-2"
              style={{ backgroundColor: on ? color : colors.surface }}
            >
              <Icon name={ratingIcons[rating]} size={16} color={on ? colors.white : colors.muted} />
              <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-muted'}`}>
                {RATING_LABELS[rating]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={onToggleFavorites}
        accessibilityRole="switch"
        accessibilityLabel="Favourites only"
        accessibilityState={{ checked: favoritesOnly }}
        className="flex-row items-center gap-2 border-t border-line pt-3"
      >
        <Icon name={favoritesOnly ? 'star' : 'star-outline'} size={20} color={favoritesOnly ? colors.warning : colors.muted} />
        <Text className="flex-1 text-sm font-semibold text-ink">Favourites only</Text>
        <View className={`h-6 w-11 justify-center rounded-full px-0.5 ${favoritesOnly ? 'bg-primary' : 'bg-line'}`}>
          <View className={`h-5 w-5 rounded-full bg-white ${favoritesOnly ? 'self-end' : 'self-start'}`} />
        </View>
      </Pressable>
    </View>
  );
}
