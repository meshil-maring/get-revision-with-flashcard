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
  const front = tone === 'front';
  return (
    <View
      className={`flex-1 items-center justify-center rounded-3xl p-8 ${
        front ? 'border border-line bg-white' : 'bg-primary'
      }`}
    >
      <View
        className={`absolute left-5 top-5 rounded-full px-3 py-1 ${
          front ? 'bg-surface' : 'bg-white/20'
        }`}
      >
        <Text
          className={`text-xs font-bold uppercase tracking-wider ${
            front ? 'text-muted' : 'text-white'
          }`}
        >
          {label}
        </Text>
      </View>
      <Text
        className={`text-center text-2xl font-semibold leading-9 ${
          front ? 'text-ink' : 'text-white'
        }`}
      >
        {text}
      </Text>
      <Text className={`absolute bottom-5 text-sm ${front ? 'text-muted' : 'text-white/75'}`}>
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
