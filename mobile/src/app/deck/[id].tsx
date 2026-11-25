import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ScreenTip } from '@/components/screen-tip';
import { RichText } from '@/components/rich-text';
import {
  Button,
  colors,
  DeckBadge,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  plural,
  RatingBadge,
  type IconName,
} from '@/components/ui';
import { listAttachmentsForCards } from '@/data/attachments';
import { deleteCard, listCards, setFavorite } from '@/data/cards';
import { getDeck } from '@/data/decks';
import type { Attachment, AttachmentKind, Card, Deck } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { ratingOf } from '@/lib/revision';

const KIND_ICONS: Record<AttachmentKind, IconName> = {
  image: 'image-outline',
  pdf: 'document-text-outline',
  audio: 'musical-notes-outline',
};

export default function DeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined); // undefined = loading
  const [cards, setCards] = useState<Card[]>([]);
  const [attachments, setAttachments] = useState<Map<string, Attachment[]>>(new Map());
  // Answers stay hidden (so you can test yourself) until you tap to show them.
  const [shownAnswers, setShownAnswers] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const [d, c] = await Promise.all([getDeck(db, id), listCards(db, id)]);
    setDeck(d);
    setCards(c);
    setAttachments(await listAttachmentsForCards(db, c.map((card) => card.id)));
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function openEditor(card?: Card) {
    router.push({ pathname: '/card-editor', params: card ? { deckId: id, cardId: card.id } : { deckId: id } });
  }

  function toggleAnswer(cardId: string) {
    setShownAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  async function toggleFavorite(card: Card) {
    await setFavorite(db, card.id, card.favoritedAt === null);
    await refresh();
  }

  async function handleDelete(card: Card) {
    const ok = await confirm('Delete card?', `"${card.front}" will be deleted.`);
    if (!ok) return;
    await deleteCard(db, card.id);
    await refresh();
  }

  if (deck === undefined) {
    return <Stack.Screen options={{ title: '' }} />;
  }

  if (deck === null) {
    return (
      <View className="flex-1 justify-center bg-page">
        <Stack.Screen options={{ title: 'Not found' }} />
        <EmptyState
          icon="alert-circle-outline"
          title="Deck not found"
          text="This deck no longer exists."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-page">
      <Stack.Screen options={{ title: deck.name }} />

      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        contentContainerClassName="w-full max-w-3xl self-center gap-3 px-4 pb-32 pt-2"
        ListHeaderComponent={
          <View className="mb-2 gap-3">
            <View className="rounded-2xl border border-line bg-white p-4">
              <View className="flex-row items-center gap-3">
                <DeckBadge name={deck.name} size={52} />
                <View className="flex-1">
                  <Text className="text-lg font-bold text-ink">{deck.name}</Text>
                  <Text className="text-sm text-muted">{plural(cards.length, 'card')}</Text>
                </View>
              </View>
              {deck.description ? (
                <Text className="mt-3 text-sm leading-5 text-muted">{deck.description}</Text>
              ) : null}
              {cards.length > 0 ? (
                <Button
                  label="Study"
                  icon="play"
                  variant="cta"
                  className="mt-4"
                  onPress={() => router.push({ pathname: '/study/[id]', params: { id } })}
                />
              ) : null}
            </View>
            {cards.length > 0 ? <ScreenTip id="deck" /> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="copy-outline"
            title="No cards yet"
            text="Add a card with a question on the front and the answer on the back."
          />
        }
        renderItem={({ item: card, index }) => {
          const shown = shownAnswers.has(card.id);
          const favorite = card.favoritedAt !== null;
          const kinds = [...new Set((attachments.get(card.id) ?? []).map((a) => a.kind))];
          return (
            <View className="rounded-2xl border border-line bg-white">
              <View className="flex-row items-start gap-3 p-4 pb-3">
                <Text className="w-6 pt-0.5 text-xs font-bold text-muted">{index + 1}</Text>
                <View className="flex-1 gap-3">
                  <View>
                    <View className="mb-1 flex-row items-center gap-2">
                      <Text className="text-xs font-bold uppercase tracking-wider text-muted">Question</Text>
                      <RatingBadge rating={ratingOf(card)} />
                      {kinds.map((kind) => (
                        <Icon key={kind} name={KIND_ICONS[kind]} size={16} color={colors.muted} />
                      ))}
                    </View>
                    <Text className="text-base font-medium leading-6 text-ink">{card.front}</Text>
                  </View>
                  <Pressable
                    onPress={() => toggleAnswer(card.id)}
                    accessibilityRole="button"
                    accessibilityLabel={shown ? 'Hide answer' : 'Show answer'}
                    className={`rounded-xl p-3 ${shown ? 'bg-primary-soft' : 'border border-dashed border-line bg-surface'}`}
                  >
                    {shown ? (
                      <RichText text={card.back} />
                    ) : (
                      <View className="flex-row items-center justify-center gap-1.5">
                        <Icon name="eye-outline" size={18} color={colors.primary} />
                        <Text className="text-sm font-semibold text-primary">Tap to show answer</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
              <View className="flex-row justify-end border-t border-line px-2 py-1">
                <IconButton
                  icon={favorite ? 'star' : 'star-outline'}
                  label={favorite ? 'Remove from favourites' : 'Add to favourites'}
                  tone={favorite ? 'favorite' : 'default'}
                  onPress={() => toggleFavorite(card)}
                />
                <IconButton icon="create-outline" label="Edit card" onPress={() => openEditor(card)} />
                <IconButton icon="trash-outline" label="Delete card" tone="danger" onPress={() => handleDelete(card)} />
              </View>
            </View>
          );
        }}
      />

      <Fab label="Add card" onPress={() => openEditor()} />
    </View>
  );
}
