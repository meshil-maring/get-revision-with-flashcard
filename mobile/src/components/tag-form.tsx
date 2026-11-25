import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import { TagChip } from '@/components/tag-chip';
import { colors, Icon } from '@/components/ui';
import type { TagColor } from '@/data/types';
import { TAG_COLORS } from '@/lib/tags';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

type Values = { name: string; color: TagColor };

/** A popup to rename a tag and choose its colour. */
export function TagFormModal({
  visible,
  title,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  title: string;
  initial: Values;
  onCancel: () => void;
  onSave: (values: Values) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center bg-black/40 px-5"
      >
        {visible ? <Form title={title} initial={initial} onCancel={onCancel} onSave={onSave} /> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Form({
  title,
  initial,
  onCancel,
  onSave,
}: {
  title: string;
  initial: Values;
  onCancel: () => void;
  onSave: (values: Values) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState<TagColor>(initial.color);
  const canSave = name.trim().length > 0;

  return (
    <View className="w-full max-w-md gap-4 rounded-3xl bg-white p-6 shadow-xl">
      <Text className="text-xl font-bold text-ink">{title}</Text>

      <View className="gap-1.5">
        <Text className="text-sm font-semibold text-ink">Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Exam 1"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Tag name"
          autoFocus
          style={{ ...NO_WEB_FOCUS_RING, borderWidth: 1.5, borderColor: colors.primary }}
          className="rounded-xl bg-white px-4 py-3 text-base text-ink"
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-ink">Colour</Text>
        <View className="flex-row flex-wrap gap-2.5">
          {TAG_COLORS.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setColor(c.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: color === c.key }}
              accessibilityLabel={c.label}
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: c.value, borderWidth: color === c.key ? 3 : 0, borderColor: colors.ink }}
            >
              {color === c.key ? <Icon name="checkmark" size={22} color={colors.white} /> : null}
            </Pressable>
          ))}
        </View>
      </View>

      {name.trim() ? (
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-muted">Preview:</Text>
          <TagChip tag={{ name: name.trim(), color }} size="md" />
        </View>
      ) : null}

      <View className="mt-1 flex-row gap-3">
        <Pressable onPress={onCancel} className="flex-1 items-center rounded-xl border border-line py-3 active:bg-surface">
          <Text className="text-base font-semibold text-ink">Cancel</Text>
        </Pressable>
        <Pressable
          disabled={!canSave}
          onPress={() => onSave({ name, color })}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          className={`flex-1 items-center rounded-xl py-3 ${canSave ? 'bg-cta active:bg-cta-dark' : 'bg-cta/40'}`}
        >
          <Text className="text-base font-semibold text-white">Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
