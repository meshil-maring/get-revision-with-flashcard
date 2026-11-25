import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';

import { ScreenTip } from '@/components/screen-tip';
import { Button, colors, DeckBadge, EmptyState, Icon, plural, RatingBadge } from '@/components/ui';
import { listFavoriteCards, setFavorite } from '@/data/cards';
import type { FavoriteCard } from '@/data/types';
import { ratingOf } from '@/lib/revision';

type Section = { deckId: string; title: string; data: FavoriteCard[] };

/** Group favourites by deck, keeping the order the decks first appear in. */
function byDeck(cards: FavoriteCard[]): Section[] {
  const sections = new Map<string, Section>();
  for (const card of cards) {
    const section = sections.get(card.deckId) ?? { deckId: card.deckId, title: card.deckName, data: [] };
    section.data.push(card);
    sections.set(card.deckId, section);
  }
  return [...sections.values()];
}

/** Every favourite card, grouped by the deck it comes from. */
export default function FavoritesScreen() {
  const db = useSQLiteContext();
  const [cards, setCards] = useState<FavoriteCard[] | null>(null); // null = loading

  const refresh = useCallback(async () => {
    setCards(await listFavoriteCards(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function unfavorite(card: FavoriteCard) {
    await setFavorite(db, card.id, false);
    await refresh();
  }

  if (cards === null) return <View className="flex-1 bg-page" />;

  const sections = byDeck(cards);

  return (
    <View className="flex-1 bg-page">
      <SectionList
        sections={sections}
        keyExtractor={(card) => card.id}
        stickySectionHeadersEnabled={false}
        contentContainerClassName="w-full max-w-3xl self-center px-4 pb-36 pt-2"
        ListHeaderComponent={
          cards.length > 0 ? (
            <View className="gap-3">
              <ScreenTip id="favorites" />
              <Text className="mb-1 px-1 text-sm font-semibold text-muted">
                {plural(cards.length, 'favourite')} from {plural(sections.length, 'deck')}
              </Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState
            icon="star-outline"
            title="No favourites yet"
            text="Tap the star on a card while studying, or in a deck, to keep it here."
          />
        }
        renderSectionHeader={({ section }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: section.deckId } })}
            accessibilityRole="button"
            accessibilityLabel={`Open deck ${section.title}`}
            className="mb-2 mt-4 flex-row items-center gap-3 px-1"
          >
            <DeckBadge name={section.title} size={36} />
            <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={1}>
              {section.title}
            </Text>
            <Text className="text-sm text-muted">{plural(section.data.length, 'card')}</Text>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
        renderItem={({ item: card }) => (
          <View className="mb-2 flex-row items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
            <View className="flex-1 gap-1">
              <Text className="text-base font-medium text-ink" numberOfLines={3}>
                {card.front}
              </Text>
              <View className="flex-row">
                <RatingBadge rating={ratingOf(card)} />
              </View>
            </View>
            <Pressable
              onPress={() => unfavorite(card)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove from favourites"
              className="h-10 w-10 items-center justify-center rounded-full active:bg-surface"
            >
              <Icon name="star" size={24} color={colors.warning} />
            </Pressable>
          </View>
        )}
      />

      {cards.length > 0 ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-white px-4 pb-5 pt-3">
          <View className="w-full max-w-184 self-center">
            <Button
              label={`Revise favourites (${cards.length})`}
              icon="play"
              variant="cta"
              onPress={() => router.push({ pathname: '/revise', params: { favorites: '1' } })}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
