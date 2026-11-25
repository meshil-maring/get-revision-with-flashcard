import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  colors,
  DeckBadge,
  Icon,
  plural,
  scaled,
  SectionHeader,
  SubjectIcon,
  type IconName,
} from '@/components/ui';
import { listDecks, pickContinueDeck } from '@/data/decks';
import type { DeckWithCount } from '@/data/types';
import { comingSoonHref } from '@/lib/coming-soon';

const NEW_DECK: Href = { pathname: '/flashcards', params: { new: 'deck' } };

export default function HomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [decks, setDecks] = useState<DeckWithCount[]>([]);

  useFocusEffect(
    useCallback(() => {
      listDecks(db).then(setDecks);
    }, [db]),
  );

  const continueDeck = pickContinueDeck(decks);

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="px-5 pb-8"
      contentContainerStyle={{ paddingTop: insets.top + scaled(12) }}
    >
      {/* App header */}
      <View className="mb-7 flex-row items-center">
        <MaterialCommunityIcons name="book-open-variant" size={scaled(48)} color={colors.brand} />
        <View className="ml-2 flex-1">
          <Text className="text-2xl font-extrabold leading-7 text-ink">NoteMe</Text>
          <Text className="text-base text-ink">with FlashCard</Text>
        </View>
        <Pressable
          onPress={() => router.push(comingSoonHref('notifications'))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          className="mr-4"
        >
          <Icon name="notifications-outline" size={30} color={colors.ink} />
          <View className="absolute right-0.5 top-0 h-3 w-3 rounded-full border-2 border-page bg-accent" />
        </Pressable>
        <Pressable
          onPress={() => router.navigate('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          className="h-12 w-12 items-center justify-center rounded-full bg-brand"
        >
          <Icon name="person-outline" size={24} color={colors.white} />
        </Pressable>
      </View>

      {/* Greeting */}
      <Text className="text-4xl font-extrabold text-ink">Hi there! 👋</Text>
      <Text className="mb-6 mt-1 text-lg text-muted">Study, create, and revise smarter.</Text>

      {/* Ask AI */}
      <Pressable
        onPress={() => router.push(comingSoonHref('ai'))}
        accessibilityRole="search"
        className="mb-7 flex-row items-center gap-3 rounded-2xl bg-cream py-2 pl-4 pr-2"
      >
        <Icon name="search-outline" size={24} color={colors.ink} />
        <Text className="flex-1 text-base text-muted" numberOfLines={1}>
          Ask AI to make notes or flashcards...
        </Text>
        <View className="h-12 w-14 items-center justify-center rounded-xl bg-brand">
          <Icon name="sparkles" size={22} color={colors.white} />
        </View>
      </Pressable>

      {/* Main tiles */}
      <View className="mb-8 flex-row gap-3">
        <Tile icon="document-text-outline" label="Notes" onPress={() => router.navigate('/notes')} />
        <Tile icon="layers-outline" label="Flashcards" onPress={() => router.navigate('/flashcards')} />
        <Tile
          icon="chatbubble-ellipses-outline"
          label="AI Study"
          onPress={() => router.push(comingSoonHref('ai-study'))}
        />
      </View>

      {/* Continue studying */}
      <SectionHeader title="Continue Studying" onMore={() => router.navigate('/flashcards')} />
      {continueDeck ? (
        <Pressable
          onPress={() => router.push({ pathname: '/study/[id]', params: { id: continueDeck.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Continue studying ${continueDeck.name}`}
          className="mb-8 flex-row items-center gap-4 rounded-3xl bg-cream p-4 active:bg-peach"
        >
          <DeckBadge name={continueDeck.name} size={60} />
          <View className="flex-1">
            <Text className="text-xl font-bold text-ink" numberOfLines={1}>
              {continueDeck.name}
            </Text>
            <Text className="text-base text-muted">{plural(continueDeck.cardCount, 'flashcard')}</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-full bg-brand">
            <Icon name="play" size={22} color={colors.white} />
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.navigate(NEW_DECK)}
          accessibilityRole="button"
          className="mb-8 flex-row items-center gap-4 rounded-3xl bg-cream p-4 active:bg-peach"
        >
          <View className="h-15 w-15 items-center justify-center rounded-2xl bg-peach">
            <Icon name="add" size={30} color={colors.brand} />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-ink">Nothing to study yet</Text>
            <Text className="text-sm text-muted">Create a deck and add some flashcards.</Text>
          </View>
        </Pressable>
      )}

      {/* Subjects (decks, for now) */}
      <SectionHeader title="Your Subjects" />
      {decks.length <= 4 ? (
        // Few subjects: fill the row like the design (up to 4 + "Add").
        <View className="flex-row gap-2">
          {decks.map((deck) => (
            <SubjectTile key={deck.id} deck={deck} fill />
          ))}
          <AddSubjectTile fill />
        </View>
      ) : (
        // Many subjects: scroll sideways.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {decks.map((deck) => (
            <SubjectTile key={deck.id} deck={deck} />
          ))}
          <AddSubjectTile />
        </ScrollView>
      )}
    </ScrollView>
  );
}

function SubjectTile({ deck, fill = false }: { deck: DeckWithCount; fill?: boolean }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/deck/[id]', params: { id: deck.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Open subject ${deck.name}`}
      className={`h-22 items-center justify-center gap-2 rounded-2xl bg-cream px-1 active:bg-peach ${
        fill ? 'flex-1' : 'w-18'
      }`}
    >
      <SubjectIcon name={deck.name} size={28} />
      <Text className="text-xs font-semibold text-ink" numberOfLines={1}>
        {deck.name}
      </Text>
    </Pressable>
  );
}

function AddSubjectTile({ fill = false }: { fill?: boolean }) {
  return (
    <Pressable
      onPress={() => router.navigate(NEW_DECK)}
      accessibilityRole="button"
      accessibilityLabel="Add subject"
      className={`h-22 items-center justify-center gap-2 rounded-2xl bg-cream active:bg-peach ${
        fill ? 'flex-1' : 'w-18'
      }`}
    >
      <Icon name="add" size={28} color={colors.brand} />
      <Text className="text-xs font-semibold text-ink">Add</Text>
    </Pressable>
  );
}

function Tile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="h-28 flex-1 items-center justify-center gap-2 rounded-3xl bg-brand active:bg-brand-dark"
    >
      <Icon name={icon} size={34} color={colors.white} />
      <Text className="text-base font-bold text-white" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
