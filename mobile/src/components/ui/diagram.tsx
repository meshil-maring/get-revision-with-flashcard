import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, useColors } from '@/components/ui';
import { svgAspectRatio, svgDataUri } from '@/lib/svg';

/** Wider than this, a diagram's labels get bigger than the text around them. */
const MAX_WIDTH = 560;

/**
 * A diagram from a note, drawn from its SVG. Tap it to see it as big as the screen allows,
 * which helps on phones, where it may sit in the narrow notes column of a Cornell note.
 */
export function Diagram({ svg, caption, label }: { svg: string; caption: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const uri = svgDataUri(svg);
  const name = label ? `Diagram: ${label}` : 'Diagram';

  if (!uri) {
    return (
      <View className="my-1 rounded-xl border border-dashed border-line p-3">
        <Text className="text-sm text-muted">This diagram can&apos;t be shown.</Text>
      </View>
    );
  }

  return (
    <View className="my-1 w-full items-center gap-1">
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${name}. Tap to enlarge.`}
        className="w-full items-center"
      >
        <Image
          source={{ uri }}
          contentFit="contain"
          style={{ width: '100%', maxWidth: MAX_WIDTH, aspectRatio: svgAspectRatio(svg) }}
          accessible={false}
        />
      </Pressable>
      {label ? <Text className="text-center text-sm italic text-muted">{caption}</Text> : null}

      <Modal
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        supportedOrientations={['portrait', 'landscape']}
      >
        {open ? <FullScreenDiagram uri={uri} title={label || 'Diagram'} name={name} onClose={() => setOpen(false)} /> : null}
      </Modal>
    </View>
  );
}

/** The diagram filling the screen, with its caption and a close button. */
function FullScreenDiagram({ uri, title, name, onClose }: { uri: string; title: string; name: string; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-card" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-row items-center gap-2 px-3 py-2">
        <Text className="flex-1 text-base font-bold text-ink" numberOfLines={2}>
          {title}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close diagram"
          className="h-11 w-11 items-center justify-center rounded-full active:bg-surface"
        >
          <Icon name="close" size={30} color={colors.ink} />
        </Pressable>
      </View>
      <Image source={{ uri }} contentFit="contain" style={{ flex: 1, margin: 8 }} accessibilityLabel={name} />
    </View>
  );
}
