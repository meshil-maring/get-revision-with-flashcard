import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';

import { colors, EmptyState, Icon } from '@/components/ui';
import { resetTips } from '@/data/settings';
import { GUIDE_SECTIONS, searchGuide, type GuideTopic } from '@/lib/guide';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

/** Help & guide: every topic of the user guide, with a search box. */
export default function HelpScreen() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [tipsReset, setTipsReset] = useState(false);

  async function showTipsAgain() {
    await resetTips(db);
    setTipsReset(true);
  }
  const results = searchGuide(query);
  const searching = query.trim().length > 0;

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="w-full max-w-3xl self-center px-5 pb-10 pt-3"
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-5 flex-row items-center gap-3 rounded-2xl bg-primary p-4">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-white/20">
          <Icon name="book" size={22} color={colors.white} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-white">How to use StudyMe</Text>
          <Text className="text-sm leading-5 text-white/75">
            Short guides to every feature. Read them in any order.
          </Text>
        </View>
      </View>

      <View className="mb-5 flex-row items-center gap-2 rounded-2xl border border-line bg-white px-4">
        <Icon name="search-outline" size={20} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search the guide, e.g. PDF, streak, hard"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Search the guide"
          returnKeyType="search"
          style={NO_WEB_FOCUS_RING}
          className="flex-1 py-3 text-base text-ink"
        />
        {searching ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Icon name="close-circle" size={20} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        results.length > 0 ? (
          <TopicGroup title={`${results.length} ${results.length === 1 ? 'result' : 'results'}`} topics={results} />
        ) : (
          <EmptyState icon="search-outline" title="Nothing found" text="Try another word, or browse the topics." />
        )
      ) : (
        GUIDE_SECTIONS.map((section) => (
          <TopicGroup key={section} title={section} topics={results.filter((t) => t.section === section)} />
        ))
      )}

      <Pressable
        onPress={() => router.push('/welcome')}
        accessibilityRole="button"
        className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-4 active:bg-surface"
      >
        <Icon name="compass-outline" size={20} color={colors.primary} />
        <Text className="text-base font-semibold text-primary">Watch the quick app tour</Text>
      </Pressable>

      <Pressable
        onPress={showTipsAgain}
        disabled={tipsReset}
        accessibilityRole="button"
        className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-4 active:bg-surface"
      >
        <Icon name={tipsReset ? 'checkmark-circle' : 'bulb-outline'} size={20} color={tipsReset ? colors.calm : colors.primary} />
        <Text className={`text-base font-semibold ${tipsReset ? 'text-calm' : 'text-primary'}`}>
          {tipsReset ? 'Tips will show again on each screen' : 'Show tips again'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function TopicGroup({ title, topics }: { title: string; topics: GuideTopic[] }) {
  if (topics.length === 0) return null;
  return (
    <View className="mb-6">
      <Text className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">{title}</Text>
      <View className="overflow-hidden rounded-3xl bg-surface">
        {topics.map((topic, i) => (
          <Pressable
            key={topic.id}
            onPress={() => router.push({ pathname: '/help/[topic]', params: { topic: topic.id } })}
            accessibilityRole="button"
            className={`flex-row items-center gap-4 p-4 active:bg-line ${i > 0 ? 'border-t border-line' : ''}`}
          >
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-white">
              <Icon name={topic.icon} size={22} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-ink">{topic.title}</Text>
              <Text className="text-sm text-muted">{topic.summary}</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
