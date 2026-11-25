import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FlipCard } from '@/components/flip-card';
import { listCards } from '@/data/cards';
import { getDeck } from '@/data/decks';
import type { Card, Deck } from '@/data/types';
import { shuffle } from '@/lib/shuffle';

type Session = {
  deck: Deck | null;
  cards: Card[]; // original order
};

export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [session, setSession] = useState<Session | null>(null); // null = loading
  const [order, setOrder] = useState<Card[]>([]);
  const [shuffled, setShuffled] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDeck(db, id), listCards(db, id)]).then(([deck, cards]) => {
      if (cancelled) return;
      setSession({ deck, cards });
      setOrder(cards);
    });
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  function restart(nextShuffled: boolean) {
    if (!session) return;
    setShuffled(nextShuffled);
    setOrder(nextShuffled ? shuffle(session.cards) : session.cards);
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

  if (session === null) {
    return <Stack.Screen options={{ title: 'Study' }} />;
  }

  if (session.deck === null) {
    return (
      <Centered title="Not found">
        <Text className="text-lg text-slate-600">This deck no longer exists.</Text>
      </Centered>
    );
  }

  const title = `Study: ${session.deck.name}`;

  if (order.length === 0) {
    return (
      <Centered title={title}>
        <Text className="mb-2 text-lg font-semibold text-slate-800">No cards to study</Text>
        <Text className="mb-6 text-center text-slate-500">Add some cards to this deck first.</Text>
        <PrimaryButton label="Back to deck" onPress={() => router.back()} />
      </Centered>
    );
  }

  if (finished) {
    return (
      <Centered title={title}>
        <Text className="mb-2 text-5xl">🎉</Text>
        <Text className="mb-2 text-2xl font-semibold text-slate-900">Well done!</Text>
        <Text className="mb-8 text-center text-slate-600">
          You went through all {order.length} {order.length === 1 ? 'card' : 'cards'}.
        </Text>
        <View className="w-full gap-3">
          <PrimaryButton label="Study again" onPress={() => restart(shuffled)} />
          <SecondaryButton label="Back to deck" onPress={() => router.back()} />
        </View>
      </Centered>
    );
  }

  const card = order[index];
  const isFirst = index === 0;

  return (
    <View className="flex-1 bg-slate-50 px-5 pb-8 pt-4">
      <Stack.Screen options={{ title }} />

      {/* Progress and shuffle */}
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-base font-medium text-slate-600">
          {index + 1} / {order.length}
        </Text>
        <Pressable
          onPress={() => restart(!shuffled)}
          hitSlop={8}
          className={`rounded-full px-3 py-1 ${shuffled ? 'bg-indigo-600' : 'bg-slate-200'}`}
        >
          <Text className={`text-sm font-medium ${shuffled ? 'text-white' : 'text-slate-700'}`}>
            🔀 Shuffle {shuffled ? 'on' : 'off'}
          </Text>
        </Pressable>
      </View>
      <View className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <View
          className="h-full rounded-full bg-indigo-600"
          style={{ width: `${((index + 1) / order.length) * 100}%` }}
        />
      </View>

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
          className={`flex-1 items-center rounded-xl border py-4 ${
            isFirst ? 'border-slate-200' : 'border-slate-300 bg-white active:bg-slate-100'
          }`}
        >
          <Text className={`text-base font-semibold ${isFirst ? 'text-slate-300' : 'text-slate-700'}`}>
            ← Previous
          </Text>
        </Pressable>
        <Pressable
          onPress={next}
          className="flex-1 items-center rounded-xl bg-indigo-600 py-4 active:bg-indigo-700"
        >
          <Text className="text-base font-semibold text-white">
            {index === order.length - 1 ? 'Finish' : 'Next →'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 px-8">
      <Stack.Screen options={{ title }} />
      {children}
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="w-full items-center rounded-xl bg-indigo-600 py-4 active:bg-indigo-700">
      <Text className="text-base font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="w-full items-center rounded-xl border border-slate-300 bg-white py-4 active:bg-slate-100"
    >
      <Text className="text-base font-semibold text-slate-700">{label}</Text>
    </Pressable>
  );
}
