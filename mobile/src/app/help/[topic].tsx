import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GuideBody } from '@/components/help/guide-body';
import { EmptyState, Icon, useColors } from '@/components/ui';
import { findTopic, GUIDE_TOPICS } from '@/lib/guide';

/** One topic of the user guide, with links to the previous and next topic. */
export default function HelpTopicScreen() {
  const colors = useColors();
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

      <View className="mb-5 flex-row items-center gap-4">
        <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary-soft">
          <Icon name={topic.icon} size={40} color={colors.primary} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-3xl font-extrabold text-ink" accessibilityRole="header">
            {topic.title}
          </Text>
          <Text className="text-base leading-5 text-muted">{topic.summary}</Text>
        </View>
      </View>

      <GuideBody text={topic.body} />

      <View className="mt-6 flex-row items-stretch gap-3">
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
  const colors = useColors();
  const isNext = direction === 'next';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${isNext ? 'Next' : 'Previous'}: ${title}`}
      className={`flex-1 justify-center gap-1 rounded-2xl p-4 ${
        isNext ? 'items-end bg-primary shadow-md active:bg-primary-dark' : 'items-start border border-line bg-card active:bg-surface'
      }`}
    >
      <View className="flex-row items-center gap-1">
        {isNext ? null : <Icon name="chevron-back" size={16} color={colors.muted} />}
        <Text className={`text-sm font-semibold ${isNext ? 'text-white/80' : 'text-muted'}`}>{isNext ? 'Next' : 'Previous'}</Text>
        {isNext ? <Icon name="chevron-forward" size={16} color={colors.white} /> : null}
      </View>
      <Text className={`text-lg font-bold ${isNext ? 'text-right text-white' : 'text-primary'}`} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}
