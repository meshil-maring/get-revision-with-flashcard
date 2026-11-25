import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { AttachmentItem } from '@/components/attachments';
import { ScreenTip } from '@/components/screen-tip';
import { FlipCard } from '@/components/flip-card';
import {
  Button,
  colors,
  EmptyState,
  Icon,
  plural,
  ratingColors,
  ratingIcons,
  SubjectIcon,
} from '@/components/ui';
import { recordReview } from '@/data/activity';
import { listAttachmentsForCards } from '@/data/attachments';
import { rateCard, setFavorite } from '@/data/cards';
import type { Attachment, Card, Rating } from '@/data/types';
import { groupByRating, RATING_LABELS } from '@/lib/revision';
import { shuffle } from '@/lib/shuffle';

type Props = {
  title: string;
  cards: Card[]; // original order
  emptyText: string;
  backLabel: string;
  initialShuffle?: boolean;
  /** Optional small label above the card, e.g. which deck it comes from. */
  cardLabel?: (card: Card) => string | undefined;
};

const RATINGS: Rating[] = ['hard', 'ok', 'easy'];

function toItems(attachments: Attachment[] | undefined, side: 'front' | 'back'): AttachmentItem[] {
  return (attachments ?? [])
    .filter((a) => a.side === side)
    .map((a) => ({ key: a.id, kind: a.kind, uri: a.uri, name: a.name, mimeType: a.mimeType }));
}

/**
 * Go through cards one at a time: shared by single-deck study and multi-deck revision.
 * Each card starts on its question; after showing the answer you rate it Hard, OK or
 * Easy. At the end you see how it went and can revise the cards you pick again.
 */
export function StudySession({
  title,
  cards,
  emptyText,
  backLabel,
  initialShuffle = false,
  cardLabel,
}: Props) {
  const db = useSQLiteContext();
  // The cards in this round: all of them at first, or the ones picked on the summary.
  const [pool, setPool] = useState<Card[]>(cards);
  const [shuffled, setShuffled] = useState(initialShuffle);
  const [order, setOrder] = useState<Card[]>(() => (initialShuffle ? shuffle(cards) : cards));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const [ratings, setRatings] = useState<Map<string, Rating>>(new Map());
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(cards.filter((c) => c.favoritedAt).map((c) => c.id)),
  );
  const [attachments, setAttachments] = useState<Map<string, Attachment[]>>(new Map());
  // Cards already counted for the streak in this round (going back and forward doesn't count twice).
  const counted = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    listAttachmentsForCards(db, cards.map((c) => c.id)).then((byCard) => {
      if (!cancelled && byCard) setAttachments(byCard);
    });
    return () => {
      cancelled = true;
    };
  }, [db, cards]);

  function restart(nextPool: Card[], nextShuffled: boolean) {
    setPool(nextPool);
    setShuffled(nextShuffled);
    setOrder(nextShuffled ? shuffle(nextPool) : nextPool);
    setIndex(0);
    setFlipped(false);
    setFinished(false);
    setRatings(new Map());
    counted.current = new Set();
  }

  function goTo(nextIndex: number) {
    setFlipped(false);
    setIndex(nextIndex);
  }

  function rate(rating: Rating) {
    const card = order[index];
    setRatings((prev) => new Map(prev).set(card.id, rating));
    rateCard(db, card.id, rating);
    // A card counts as reviewed (for the streak) the first time it's rated in a round.
    if (!counted.current.has(card.id)) {
      counted.current.add(card.id);
      recordReview(db);
    }
    if (index < order.length - 1) {
      goTo(index + 1);
    } else {
      setFinished(true);
    }
  }

  function toggleFavorite(card: Card) {
    const next = !favorites.has(card.id);
    setFavorites((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(card.id);
      else copy.delete(card.id);
      return copy;
    });
    setFavorite(db, card.id, next);
  }

  if (order.length === 0) {
    return (
      <Centered title={title}>
        <EmptyState icon="copy-outline" title="No cards to study" text={emptyText} />
        <Button label={backLabel} icon="arrow-back" onPress={() => router.back()} className="w-full" />
      </Centered>
    );
  }

  if (finished) {
    return (
      <Summary
        title={title}
        cards={order}
        ratings={ratings}
        backLabel={backLabel}
        cardLabel={cardLabel}
        onReviseSelected={(selected) => restart(selected, shuffled)}
        onStudyAgain={() => restart(pool, shuffled)}
      />
    );
  }

  const card = order[index];
  const isFirst = index === 0;
  const label = cardLabel?.(card);
  const favorite = favorites.has(card.id);
  const currentRating = ratings.get(card.id);

  return (
    <View className="flex-1 bg-page px-5 pb-6 pt-2">
      <Stack.Screen options={{ title }} />

      <View className="mx-auto w-full max-w-xl flex-1">
        {/* Progress, favourite and shuffle */}
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-muted">
            <Text className="text-ink">{index + 1}</Text> / {order.length}
          </Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => toggleFavorite(card)}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityLabel="Favourite"
              accessibilityState={{ checked: favorite }}
              className={`h-8 w-8 items-center justify-center rounded-full ${
                favorite ? 'bg-warning' : 'border border-line bg-white'
              }`}
            >
              <Icon name={favorite ? 'star' : 'star-outline'} size={18} color={favorite ? colors.white : colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => restart(pool, !shuffled)}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityLabel="Shuffle"
              accessibilityState={{ checked: shuffled }}
              className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                shuffled ? 'bg-primary' : 'border border-line bg-white'
              }`}
            >
              <Icon name="shuffle" size={15} color={shuffled ? '#ffffff' : colors.muted} />
              <Text className={`text-sm font-semibold ${shuffled ? 'text-white' : 'text-muted'}`}>Shuffle</Text>
            </Pressable>
          </View>
        </View>
        <View className="mb-5 h-2 overflow-hidden rounded-full bg-surface">
          <View className="h-full rounded-full bg-calm" style={{ width: `${((index + 1) / order.length) * 100}%` }} />
        </View>

        <ScreenTip id="study" className="mb-3" />

        {label ? (
          <View className="mb-3 flex-row items-center gap-2 self-center rounded-full border border-line bg-white px-3 py-1.5">
            <SubjectIcon name={label} size={16} />
            <Text className="text-sm font-semibold text-ink">{label}</Text>
          </View>
        ) : null}

        {/* key = card id: a new card always starts on its front, with no flip animation. */}
        <FlipCard
          key={card.id}
          front={card.front}
          back={card.back}
          frontAttachments={toItems(attachments.get(card.id), 'front')}
          backAttachments={toItems(attachments.get(card.id), 'back')}
          flipped={flipped}
          onPress={() => setFlipped((f) => !f)}
        />

        {/* Controls: show the answer first, then rate how it went. */}
        <View className="mt-6 flex-row gap-3">
          <Pressable
            disabled={isFirst}
            onPress={() => goTo(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            className={`h-14 w-14 items-center justify-center rounded-2xl border ${
              isFirst ? 'border-line bg-surface' : 'border-line bg-white active:bg-surface'
            }`}
          >
            <Icon name="arrow-back" size={22} color={isFirst ? colors.faint : colors.ink} />
          </Pressable>
          {flipped ? (
            RATINGS.map((rating) => {
              const chosen = currentRating === rating;
              return (
                <Pressable
                  key={rating}
                  onPress={() => rate(rating)}
                  accessibilityRole="button"
                  accessibilityLabel={RATING_LABELS[rating]}
                  accessibilityState={{ selected: chosen }}
                  className="h-14 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl active:opacity-80"
                  style={{
                    backgroundColor: chosen ? ratingColors[rating] : `${ratingColors[rating]}1f`,
                    borderWidth: 1.5,
                    borderColor: ratingColors[rating],
                  }}
                >
                  <Icon name={ratingIcons[rating]} size={20} color={chosen ? colors.white : ratingColors[rating]} />
                  <Text className="text-base font-bold" style={{ color: chosen ? colors.white : colors.ink }}>
                    {RATING_LABELS[rating]}
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <Pressable
              onPress={() => setFlipped(true)}
              accessibilityRole="button"
              className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cta active:bg-cta-dark"
            >
              <Icon name="eye-outline" size={20} color="#ffffff" />
              <Text className="text-base font-semibold text-white">Show answer</Text>
            </Pressable>
          )}
        </View>
        {flipped ? (
          <Text className="mt-2 text-center text-xs text-muted">How well did you know it?</Text>
        ) : null}
      </View>
    </View>
  );
}

// --- End of a round ----------------------------------------------------------------

function Summary({
  title,
  cards,
  ratings,
  backLabel,
  cardLabel,
  onReviseSelected,
  onStudyAgain,
}: {
  title: string;
  cards: Card[];
  ratings: Map<string, Rating>;
  backLabel: string;
  cardLabel?: (card: Card) => string | undefined;
  onReviseSelected: (cards: Card[]) => void;
  onStudyAgain: () => void;
}) {
  const groups = groupByRating(cards, ratings);
  // Hard cards are picked for the next round to start with; change it as you like.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(cards.filter((c) => ratings.get(c.id) === 'hard').map((c) => c.id)),
  );
  const selectedCards = cards.filter((c) => selected.has(c.id));

  function toggle(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <View className="flex-1 bg-page">
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerClassName="w-full max-w-xl self-center px-5 pb-8 pt-4">
        <View className="mb-5 items-center">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-calm-soft">
            <Icon name="trophy" size={40} color={colors.warning} />
          </View>
          <Text className="mb-1 text-3xl font-bold text-ink">Well done!</Text>
          <Text className="text-center text-base text-muted">You went through all {plural(cards.length, 'card')}.</Text>
        </View>

        {/* How it went */}
        <View className="mb-6 flex-row gap-2">
          {RATINGS.map((rating) => {
            const count = cards.filter((c) => ratings.get(c.id) === rating).length;
            return (
              <View
                key={rating}
                accessibilityLabel={`${RATING_LABELS[rating]}: ${count}`}
                className="flex-1 items-center rounded-2xl py-3"
                style={{ backgroundColor: `${ratingColors[rating]}1f` }}
              >
                <Icon name={ratingIcons[rating]} size={24} color={ratingColors[rating]} />
                <Text className="mt-1 text-2xl font-extrabold text-ink">{count}</Text>
                <Text className="text-sm font-semibold text-muted">{RATING_LABELS[rating]}</Text>
              </View>
            );
          })}
        </View>

        {groups.some((g) => g.rating === 'hard') ? <ScreenTip id="summary" className="mb-4" /> : null}

        <Text className="mb-1 text-xl font-bold text-ink">Revise again</Text>
        <Text className="mb-3 text-sm text-muted">Pick the cards for a new round. Hard ones are picked for you.</Text>

        {groups.map((group) => {
          const ids = group.cards.map((c) => c.id);
          const allOn = ids.every((id) => selected.has(id));
          const color = ratingColors[group.rating];
          return (
            <View key={group.rating} className="mb-4 overflow-hidden rounded-2xl border border-line bg-white">
              <View className="flex-row items-center gap-2 px-4 py-3" style={{ backgroundColor: `${color}1f` }}>
                <Icon name={ratingIcons[group.rating]} size={20} color={color} />
                <Text className="flex-1 text-base font-bold text-ink">
                  {RATING_LABELS[group.rating]} · {group.cards.length}
                </Text>
                <Pressable
                  onPress={() => toggle(ids, !allOn)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${allOn ? 'Clear' : 'Select all'} ${RATING_LABELS[group.rating]}`}
                >
                  <Text className="text-sm font-semibold text-primary">{allOn ? 'Clear' : 'Select all'}</Text>
                </Pressable>
              </View>
              {group.cards.map((card) => {
                const on = selected.has(card.id);
                const label = cardLabel?.(card);
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => toggle([card.id], !on)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    className="flex-row items-center gap-3 border-t border-line px-4 py-3 active:bg-surface"
                  >
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                        on ? 'border-primary bg-primary' : 'border-line'
                      }`}
                    >
                      {on ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-base text-ink" numberOfLines={2}>
                        {card.front}
                      </Text>
                      {label ? <Text className="text-xs text-muted">{label}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        <View className="mt-2 gap-3">
          <Button
            label={selectedCards.length > 0 ? `Revise selected (${selectedCards.length})` : 'Select cards to revise'}
            icon="play"
            variant="cta"
            disabled={selectedCards.length === 0}
            onPress={() => onReviseSelected(selectedCards)}
          />
          <Button label="Study all again" icon="refresh" variant="primary" onPress={onStudyAgain} />
          <Button label={backLabel} variant="secondary" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  );
}

export function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center bg-page px-8">
      <Stack.Screen options={{ title }} />
      <View className="w-full max-w-sm items-center">{children}</View>
    </View>
  );
}
