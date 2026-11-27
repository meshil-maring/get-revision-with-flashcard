import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import { Icon, type IconName, useColors } from '@/components/ui';
import { AUTO_NEXT_MAX, AUTO_NEXT_MIN, AUTO_NEXT_OPTIONS } from '@/data/settings';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

/** "Off", "20 sec", "1 min", "1 min 30 sec". */
export function autoNextLabel(seconds: number): string {
  if (seconds <= 0) return 'Off';
  if (seconds < 60) return `${seconds} sec`;
  const rest = seconds % 60;
  return rest ? `${Math.floor(seconds / 60)} min ${rest} sec` : `${seconds / 60} min`;
}

/** Short form for small buttons: "Off", "20s", "1m", "1m15". */
export function autoNextShort(seconds: number): string {
  if (seconds <= 0) return 'Off';
  if (seconds < 60) return `${seconds}s`;
  const rest = seconds % 60;
  return rest ? `${Math.floor(seconds / 60)}m${String(rest).padStart(2, '0')}` : `${seconds / 60}m`;
}

/** Reads the minutes and seconds boxes; null if empty or out of range. */
export function parseCustomTime(minutes: string, seconds: string): number | null {
  const m = minutes.trim() === '' ? 0 : Number(minutes);
  const s = seconds.trim() === '' ? 0 : Number(seconds);
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0) return null;
  const total = m * 60 + s;
  return total >= AUTO_NEXT_MIN && total <= AUTO_NEXT_MAX ? total : null;
}

type Props = {
  visible: boolean;
  value: number;
  /** The last custom time used, shown as the first choice (0 = none). */
  recent?: number;
  /** Whether the countdown waits while the answer is showing. */
  pauseOnAnswer?: boolean;
  onPauseOnAnswerChange?: (on: boolean) => void;
  onChange: (seconds: number) => void;
  onClose: () => void;
};

/** A popup to choose how long each card stays before study moves to the next one. */
export function AutoNextPicker({ visible, ...rest }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={rest.onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center bg-black/40 px-5"
      >
        <Pressable onPress={rest.onClose} className="absolute inset-0" accessibilityLabel="Close" />
        {/* Mounted only while open, so the custom boxes start fresh each time. */}
        {visible ? <Picker {...rest} /> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Picker({
  value,
  recent = 0,
  pauseOnAnswer = false,
  onPauseOnAnswerChange,
  onChange,
  onClose,
}: Omit<Props, 'visible'>) {
  const colors = useColors();
  // The last custom time goes first, unless it's already one of the usual choices.
  const showRecent = recent > 0 && !AUTO_NEXT_OPTIONS.includes(recent);
  const isCustomValue = value > 0 && !AUTO_NEXT_OPTIONS.includes(value) && !(showRecent && value === recent);
  const [custom, setCustom] = useState(isCustomValue);
  const [minutes, setMinutes] = useState(isCustomValue ? String(Math.floor(value / 60)) : '');
  const [seconds, setSeconds] = useState(isCustomValue ? String(value % 60) : '');
  const customValue = parseCustomTime(minutes, seconds);
  const typedSomething = minutes.trim() !== '' || seconds.trim() !== '';

  function choose(next: number) {
    onChange(next);
    onClose();
  }

  return (
    <View className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl">
      <View className="mb-1 flex-row items-center gap-2">
        <Icon name="timer-outline" size={28} color={colors.primary} />
        <Text className="text-xl font-bold text-ink">Time per card</Text>
      </View>
      <Text className="mb-4 text-sm leading-5 text-muted">When the time runs out, study moves to the next card by itself.</Text>

      <View className="flex-row flex-wrap gap-2">
        <Chip label={autoNextLabel(0)} chosen={!custom && value === 0} onPress={() => choose(0)} />
        {showRecent ? (
          <Chip
            label={autoNextLabel(recent)}
            icon="time-outline"
            hint="Your last custom time"
            chosen={!custom && value === recent}
            onPress={() => choose(recent)}
          />
        ) : null}
        {AUTO_NEXT_OPTIONS.filter((option) => option > 0).map((option) => (
          <Chip key={option} label={autoNextLabel(option)} chosen={!custom && option === value} onPress={() => choose(option)} />
        ))}
        <Chip
          label={isCustomValue ? `Custom · ${autoNextLabel(value)}` : 'Custom'}
          icon="create-outline"
          chosen={custom}
          onPress={() => setCustom(true)}
        />
      </View>

      {custom ? (
        <View className="mt-3">
          <View className="flex-row items-center gap-1.5 rounded-2xl border border-primary/30 bg-primary-soft px-2.5 py-2">
            <TimeBox label="Minutes" unit="min" value={minutes} onChangeText={setMinutes} autoFocus={!isCustomValue} />
            <Text className="text-base font-bold text-muted">:</Text>
            <TimeBox label="Seconds" unit="sec" value={seconds} onChangeText={setSeconds} />
            <Pressable
              disabled={customValue === null}
              onPress={() => customValue !== null && choose(customValue)}
              accessibilityRole="button"
              accessibilityLabel="Set custom time"
              accessibilityState={{ disabled: customValue === null }}
              style={{ height: 40 }}
              className={`ml-auto flex-row items-center gap-1 rounded-xl px-4 ${
                customValue === null ? 'bg-primary/40' : 'bg-primary active:bg-primary-dark'
              }`}
            >
              <Icon name="checkmark" size={20} color={colors.white} />
              <Text className="text-sm font-bold text-white">Set</Text>
            </Pressable>
          </View>
          <Text
            className={`mt-1.5 px-1 text-xs ${typedSomething && customValue === null ? 'text-alert' : 'text-muted'}`}
          >
            {customValue !== null
              ? `Each card: ${autoNextLabel(customValue)}`
              : `Between ${autoNextLabel(AUTO_NEXT_MIN)} and ${autoNextLabel(AUTO_NEXT_MAX)}`}
          </Text>
        </View>
      ) : null}

      {onPauseOnAnswerChange ? (
        <View className="mt-4 flex-row items-center gap-3 border-t border-line pt-4">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-soft">
            <Icon name="eye-outline" size={22} color={colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-ink">Pause on answer</Text>
            <Text className="text-xs leading-4 text-muted">
              {value > 0 ? 'The countdown waits while you read the answer.' : 'Choose a time above to use this.'}
            </Text>
          </View>
          <Switch
            value={pauseOnAnswer}
            onValueChange={onPauseOnAnswerChange}
            disabled={value <= 0}
            accessibilityLabel="Pause on answer"
            accessibilityState={{ checked: pauseOnAnswer, disabled: value <= 0 }}
            trackColor={{ false: colors.line, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
      ) : null}

      <Pressable onPress={onClose} className="mt-5 items-center rounded-xl border border-line py-3 active:bg-surface">
        <Text className="text-base font-semibold text-ink">Close</Text>
      </Pressable>
    </View>
  );
}

function Chip({
  label,
  chosen,
  onPress,
  icon,
  hint,
}: {
  label: string;
  chosen: boolean;
  onPress: () => void;
  icon?: IconName;
  hint?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: chosen }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      className={`min-w-24 flex-grow flex-row items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 ${
        chosen ? 'border-primary bg-primary' : 'border-line bg-card active:bg-surface'
      }`}
    >
      {icon ? <Icon name={icon} size={18} color={chosen ? colors.white : colors.primary} /> : null}
      <Text className={`text-base font-semibold ${chosen ? 'text-white' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

function TimeBox({
  label,
  unit,
  value,
  onChangeText,
  autoFocus,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (text: string) => void;
  autoFocus?: boolean;
}) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-1">
      <TextInput
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, '').slice(0, 2))}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="0"
        placeholderTextColor={colors.faint}
        autoFocus={autoFocus}
        selectTextOnFocus
        accessibilityLabel={label}
        // Text size and line height are set here, not with text-* classes: on Android a class
        // line height can come out too small for an input, which cuts off the top of the digits.
        style={{
          ...NO_WEB_FOCUS_RING,
          width: 44,
          height: 40,
          fontSize: 18,
          lineHeight: 24,
          fontWeight: '700',
          color: colors.ink,
          textAlign: 'center',
          textAlignVertical: 'center',
          paddingVertical: 0,
          paddingHorizontal: 2,
          includeFontPadding: false,
        }}
        className="rounded-lg border border-line bg-card"
      />
      <Text className="text-xs font-semibold text-muted">{unit}</Text>
    </View>
  );
}
