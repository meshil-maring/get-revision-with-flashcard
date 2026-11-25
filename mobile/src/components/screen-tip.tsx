import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors, Icon } from '@/components/ui';
import { dismissTip, isTipDismissed } from '@/data/settings';

type Tip = { title: string; text: string; topic: string };

// Every screen's tip, with the Help & guide topic that explains more.
// Keep them to one or two short sentences.
export const TIPS = {
  home: {
    title: 'Build a streak',
    text: 'Study a few cards every day. Each day you study fills a square in your Consistency grid.',
    topic: 'streak',
  },
  flashcards: {
    title: 'Your decks',
    text: 'Tap a deck to add cards, ▶ to study it, or Create revision to mix several decks together.',
    topic: 'decks',
  },
  notes: {
    title: 'Folders inside folders',
    text: 'Make a folder for each class, then add subjects, chapters and topics inside it. Star favourites and tag notes to find them fast.',
    topic: 'notes',
  },
  deck: {
    title: 'Test yourself here too',
    text: 'Answers stay hidden until you tap them. Use the star to save a card to Favourites.',
    topic: 'cards',
  },
  cardEditor: {
    title: 'Make answers easy to read',
    text: 'Select words and use the toolbar for headings, bold or highlights. Add pictures, PDFs or a voice note to either side.',
    topic: 'attachments',
  },
  study: {
    title: 'Think first, then rate',
    text: 'Try to answer before you look. Rate honestly: Hard cards can be revised again later.',
    topic: 'rating',
  },
  summary: {
    title: 'Practise what was hard',
    text: 'Your Hard cards are already ticked. Tap Revise selected to go through them again now.',
    topic: 'summary',
  },
  revision: {
    title: 'Choose your cards',
    text: 'Use Which cards? to revise only Hard or New cards, or just your favourites.',
    topic: 'revision',
  },
  favorites: {
    title: 'All your stars in one place',
    text: 'Favourites from every deck, grouped by deck. Tap a deck name to open it.',
    topic: 'favourites',
  },
} satisfies Record<string, Tip>;

export type TipId = keyof typeof TIPS;

/**
 * A small hint at the top of a screen. "Got it" hides it for good (Help & guide →
 * Show tips again brings them back); "Learn more" opens the matching guide topic.
 */
export function ScreenTip({ id, className = '' }: { id: TipId; className?: string }) {
  const db = useSQLiteContext();
  // Hidden until we know it wasn't dismissed, so it never flashes on screen.
  const [visible, setVisible] = useState(false);
  const tip = TIPS[id];

  // Checked each time the screen comes into view, so "Show tips again" works on tabs too.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      isTipDismissed(db, id)
        .then((dismissed) => {
          if (!cancelled) setVisible(!dismissed);
        })
        .catch(() => {
          // If settings can't be read, just don't show the tip.
        });
      return () => {
        cancelled = true;
      };
    }, [db, id]),
  );

  if (!visible) return null;

  function close() {
    setVisible(false);
    dismissTip(db, id);
  }

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Tip: ${tip.title}`}
      className={`flex-row gap-3 rounded-2xl border border-primary/20 bg-primary-soft p-3.5 ${className}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-white">
        <Icon name="bulb" size={20} color={colors.warning} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-ink">{tip.title}</Text>
        <Text className="mt-0.5 text-sm leading-5 text-muted">{tip.text}</Text>
        <View className="mt-2 flex-row items-center gap-4">
          <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
            <Text className="text-sm font-bold text-primary">Got it</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/help/[topic]', params: { topic: tip.topic } })}
            hitSlop={8}
            accessibilityRole="link"
          >
            <Text className="text-sm font-semibold text-muted underline">Learn more</Text>
          </Pressable>
        </View>
      </View>
      <Pressable
        onPress={close}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close tip"
        className="h-6 w-6 items-center justify-center"
      >
        <Icon name="close" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}
