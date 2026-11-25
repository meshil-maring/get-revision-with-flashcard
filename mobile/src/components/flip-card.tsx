import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AttachmentList, type AttachmentItem } from '@/components/attachments';
import { RichText } from '@/components/rich-text';

type Props = {
  front: string;
  back: string; // may contain formatting
  frontAttachments?: AttachmentItem[];
  backAttachments?: AttachmentItem[];
  flipped: boolean;
  onPress: () => void;
};

const DURATION_MS = 300;

/** A card that turns over (3D flip) between its front and back. */
export function FlipCard({ front, back, frontAttachments = [], backAttachments = [], flipped, onPress }: Props) {
  const rotation = useSharedValue(flipped ? 180 : 0);

  useEffect(() => {
    rotation.value = withTiming(flipped ? 180 : 0, { duration: DURATION_MS });
  }, [flipped, rotation]);

  // backfaceVisibility alone isn't reliable on Android and web (the answer can show
  // through, mirrored), so each side is also fully hidden while it faces away.
  const frontStyle = useAnimatedStyle(() => ({
    opacity: rotation.value < 90 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${rotation.value}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: rotation.value >= 90 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${rotation.value + 180}deg` }],
  }));

  return (
    <View className="flex-1">
      {/* Only the side facing up can be touched (so hidden audio/PDF buttons can't be pressed). */}
      <Animated.View style={[styles.face, frontStyle]} pointerEvents={flipped ? 'none' : 'auto'}>
        <Face label="Question" tone="front" onPress={onPress} attachments={frontAttachments}>
          <Text className="text-center text-2xl font-semibold leading-9 text-ink">{front}</Text>
        </Face>
      </Animated.View>
      <Animated.View style={[styles.face, backStyle]} pointerEvents={flipped ? 'auto' : 'none'}>
        {/* The answer isn't rendered at all until the card is turned over. */}
        {flipped ? (
          <Face label="Answer" tone="back" onPress={onPress} attachments={backAttachments}>
            <RichText text={back} tone="onDark" center size="lg" />
          </Face>
        ) : (
          <View className="flex-1 rounded-3xl bg-primary" />
        )}
      </Animated.View>
    </View>
  );
}

function Face({
  label,
  tone,
  onPress,
  attachments,
  children,
}: {
  label: string;
  tone: 'front' | 'back';
  onPress: () => void;
  attachments: AttachmentItem[];
  children: React.ReactNode;
}) {
  const front = tone === 'front';
  return (
    <View className={`flex-1 overflow-hidden rounded-3xl ${front ? 'border border-line bg-white' : 'bg-primary'}`}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityHint="Flips the card"
          className="flex-grow items-center justify-center gap-5 px-7 pb-14 pt-16"
        >
          {children}
          <AttachmentList items={attachments} tone={front ? 'default' : 'onDark'} />
        </Pressable>
      </ScrollView>

      <View
        pointerEvents="none"
        className={`absolute left-5 top-5 rounded-full px-3 py-1 ${front ? 'bg-surface' : 'bg-white/20'}`}
      >
        <Text className={`text-xs font-bold uppercase tracking-wider ${front ? 'text-muted' : 'text-white'}`}>
          {label}
        </Text>
      </View>
      <Text
        pointerEvents="none"
        className={`absolute bottom-4 self-center text-sm ${front ? 'text-muted' : 'text-white/75'}`}
      >
        {front ? 'Tap to see the answer' : 'Tap to see the question'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backfaceVisibility: 'hidden',
  },
});
