import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RichText } from '@/components/rich-text';
import { colors, EmptyState, Icon } from '@/components/ui';
import { findTopic, GUIDE_TOPICS } from '@/lib/guide';

/** One topic of the user guide, with links to the previous and next topic. */
export default function HelpTopicScreen() {
  const { topic: topicId } = useLocalSearchParams<{ topic: string }>();
  const topic = findTopic(topicId);

  if (!topic) {
    return (
      <View className="flex-1 justify-center bg-page">
        <Stack.Screen options={{ title: 'Help' }} />
        <EmptyState icon="help-circle-outline" title="Topic not found" text="Go back to see all the help topics." />
      </View>
    );
  }

  const index = GUIDE_TOPICS.indexOf(topic);
  const previous = GUIDE_TOPICS[index - 1];
  const next = GUIDE_TOPICS[index + 1];

  // Replace, not push: reading through the guide shouldn't stack up screens behind it.
  function open(id: string) {
    router.replace({ pathname: '/help/[topic]', params: { topic: id } });
  }

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="w-full max-w-2xl self-center px-5 pb-10 pt-4">
      <Stack.Screen options={{ title: topic.section }} />

      <View className="mb-5 flex-row items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft">
          <Icon name={topic.icon} size={30} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-3xl font-extrabold text-ink">{topic.title}</Text>
          <Text className="text-sm text-muted">{topic.summary}</Text>
        </View>
      </View>

      <View className="rounded-3xl border border-line bg-white p-5">
        <RichText text={topic.body} />
      </View>

      <View className="mt-6 flex-row gap-3">
        {previous ? (
          <NavButton direction="previous" title={previous.title} onPress={() => open(previous.id)} />
        ) : (
          <View className="flex-1" />
        )}
        {next ? (
          <NavButton direction="next" title={next.title} onPress={() => open(next.id)} />
        ) : (
          <View className="flex-1" />
        )}
      </View>
    </ScrollView>
  );
}

function NavButton({
  direction,
  title,
  onPress,
}: {
  direction: 'previous' | 'next';
  title: string;
  onPress: () => void;
}) {
  const isNext = direction === 'next';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${isNext ? 'Next' : 'Previous'}: ${title}`}
      className={`flex-1 gap-1 rounded-2xl border border-line bg-white p-3.5 active:bg-surface ${
        isNext ? 'items-end' : 'items-start'
      }`}
    >
      <View className="flex-row items-center gap-1">
        {isNext ? null : <Icon name="arrow-back" size={14} color={colors.muted} />}
        <Text className="text-xs font-semibold uppercase tracking-wider text-muted">{isNext ? 'Next' : 'Previous'}</Text>
        {isNext ? <Icon name="arrow-forward" size={14} color={colors.muted} /> : null}
      </View>
      <Text className={`text-base font-bold text-primary ${isNext ? 'text-right' : ''}`} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}
