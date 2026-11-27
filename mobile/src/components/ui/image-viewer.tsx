import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, Icon } from '@/components/ui';

export type ViewerImage = { key: string; uri: string; name: string; caption?: string | null; altText?: string | null };

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const TAP_SCALE = 2.5;

/**
 * Full-screen image viewer: pinch or double-tap to zoom, drag to look around a zoomed image,
 * − / + for a mouse, and ‹ › between a note's images. Shows the caption underneath.
 */
export function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: ViewerImage[];
  /** The image showing; null = closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const image = index !== null ? images[index] : undefined;
  // Shared values are read and written with get() / set(), which the React Compiler allows.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  /** Back to the whole picture, centred (also when the gestures zoom all the way out). */
  function unzoom() {
    'worklet';
    scale.set(withTiming(1));
    savedScale.set(1);
    x.set(withTiming(0));
    y.set(withTiming(0));
    savedX.set(0);
    savedY.set(0);
  }

  function reset() {
    unzoom();
    setZoomed(false);
  }

  function zoomTo(next: number) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    if (clamped === 1) return reset();
    scale.set(withTiming(clamped));
    savedScale.set(clamped);
    setZoomed(true);
  }

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      scale.set(Math.min(MAX_SCALE, Math.max(MIN_SCALE * 0.8, savedScale.get() * e.scale)));
    },
    onDeactivate: () => {
      'worklet';
      const settled = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.get()));
      if (settled === 1) return unzoom();
      scale.set(withTiming(settled));
      savedScale.set(settled);
    },
  });
  const pan = usePanGesture({
    minPointers: 1,
    onUpdate: (e) => {
      'worklet';
      if (savedScale.get() <= 1 && scale.get() <= 1) return; // nothing to look around
      x.set(savedX.get() + e.translationX);
      y.set(savedY.get() + e.translationY);
    },
    onDeactivate: () => {
      'worklet';
      savedX.set(x.get());
      savedY.set(y.get());
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: () => {
      'worklet';
      if (savedScale.get() > 1) return unzoom();
      scale.set(withTiming(TAP_SCALE));
      savedScale.set(TAP_SCALE);
    },
  });
  const gestures = useSimultaneousGestures(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  const count = images.length;
  // Another image, or closing, starts again from the whole picture.
  const go = (step: number) => {
    if (index === null) return;
    reset();
    onIndexChange((index + step + count) % count);
  };
  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={image !== undefined} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black/95" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="flex-row items-center gap-2 px-3 py-2">
            <Text className="flex-1 text-sm font-semibold text-white" numberOfLines={1}>
              {image?.name}
              {count > 1 && index !== null ? `  ·  ${index + 1} of ${count}` : ''}
            </Text>
            <ViewerButton icon="remove" label="Zoom out" onPress={() => zoomTo(savedScale.value / 1.5)} />
            <ViewerButton icon="add" label="Zoom in" onPress={() => zoomTo(savedScale.value * 1.5)} />
            <ViewerButton icon="close" label="Close image" onPress={close} />
          </View>

          <View className="flex-1 overflow-hidden">
            {image ? (
              <GestureDetector gesture={gestures}>
                <Animated.View style={[{ flex: 1 }, imageStyle]}>
                  <Image
                    source={{ uri: image.uri }}
                    contentFit="contain"
                    style={{ width: '100%', height: '100%' }}
                    accessibilityLabel={image.altText || image.caption || image.name}
                  />
                </Animated.View>
              </GestureDetector>
            ) : null}
            {count > 1 && !zoomed ? (
              <>
                <View className="absolute bottom-0 left-2 top-0 justify-center">
                  <ViewerButton icon="chevron-back" label="Previous image" onPress={() => go(-1)} />
                </View>
                <View className="absolute bottom-0 right-2 top-0 justify-center">
                  <ViewerButton icon="chevron-forward" label="Next image" onPress={() => go(1)} />
                </View>
              </>
            ) : null}
          </View>

          <View className="gap-1 px-5 pt-3">
            {image?.caption ? <Text className="text-center text-base text-white">{image.caption}</Text> : null}
            <Text className="text-center text-xs text-white/60">Pinch or double-tap to zoom</Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ViewerButton({ icon, label, onPress }: { icon: 'add' | 'remove' | 'close' | 'chevron-back' | 'chevron-forward'; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-11 items-center justify-center rounded-full bg-white/15 active:bg-white/30"
    >
      <Icon name={icon} size={24} color={colors.white} />
    </Pressable>
  );
}
