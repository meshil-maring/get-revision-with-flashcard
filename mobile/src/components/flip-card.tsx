import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type Props = {
  front: string;
  back: string;
  flipped: boolean;
  onPress: () => void;
};

const DURATION_MS = 300;

/** A card that turns over (3D flip) between its front and back. */
export function FlipCard({ front, back, flipped, onPress }: Props) {
  const rotation = useSharedValue(flipped ? 180 : 0);

  useEffect(() => {
    rotation.value = withTiming(flipped ? 180 : 0, { duration: DURATION_MS });
  }, [flipped, rotation]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${rotation.value}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${rotation.value + 180}deg` }],
  }));

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Flips the card" className="flex-1">
      <Animated.View style={[styles.face, frontStyle]}>
        <Face label="Question" text={front} tone="front" />
      </Animated.View>
      <Animated.View style={[styles.face, backStyle]}>
        <Face label="Answer" text={back} tone="back" />
      </Animated.View>
    </Pressable>
  );
}

function Face({ label, text, tone }: { label: string; text: string; tone: 'front' | 'back' }) {
  return (
    <View
      className={`flex-1 items-center justify-center rounded-3xl border p-6 ${
        tone === 'front' ? 'border-slate-200 bg-white' : 'border-indigo-200 bg-indigo-50'
      }`}
    >
      <Text
        className={`absolute left-6 top-5 text-xs font-semibold uppercase tracking-wide ${
          tone === 'front' ? 'text-slate-400' : 'text-indigo-400'
        }`}
      >
        {label}
      </Text>
      <Text className="text-center text-2xl text-slate-900">{text}</Text>
      {tone === 'front' ? (
        <Text className="absolute bottom-5 text-sm text-slate-400">Tap to see the answer</Text>
      ) : null}
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
