import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { AutoNextPicker, autoNextLabel, autoNextShort } from '@/components/auto-next-picker';
import { ScreenTip } from '@/components/screen-tip';
import { RichText } from '@/components/rich-text';
import {
  Button,
  colors,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  plural,
  RatingBadge,
  ratingColors,
  SubjectIcon,
  type IconName,
} from '@/components/ui';
import { listAttachmentsForCards } from '@/data/attachments';
import { deleteCard, listCards, setFavorite } from '@/data/cards';
import { getDeck } from '@/data/decks';
import {
  AUTO_NEXT_OPTIONS,
  getAutoNext,
  getAutoNextPauseOnAnswer,
  getLastCustomAutoNext,
  setAutoNext,
  setAutoNextPauseOnAnswer,
  setLastCustomAutoNext,
} from '@/data/settings';
import type { Attachment, AttachmentKind, Card, Deck } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { RATING_LABELS, ratingOf, type RatingFilter } from '@/lib/revision';
import { formatStudyTotal } from '@/lib/use-study-timer';

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
  // Seconds per card before study moves on by itself (0 = off).
  const [autoNext, setAutoNextState] = useState(0);
  const [pickingTime, setPickingTime] = useState(false);
  const [recentCustom, setRecentCustom] = useState(0);
  const [pauseOnAnswer, setPauseOnAnswer] = useState(false);

  const refresh = useCallback(async () => {
    const [d, c, a, recent, pause] = await Promise.all([
      getDeck(db, id),
      listCards(db, id),
      getAutoNext(db, id),
      getLastCustomAutoNext(db),
      getAutoNextPauseOnAnswer(db, id),
    ]);
    setDeck(d);
    setCards(c);
    setAutoNextState(a);
    setRecentCustom(recent);
    setPauseOnAnswer(pause);
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
            {/* The deck: a blue panel with cards stacked behind it, so it stands apart from its cards. */}
            <View style={{ paddingBottom: 12 }}>
              <View className="absolute bottom-0 left-6 right-6 h-10 rounded-3xl bg-primary/20" />
              <View className="absolute left-3 right-3 h-10 rounded-3xl bg-primary/45" style={{ bottom: 6 }} />
              <View className="overflow-hidden rounded-3xl bg-primary p-5 shadow-lg">
                <View pointerEvents="none" className="absolute h-44 w-44 rounded-full bg-white/10" style={{ right: -40, top: -48 }} />
                <View pointerEvents="none" className="absolute h-36 w-36 rounded-full bg-white/5" style={{ bottom: -64, right: 64 }} />

                <View className="flex-row items-center gap-3">
                  <View className="h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
                    <SubjectIcon name={deck.name} size={30} color={colors.white} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold uppercase tracking-widest text-white/70">Deck</Text>
                    <Text className="text-2xl font-extrabold text-white" numberOfLines={2}>
                      {deck.name}
                    </Text>
                  </View>
                </View>
                {deck.description ? (
                  <Text className="mt-3 text-sm leading-5 text-white/85">{deck.description}</Text>
                ) : null}

                <View className="mt-4 flex-row flex-wrap gap-2">
                  <StatPill icon="copy-outline" label={plural(cards.length, 'card')} />
                  <StatPill
                    icon="time-outline"
                    label={deck.studySeconds > 0 ? `${formatStudyTotal(deck.studySeconds)} studied` : 'Not studied yet'}
                    accessibilityLabel={`Studied for ${formatStudyTotal(deck.studySeconds)}`}
                  />
                </View>

                {cards.length > 0 ? <RatingBar cards={cards} /> : null}

                {cards.length > 0 ? (
                  <View className="mt-4 flex-row gap-2.5">
                    <Button
                      label="Study"
                      icon="play"
                      variant="cta"
                      className="flex-1"
                      onPress={() => router.push({ pathname: '/study/[id]', params: { id } })}
                    />
                    <Pressable
                      onPress={() => setPickingTime(true)}
                      accessibilityRole="button"
                      accessibilityLabel={`Time per card: ${autoNextLabel(autoNext)}`}
                      accessibilityHint="Choose how long each card stays before moving to the next"
                      className={`w-20 items-center justify-center rounded-2xl ${
                        autoNext > 0 ? 'bg-white' : 'border border-white/30 bg-white/15 active:bg-white/25'
                      }`}
                    >
                      <Icon name="timer-outline" size={26} color={autoNext > 0 ? colors.primary : colors.white} />
                      <Text className={`text-xs font-bold ${autoNext > 0 ? 'text-primary' : 'text-white/85'}`}>
                        {autoNextShort(autoNext)}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>

            {cards.length > 0 ? <ScreenTip id="deck" /> : null}
            {cards.length > 0 ? (
              <View className="mt-1 flex-row items-end justify-between px-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xl font-extrabold text-ink">Cards</Text>
                  <View className="rounded-full bg-primary-soft px-2.5 py-0.5">
                    <Text className="text-xs font-bold text-primary">{cards.length}</Text>
                  </View>
                </View>
                <Text className="text-xs text-muted">Answers hidden · test yourself</Text>
              </View>
            ) : null}
            <AutoNextPicker
              visible={pickingTime}
              value={autoNext}
              recent={recentCustom}
              pauseOnAnswer={pauseOnAnswer}
              onPauseOnAnswerChange={(on) => {
                setPauseOnAnswer(on);
                setAutoNextPauseOnAnswer(db, id, on);
              }}
              onClose={() => setPickingTime(false)}
              onChange={(seconds) => {
                setAutoNextState(seconds);
                setAutoNext(db, id, seconds);
                // Remember a custom time so it's offered first next time (in every deck).
                if (seconds > 0 && !AUTO_NEXT_OPTIONS.includes(seconds)) {
                  setRecentCustom(seconds);
                  setLastCustomAutoNext(db, seconds);
                }
              }}
            />
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
          const rating = ratingOf(card);
          return (
            <View className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
              {/* Coloured edge: how this card felt last time (grey = new). */}
              <View className="absolute bottom-0 left-0 top-0 w-1.5" style={{ backgroundColor: ratingColors[rating] }} />
              <View className="flex-row items-start gap-3 p-4 pb-3 pl-5">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-soft">
                  <Text className="text-xs font-extrabold text-primary">{index + 1}</Text>
                </View>
                <View className="flex-1 gap-3">
                  <View>
                    <View className="mb-1 flex-row items-center gap-2">
                      <Text className="text-xs font-bold uppercase tracking-wider text-muted">Question</Text>
                      <RatingBadge rating={rating} />
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

/** A small see-through pill on the blue deck panel. */
function StatPill({ icon, label, accessibilityLabel }: { icon: IconName; label: string; accessibilityLabel?: string }) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      className="flex-row items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"
    >
      <Icon name={icon} size={18} color={colors.white} />
      <Text className="text-sm font-semibold text-white">{label}</Text>
    </View>
  );
}

const BAR_ORDER: RatingFilter[] = ['easy', 'ok', 'hard', 'new'];
const NEW_ON_BLUE = 'rgba(255,255,255,0.45)';

/** How the deck's cards are rated, as one bar with a short key. */
function RatingBar({ cards }: { cards: Card[] }) {
  const counts = BAR_ORDER.map((rating) => ({ rating, count: cards.filter((c) => ratingOf(c) === rating).length }));
  const shown = counts.filter((c) => c.count > 0);
  return (
    <View
      className="mt-4"
      accessibilityLabel={`Ratings: ${shown.map((c) => `${c.count} ${RATING_LABELS[c.rating]}`).join(', ')}`}
    >
      <View className="h-2.5 flex-row overflow-hidden rounded-full bg-white/20">
        {shown.map(({ rating, count }) => (
          <View
            key={rating}
            style={{ flex: count, backgroundColor: rating === 'new' ? NEW_ON_BLUE : ratingColors[rating] }}
          />
        ))}
      </View>
      <View className="mt-1.5 flex-row flex-wrap gap-x-3">
        {shown.map(({ rating, count }) => (
          <View key={rating} className="flex-row items-center gap-1">
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: rating === 'new' ? NEW_ON_BLUE : ratingColors[rating] }}
            />
            <Text className="text-xs font-semibold text-white/85">
              {count} {RATING_LABELS[rating]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
