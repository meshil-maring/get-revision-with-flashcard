// Picking any colour for the pen or highlighter: hue, saturation and lightness bars you tap or
// drag along, a hex code box, and the colours picked before (kept on the device).

import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type TextStyle,
} from 'react-native';

import { useColors } from '@/components/ui';
import { getSetting, setSetting, SETTINGS } from '@/data/settings';
import { hexToHsl, hslToHex, parseHexColor } from '@/lib/ink';

/** How many picked colours are remembered. */
const MAX_RECENT = 8;
/** How many blocks of colour each bar is drawn with. */
const STEPS = 36;

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;
const WEB_NO_TOUCH_SCROLL = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none' } : {}) as object;

/** The custom colours picked before, newest first, and a way to add one. */
export function useRecentColors() {
  const db = useSQLiteContext();
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    void getSetting(db, SETTINGS.inkColors).then((saved) => {
      if (!live || !saved) return;
      try {
        const list = JSON.parse(saved) as unknown;
        if (Array.isArray(list)) {
          setRecent(list.map((c) => (typeof c === 'string' ? parseHexColor(c) : null)).filter((c): c is string => !!c));
        }
      } catch {
        // A broken setting just means no recent colours.
      }
    }).catch(() => {
      // Recent colours are a nicety: if they can't be read, there just aren't any.
    });
    return () => {
      live = false;
    };
  }, [db]);

  const add = useCallback(
    (color: string) => {
      setRecent((list) => {
        const next = [color, ...list.filter((c) => c !== color)].slice(0, MAX_RECENT);
        setSetting(db, SETTINGS.inkColors, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [db],
  );

  return { recent, add };
}

/** A bar of colour; tap or drag along it to choose a value from 0 to `max`. */
function Bar({
  label,
  value,
  max,
  colorAt,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  colorAt: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const choose = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    const fraction = Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
    onChange(Math.round(fraction * max));
  };
  const step = (by: number) => onChange(Math.min(max, Math.max(0, value + by)));

  return (
    <View className="gap-1">
      <Text className="text-xs font-bold uppercase tracking-wider text-muted">{label}</Text>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={choose}
        onResponderMove={choose}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? max / 20 : -max / 20)}
        className="h-9 justify-center"
        style={WEB_NO_TOUCH_SCROLL}
      >
        <View pointerEvents="none" className="h-7 flex-row overflow-hidden rounded-full border border-line">
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: colorAt(((i + 0.5) / STEPS) * max) }} />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (value / max) * width - 8,
            width: 16,
            height: 36,
            borderRadius: 8,
            borderWidth: 3,
            borderColor: colors.white,
            backgroundColor: colorAt(value),
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 3,
          }}
        />
      </View>
    </View>
  );
}

/**
 * A popup to choose any colour. `recent` are colours picked before, shown to pick again.
 * `onPick` gets "#rrggbb".
 */
export function ColorPickerModal({
  visible,
  title,
  initial,
  recent,
  onCancel,
  onPick,
}: {
  visible: boolean;
  title: string;
  initial: string;
  recent: string[];
  onCancel: () => void;
  onPick: (color: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center bg-black/40 px-5"
      >
        {/* Mounted only while open, so it starts from the current colour each time. */}
        {visible ? <Picker title={title} initial={initial} recent={recent} onCancel={onCancel} onPick={onPick} /> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Picker({
  title,
  initial,
  recent,
  onCancel,
  onPick,
}: {
  title: string;
  initial: string;
  recent: string[];
  onCancel: () => void;
  onPick: (color: string) => void;
}) {
  const colors = useColors();
  const [hsl, setHsl] = useState(() => hexToHsl(initial));
  const [hexText, setHexText] = useState(initial);
  const [focused, setFocused] = useState(false);
  const color = parseHexColor(hexText) ?? hslToHex(hsl.h, hsl.s, hsl.l);

  function fromBars(next: { h: number; s: number; l: number }) {
    setHsl(next);
    setHexText(hslToHex(next.h, next.s, next.l));
  }

  function fromColor(hex: string) {
    setHsl(hexToHsl(hex));
    setHexText(hex);
  }

  function typeHex(text: string) {
    setHexText(text);
    const hex = parseHexColor(text);
    if (hex) setHsl(hexToHsl(hex));
  }

  const valid = parseHexColor(hexText) !== null;

  return (
    <View className="w-full max-w-md gap-4 rounded-3xl bg-card p-6 shadow-xl">
      <Text className="text-xl font-bold text-ink">{title}</Text>

      <View className="flex-row items-center gap-3">
        <View
          accessibilityLabel={`Chosen colour ${color}`}
          style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: color, borderWidth: 1, borderColor: colors.line }}
        />
        <TextInput
          value={hexText}
          onChangeText={typeHex}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (!valid) setHexText(hslToHex(hsl.h, hsl.s, hsl.l));
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          placeholder="#1f3f8f"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Colour code"
          className="flex-1 rounded-xl border bg-surface px-3 py-2.5 font-mono text-base text-ink"
          style={[NO_WEB_FOCUS_RING, { borderColor: !valid ? colors.alert : focused ? colors.primary : colors.line }]}
        />
      </View>

      <Bar label="Colour" value={hsl.h} max={360} colorAt={(h) => hslToHex(h, 85, 50)} onChange={(h) => fromBars({ ...hsl, h })} />
      <Bar
        label="Strength"
        value={hsl.s}
        max={100}
        colorAt={(s) => hslToHex(hsl.h, s, hsl.l)}
        onChange={(s) => fromBars({ ...hsl, s })}
      />
      <Bar
        label="Light or dark"
        value={hsl.l}
        max={100}
        colorAt={(l) => hslToHex(hsl.h, hsl.s, l)}
        onChange={(l) => fromBars({ ...hsl, l })}
      />

      {recent.length > 0 ? (
        <View className="gap-1">
          <Text className="text-xs font-bold uppercase tracking-wider text-muted">Recent</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {recent.map((c) => (
              <Pressable
                key={c}
                onPress={() => fromColor(c)}
                accessibilityRole="radio"
                accessibilityLabel={c}
                accessibilityState={{ checked: c === color }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: c,
                  borderWidth: c === color ? 3 : 1,
                  borderColor: c === color ? colors.primary : colors.line,
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="mt-1 flex-row justify-end gap-3">
        <Pressable onPress={onCancel} accessibilityRole="button" className="rounded-full px-5 py-3 active:bg-surface">
          <Text className="font-semibold text-muted">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => onPick(color)}
          accessibilityRole="button"
          className="rounded-full bg-primary px-6 py-3 active:opacity-80"
        >
          <Text className="font-bold text-white">Use colour</Text>
        </Pressable>
      </View>
    </View>
  );
}
