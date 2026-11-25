import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, colors, Icon, type IconName } from '@/components/ui';
import { markWelcomeSeen } from '@/data/settings';

type Point = { icon: IconName; color: string; text: string };
type Page = { icon: IconName; color: string; title: string; text: string; points: Point[] };

// The welcome tour. Keep each page short: one idea, a few points.
const WELCOME_PAGES: Page[] = [
  {
    icon: 'school',
    color: colors.primary,
    title: 'Welcome to NoteMe',
    text: 'Make flashcards, study them, and revise smarter. Here is how it works in four quick steps.',
    points: [
      { icon: 'layers-outline', color: colors.primary, text: 'Keep your cards in decks, one per subject' },
      { icon: 'flash-outline', color: colors.cta, text: 'Test yourself, then rate how well you knew it' },
      { icon: 'flame-outline', color: colors.alert, text: 'Study a little every day to build a streak' },
    ],
  },
  {
    icon: 'albums',
    color: colors.calm,
    title: 'Make your cards',
    text: 'Create a deck in the Flashcards tab (or with the + button), then add cards to it.',
    points: [
      { icon: 'help-circle-outline', color: colors.primary, text: 'Put a question on the front and the answer on the back' },
      { icon: 'text-outline', color: colors.calm, text: 'Format answers with headings, bold, underline, highlights and lists' },
      { icon: 'attach-outline', color: colors.cta, text: 'Attach pictures, PDFs, or record your voice' },
    ],
  },
  {
    icon: 'eye',
    color: colors.cta,
    title: 'Study and rate',
    text: 'Press ▶ on a deck. Try to remember the answer before you look.',
    points: [
      { icon: 'eye-outline', color: colors.primary, text: 'Tap Show answer (or the card) to turn it over' },
      { icon: 'alert-circle', color: colors.alert, text: 'Rate it Hard, OK or Easy, so the app knows what to bring back' },
      { icon: 'star', color: colors.warning, text: 'Tap the star to keep a card in your Favourites' },
    ],
  },
  {
    icon: 'git-merge',
    color: colors.primary,
    title: 'Revise smarter',
    text: 'Use Create revision to mix decks into one session, and focus on what you need.',
    points: [
      { icon: 'funnel-outline', color: colors.primary, text: 'Pick only Hard cards, new ones, or your favourites' },
      { icon: 'stats-chart-outline', color: colors.calm, text: 'At the end, see how it went, grouped by rating' },
      { icon: 'refresh', color: colors.cta, text: 'Revise the cards you pick again, straight away' },
    ],
  },
];

/** The welcome tour: shown once on first launch, and again from More → App tour. */
export default function WelcomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const page = WELCOME_PAGES[index];
  const isLast = index === WELCOME_PAGES.length - 1;

  async function finish() {
    await markWelcomeSeen(db);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <View className="flex-1 bg-page" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center justify-between px-5 py-3">
        <Text className="text-sm font-semibold text-muted">
          {index + 1} of {WELCOME_PAGES.length}
        </Text>
        {isLast ? null : (
          <Pressable onPress={finish} hitSlop={10} accessibilityRole="button">
            <Text className="text-base font-semibold text-primary">Skip</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerClassName="w-full max-w-md flex-grow self-center justify-center px-6 py-4">
        <View className="mb-8 items-center">
          <View
            className="mb-6 h-36 w-36 items-center justify-center rounded-full"
            style={{ backgroundColor: `${page.color}1f` }}
          >
            <View
              className="h-24 w-24 items-center justify-center rounded-full"
              style={{ backgroundColor: page.color }}
            >
              <Icon name={page.icon} size={56} color={colors.white} />
            </View>
          </View>
          <Text className="mb-2 text-center text-3xl font-extrabold text-ink">{page.title}</Text>
          <Text className="text-center text-base leading-6 text-muted">{page.text}</Text>
        </View>

        <View className="gap-3">
          {page.points.map((point) => (
            <View key={point.text} className="flex-row items-center gap-3 rounded-2xl bg-white p-3.5">
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${point.color}1f` }}
              >
                <Icon name={point.icon} size={22} color={point.color} />
              </View>
              <Text className="flex-1 text-base leading-5 text-ink">{point.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="w-full max-w-md self-center px-6">
        {/* Page dots */}
        <View className="mb-5 flex-row justify-center gap-2">
          {WELCOME_PAGES.map((p, i) => (
            <Pressable
              key={p.title}
              onPress={() => setIndex(i)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Go to step ${i + 1}`}
              className={`h-2.5 rounded-full ${i === index ? 'w-7 bg-primary' : 'w-2.5 bg-line'}`}
            />
          ))}
        </View>
        <View className="flex-row gap-3">
          {index > 0 ? (
            <Pressable
              onPress={() => setIndex(index - 1)}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="h-14 w-14 items-center justify-center rounded-2xl border border-line bg-white active:bg-surface"
            >
              <Icon name="arrow-back" size={22} color={colors.ink} />
            </Pressable>
          ) : null}
          <Button
            label={isLast ? 'Get started' : 'Next'}
            icon={isLast ? 'checkmark' : 'arrow-forward'}
            variant="cta"
            className="flex-1"
            onPress={isLast ? finish : () => setIndex(index + 1)}
          />
        </View>
      </View>
    </View>
  );
}
