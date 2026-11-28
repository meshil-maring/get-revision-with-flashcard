import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, scaled, useColors } from '@/components/ui';
import { FOCUS_SOUNDS, FOCUS_VOLUMES, type FocusSound } from '@/lib/focus-sounds';
import { useFocusSound } from '@/providers/focus-sound';

/** The music button in a screen's header: opens the study sounds; filled in while one plays. */
export function FocusSoundButton() {
  const colors = useColors();
  const { playing } = useFocusSound();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Study sounds (playing)' : 'Study sounds'}
        className={`h-12 w-12 items-center justify-center rounded-full ${playing ? 'bg-primary-soft' : 'active:bg-surface'}`}
      >
        <Icon name={playing ? 'musical-notes' : 'musical-notes-outline'} size={26} color={playing ? colors.primary : colors.muted} />
      </Pressable>
      <FocusSoundSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Pick a sound to study to, set how loud it is, or stop it. */
export function FocusSoundSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { sound, playing, volume, play, toggle, setVolume } = useFocusSound();
  const music = FOCUS_SOUNDS.filter((s) => s.kind === 'music');
  const noise = FOCUS_SOUNDS.filter((s) => s.kind === 'noise');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close study sounds" />
      <View className="max-h-[85%] rounded-t-3xl bg-page px-5 pt-3" style={{ paddingBottom: insets.bottom + scaled(16) }}>
        <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-line" />
        <Text className="text-xl font-bold text-ink">Study sounds</Text>
        <Text className="mb-3 text-sm text-muted">Keeps playing while you move between screens.</Text>
        <ScrollView contentContainerClassName="gap-2 pb-2">
          <Group title="Music" sounds={music} current={sound.id} playing={playing} onPick={play} />
          <Group title="Background sounds" sounds={noise} current={sound.id} playing={playing} onPick={play} />
          <Text className="mt-3 text-sm font-semibold uppercase tracking-wider text-muted">Volume</Text>
          <VolumePicker volume={volume} onChange={setVolume} />
        </ScrollView>
        <Button
          className="mt-3"
          label={playing ? 'Stop' : `Play ${sound.title}`}
          icon={playing ? 'stop' : 'play'}
          variant={playing ? 'secondary' : 'primary'}
          onPress={toggle}
        />
      </View>
    </Modal>
  );
}

function Group({
  title,
  sounds,
  current,
  playing,
  onPick,
}: {
  title: string;
  sounds: FocusSound[];
  current: string;
  playing: boolean;
  onPick: (id: string) => void;
}) {
  const colors = useColors();
  return (
    <>
      <Text className="mt-1 text-sm font-semibold uppercase tracking-wider text-muted">{title}</Text>
      {/* Two tiles a row, so all the sounds fit without much scrolling. */}
      <View className="flex-row flex-wrap justify-between gap-y-2">
        {sounds.map((s) => {
          const isCurrent = s.id === current;
          const isPlaying = isCurrent && playing;
          return (
            <Pressable
              key={s.id}
              onPress={() => onPick(s.id)}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}, ${s.description}${isPlaying ? ', playing' : ''}`}
              accessibilityState={{ selected: isCurrent }}
              className={`w-[49%] gap-1 rounded-2xl p-3 ${
                isPlaying ? 'border-2 border-primary bg-primary-soft' : 'border-2 border-transparent bg-surface active:bg-line'
              }`}
            >
              <View className="flex-row items-center justify-between">
                <Icon name={s.icon} size={24} color={isPlaying ? colors.primary : colors.ink} />
                {isPlaying ? <Icon name="volume-high" size={18} color={colors.primary} /> : null}
              </View>
              <Text className={`text-base font-semibold ${isPlaying ? 'text-primary' : 'text-ink'}`} numberOfLines={1}>
                {s.title}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={2}>
                {s.description}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

/** Five steps, drawn as bars that grow: tap one to set the volume. */
function VolumePicker({ volume, onChange }: { volume: number; onChange: (volume: number) => void }) {
  const colors = useColors();
  return (
    <View className="flex-row items-end gap-2" accessibilityRole="adjustable" accessibilityLabel="Volume">
      <Icon name="volume-low-outline" size={22} color={colors.muted} />
      {FOCUS_VOLUMES.map((step, i) => {
        const on = step <= volume + 0.001;
        return (
          <Pressable
            key={step}
            onPress={() => onChange(step)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Volume ${Math.round(step * 100)}%`}
            accessibilityState={{ selected: Math.abs(step - volume) < 0.001 }}
            className="flex-1 justify-end"
            style={{ height: scaled(48) }}
          >
            <View
              className={`rounded-lg ${on ? 'bg-primary' : 'bg-line'}`}
              style={{ height: scaled(14 + i * 8) }}
            />
          </Pressable>
        );
      })}
      <Icon name="volume-high-outline" size={22} color={colors.muted} />
    </View>
  );
}
