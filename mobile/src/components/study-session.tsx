import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FlipCard } from '@/components/flip-card';
import { Button, colors, EmptyState, Icon, plural, SubjectIcon } from '@/components/ui';
import type { Card } from '@/data/types';
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

/** Flip through cards one at a time: shared by single-deck study and multi-deck revision. */
export function StudySession({
  title,
  cards,
  emptyText,
  backLabel,
  initialShuffle = false,
  cardLabel,
}: Props) {
  const [shuffled, setShuffled] = useState(initialShuffle);
  const [order, setOrder] = useState<Card[]>(() => (initialShuffle ? shuffle(cards) : cards));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);

  function restart(nextShuffled: boolean) {
    setShuffled(nextShuffled);
    setOrder(nextShuffled ? shuffle(cards) : cards);
    setIndex(0);
    setFlipped(false);
    setFinished(false);
  }

  function goTo(nextIndex: number) {
    setFlipped(false);
    setIndex(nextIndex);
  }

  function next() {
    if (index < order.length - 1) {
      goTo(index + 1);
    } else {
      setFinished(true);
    }
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
      <Centered title={title}>
        <View className="mb-6 h-24 w-24 items-center justify-center rounded-full bg-peach">
          <Icon name="trophy" size={44} color={colors.brand} />
        </View>
        <Text className="mb-2 text-3xl font-bold text-ink">Well done!</Text>
        <Text className="mb-10 text-center text-base text-muted">
          You went through all {plural(order.length, 'card')}.
        </Text>
        <View className="w-full gap-3">
          <Button label="Study again" icon="refresh" onPress={() => restart(shuffled)} />
          <Button label={backLabel} variant="secondary" onPress={() => router.back()} />
        </View>
      </Centered>
    );
  }

  const card = order[index];
  const isFirst = index === 0;
  const isLast = index === order.length - 1;
  const label = cardLabel?.(card);

  return (
    <View className="flex-1 bg-page px-5 pb-6 pt-2">
      <Stack.Screen options={{ title }} />

      <View className="mx-auto w-full max-w-xl flex-1">
        {/* Progress and shuffle */}
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-muted">
            <Text className="text-ink">{index + 1}</Text> / {order.length}
          </Text>
          <Pressable
            onPress={() => restart(!shuffled)}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityLabel="Shuffle"
            accessibilityState={{ checked: shuffled }}
            className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
              shuffled ? 'bg-brand' : 'border border-line bg-white'
            }`}
          >
            <Icon name="shuffle" size={15} color={shuffled ? '#ffffff' : colors.muted} />
            <Text className={`text-sm font-semibold ${shuffled ? 'text-white' : 'text-muted'}`}>
              Shuffle
            </Text>
          </Pressable>
        </View>
        <View className="mb-5 h-2 overflow-hidden rounded-full bg-cream">
          <View
            className="h-full rounded-full bg-brand"
            style={{ width: `${((index + 1) / order.length) * 100}%` }}
          />
        </View>

        {label ? (
          <View className="mb-3 flex-row items-center gap-2 self-center rounded-full bg-white px-3 py-1.5 border border-line">
            <SubjectIcon name={label} size={16} />
            <Text className="text-sm font-semibold text-ink">{label}</Text>
          </View>
        ) : null}

        {/* key = card id: a new card always starts on its front, with no flip animation. */}
        <FlipCard
          key={card.id}
          front={card.front}
          back={card.back}
          flipped={flipped}
          onPress={() => setFlipped((f) => !f)}
        />

        {/* Controls */}
        <View className="mt-6 flex-row gap-3">
          <Pressable
            disabled={isFirst}
            onPress={() => goTo(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            className={`h-14 w-14 items-center justify-center rounded-2xl border ${
              isFirst ? 'border-line bg-cream' : 'border-line bg-white active:bg-cream'
            }`}
          >
            <Icon name="arrow-back" size={22} color={isFirst ? colors.faint : colors.ink} />
          </Pressable>
          <Pressable
            onPress={next}
            accessibilityRole="button"
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:bg-brand-dark"
          >
            <Text className="text-base font-semibold text-white">{isLast ? 'Finish' : 'Next'}</Text>
            <Icon name={isLast ? 'checkmark' : 'arrow-forward'} size={20} color="#ffffff" />
          </Pressable>
        </View>
      </View>
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
