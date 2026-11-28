import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, scaled, useColors } from '@/components/ui';
import { FOCUS_SOUNDS, FOCUS_VOLUMES, type FocusSound } from '@/lib/focus-sounds';
import {
  CUSTOM_LIMITS,
  CUSTOM_PRESET_ID,
  formatClock,
  PHASE_LABELS,
  POMODORO_PRESETS,
  type LengthKey,
} from '@/lib/pomodoro';
import { useFocusSound } from '@/providers/focus-sound';
import { usePomodoro } from '@/providers/pomodoro';

/**
 * The music button in a screen's header: opens study sounds and the Pomodoro timer. Filled in
 * while a sound plays, and shows the time left while the timer is on.
 */
export function FocusSoundButton() {
  const colors = useColors();
  const { playing } = useFocusSound();
  const timer = usePomodoro();
  const [open, setOpen] = useState(false);
  const timing = timer.status !== 'idle';
  const active = playing || timing;
  const label = [
    'Study sounds and timer',
    playing ? 'sound playing' : null,
    timing
      ? `${PHASE_LABELS[timer.phase]} ${formatClock(timer.left)} left${timer.status === 'paused' ? ', paused' : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(', ');
  const icon = timing
    ? timer.phase === 'focus'
      ? 'timer-outline'
      : 'cafe-outline'
    : playing
      ? 'musical-notes'
      : 'musical-notes-outline';
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={label}
        className={`h-12 flex-row items-center justify-center gap-1 rounded-full ${timing ? 'px-3' : 'w-12'} ${
          active ? 'bg-primary-soft' : 'active:bg-surface'
        }`}
      >
        <Icon name={icon} size={26} color={active ? colors.primary : colors.muted} />
        {timing ? (
          <Text
            className={`text-base font-bold ${timer.status === 'paused' ? 'text-muted' : 'text-primary'}`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatClock(timer.left)}
          </Text>
        ) : null}
      </Pressable>
      <FocusSoundSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The Pomodoro timer, then a sound to study to, how loud it is, and stop. */
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
        <Text className="text-xl font-bold text-ink">Focus timer & sounds</Text>
        <Text className="mb-3 text-sm text-muted">Both keep going while you move between screens.</Text>
        <ScrollView contentContainerClassName="gap-2 pb-2">
          <PomodoroPanel />
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

/** Work in focus rounds with breaks between: pick the lengths, start, pause, skip or reset. */
function PomodoroPanel() {
  const colors = useColors();
  const { preset, status, phase, done, left, start, pause, reset, skip, setPreset, custom, setCustom } = usePomodoro();
  const isCustom = preset.id === CUSTOM_PRESET_ID;
  const onBreak = phase !== 'focus';
  // Focus rounds finished in this set; a long break comes after the last one.
  const inSet = onBreak && done > 0 && done % preset.rounds === 0 ? preset.rounds : done % preset.rounds;
  const round = onBreak ? inSet : inSet + 1;
  const canReset = status !== 'idle' || done > 0;
  return (
    <View className="mb-2 gap-3">
      <Text className="text-sm font-semibold uppercase tracking-wider text-muted">Pomodoro timer</Text>
      <View className="flex-row gap-2">
        {POMODORO_PRESETS.map((p) => {
          const on = p.id === preset.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPreset(p.id)}
              accessibilityRole="button"
              accessibilityLabel={`${p.focus} minutes focus, ${p.short} minute breaks`}
              accessibilityState={{ selected: on }}
              className={`flex-1 items-center rounded-xl border-2 py-2 ${
                on ? 'border-primary bg-primary-soft' : 'border-transparent bg-surface active:bg-line'
              }`}
            >
              <Text className={`text-base font-semibold ${on ? 'text-primary' : 'text-ink'}`}>{p.title}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setPreset(CUSTOM_PRESET_ID)}
          accessibilityRole="button"
          accessibilityLabel="Custom lengths"
          accessibilityState={{ selected: isCustom }}
          className={`flex-1 flex-row items-center justify-center gap-1 rounded-xl border-2 py-2 ${
            isCustom ? 'border-primary bg-primary-soft' : 'border-transparent bg-surface active:bg-line'
          }`}
        >
          <Icon name="options-outline" size={20} color={isCustom ? colors.primary : colors.ink} />
          <Text className={`text-base font-semibold ${isCustom ? 'text-primary' : 'text-ink'}`}>Custom</Text>
        </Pressable>
      </View>

      {isCustom ? (
        <View className="gap-1 rounded-2xl bg-surface px-3 py-2">
          <LengthStepper label="Focus" unit="min" field="focus" value={custom.focus} onChange={setCustom} />
          <LengthStepper label="Short break" unit="min" field="short" value={custom.short} onChange={setCustom} />
          <LengthStepper label="Long break" unit="min" field="long" value={custom.long} onChange={setCustom} />
          <LengthStepper label="Long break after" unit="rounds" field="rounds" value={custom.rounds} onChange={setCustom} />
        </View>
      ) : null}

      <View className={`items-center gap-1 rounded-2xl py-4 ${onBreak ? 'bg-surface' : 'bg-primary-soft'}`}>
        <View className="flex-row items-center gap-2">
          <Icon name={onBreak ? 'cafe-outline' : 'timer-outline'} size={22} color={onBreak ? colors.ink : colors.primary} />
          <Text className={`text-base font-semibold ${onBreak ? 'text-ink' : 'text-primary'}`}>{PHASE_LABELS[phase]}</Text>
        </View>
        <Text
          className={`text-5xl font-bold ${onBreak ? 'text-ink' : 'text-primary'}`}
          style={{ fontVariant: ['tabular-nums'] }}
          accessibilityLabel={`${formatClock(left)} left`}
        >
          {formatClock(left)}
        </Text>
        {/* One dot per focus round in a set: filled once done, ringed for the one under way. */}
        <View className="flex-row items-center gap-2" accessible accessibilityLabel={`Round ${round} of ${preset.rounds}`}>
          {Array.from({ length: preset.rounds }, (_, i) => (
            <View
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i < inSet ? 'bg-primary' : !onBreak && i === inSet ? 'border-2 border-primary' : 'bg-line'
              }`}
            />
          ))}
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={reset}
          disabled={!canReset}
          accessibilityRole="button"
          accessibilityLabel="Reset timer"
          className="h-14 w-14 items-center justify-center rounded-2xl border border-line bg-card active:bg-surface"
        >
          <Icon name="refresh" size={24} color={canReset ? colors.ink : colors.faint} />
        </Pressable>
        <View className="flex-1">
          <Button
            label={status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : `Start ${preset.focus} min focus`}
            icon={status === 'running' ? 'pause' : 'play'}
            variant={status === 'running' ? 'secondary' : 'cta'}
            onPress={status === 'running' ? pause : start}
          />
        </View>
        <Pressable
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel={onBreak ? 'Skip break' : 'Skip to break'}
          className="h-14 w-14 items-center justify-center rounded-2xl border border-line bg-card active:bg-surface"
        >
          <Icon name="play-skip-forward" size={24} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

/** One custom length, with − and + buttons (no keyboard needed). */
function LengthStepper({
  label,
  unit,
  field,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  field: LengthKey;
  value: number;
  onChange: (field: LengthKey, value: number) => void;
}) {
  const colors = useColors();
  const { min, max, step } = CUSTOM_LIMITS[field];
  const stepButton = (dir: -1 | 1) => {
    const disabled = dir < 0 ? value <= min : value >= max;
    return (
      <Pressable
        onPress={() => onChange(field, value + dir * step)}
        disabled={disabled}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${dir < 0 ? 'Less' : 'More'} ${label.toLowerCase()}`}
        className="h-11 w-11 items-center justify-center rounded-full bg-card active:bg-line"
      >
        <Icon name={dir < 0 ? 'remove' : 'add'} size={24} color={disabled ? colors.faint : colors.ink} />
      </Pressable>
    );
  };
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="flex-1 text-base text-ink">{label}</Text>
      <View className="flex-row items-center gap-2">
        {stepButton(-1)}
        <Text
          className="min-w-20 text-center text-base font-semibold text-ink"
          accessibilityLabel={`${label}: ${value} ${unit}`}
        >
          {value} {unit}
        </Text>
        {stepButton(1)}
      </View>
    </View>
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
