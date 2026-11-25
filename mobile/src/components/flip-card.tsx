import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AttachmentList, type AttachmentItem } from '@/components/attachments';
import { RichText } from '@/components/rich-text';
import { colors, Icon } from '@/components/ui';

type Props = {
  front: string;
  back: string; // may contain formatting
  frontAttachments?: AttachmentItem[];
  backAttachments?: AttachmentItem[];
  flipped: boolean;
  onPress: () => void;
  /** When given, a pencil button on the top right opens the card editor. */
  onEdit?: () => void;
};

const DURATION_MS = 300;

/** A card that turns over (3D flip) between its front and back. */
export function FlipCard({
  front,
  back,
  frontAttachments = [],
  backAttachments = [],
  flipped,
  onPress,
  onEdit,
}: Props) {
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
        <Face label="Question" tone="front" onPress={onPress} onEdit={onEdit} attachments={frontAttachments}>
          <Text className="text-center text-3xl font-extrabold leading-10 text-ink">{front}</Text>
        </Face>
      </Animated.View>
      <Animated.View style={[styles.face, backStyle]} pointerEvents={flipped ? 'auto' : 'none'}>
        {/* The answer isn't rendered at all until the card is turned over. */}
        {flipped ? (
          <Face label="Answer" tone="back" onPress={onPress} onEdit={onEdit} attachments={backAttachments}>
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
  onEdit,
  attachments,
  children,
}: {
  label: string;
  tone: 'front' | 'back';
  onPress: () => void;
  onEdit?: () => void;
  attachments: AttachmentItem[];
  children: React.ReactNode;
}) {
  const front = tone === 'front';
  return (
    <View
      className={`flex-1 overflow-hidden rounded-3xl shadow-lg ${front ? 'border border-line bg-white' : 'bg-primary'}`}
    >
      <Decoration front={front} />

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityHint="Flips the card"
          className="flex-grow items-center justify-center gap-5 px-7 pb-16 pt-20"
        >
          {children}
          <AttachmentList items={attachments} tone={front ? 'default' : 'onDark'} />
        </Pressable>
      </ScrollView>

      <View
        pointerEvents="none"
        className={`absolute left-5 top-5 flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${
          front ? 'bg-primary-soft' : 'bg-white/20'
        }`}
      >
        <Icon name={front ? 'help-circle-outline' : 'bulb-outline'} size={22} color={front ? colors.primary : colors.white} />
        <Text className={`text-sm font-bold ${front ? 'text-primary' : 'text-white'}`}>{label}</Text>
      </View>
      {onEdit ? (
        <Pressable
          onPress={onEdit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Edit card"
          className={`absolute right-5 top-5 flex-row items-center gap-1 rounded-full px-3.5 py-2 ${
            front ? 'border border-line bg-white active:bg-surface' : 'bg-white/20 active:bg-white/30'
          }`}
        >
          <Icon name="create-outline" size={20} color={front ? colors.primary : colors.white} />
          <Text className={`text-sm font-bold ${front ? 'text-primary' : 'text-white'}`}>Edit</Text>
        </Pressable>
      ) : null}
      <View pointerEvents="none" className="absolute bottom-4 flex-row items-center gap-1 self-center">
        <Icon name="sync-outline" size={16} color={front ? colors.muted : 'rgba(255,255,255,0.75)'} />
        <Text className={`text-sm ${front ? 'text-muted' : 'text-white/75'}`}>
          {front ? 'Tap to see the answer' : 'Tap to see the question'}
        </Text>
      </View>
    </View>
  );
}

/** Soft overlapping shapes in two corners, so the card doesn't look like a blank page. */
function Decoration({ front }: { front: boolean }) {
  const shade = (alpha: number) => (front ? `rgba(47,107,216,${alpha})` : `rgba(255,255,255,${alpha})`);
  const blob = (size: number, alpha: number, position: object) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: shade(alpha),
    ...position,
  });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={blob(220, 0.06, { top: -120, right: -60 })} />
      <View style={blob(150, 0.08, { top: -80, right: -50 })} />
      <View style={blob(240, 0.06, { bottom: -150, left: -90 })} />
      <View style={blob(160, 0.08, { bottom: -100, left: -70 })} />
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
