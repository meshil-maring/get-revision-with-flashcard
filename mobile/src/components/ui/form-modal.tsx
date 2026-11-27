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

import { useColors } from '@/components/ui';

// Browsers draw their own focus ring over the input; we show a primary-colour border instead.
// ('none' works on web but isn't in React Native's types.)
const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

export type FormField = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
};

type Values = Record<string, string>;

type Props = {
  visible: boolean;
  title: string;
  fields: FormField[];
  initialValues?: Values;
  onCancel: () => void;
  onSave: (values: Values) => void;
};

/** A popup form with text fields, used for creating and editing decks and cards. */
export function FormModal({ visible, title, fields, initialValues = {}, onCancel, onSave }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center bg-black/40 px-5"
      >
        {/* Mounted only while visible, so the fields start fresh each time the form opens. */}
        {visible ? (
          <Form
            title={title}
            fields={fields}
            initialValues={initialValues}
            onCancel={onCancel}
            onSave={onSave}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Form({
  title,
  fields,
  initialValues,
  onCancel,
  onSave,
}: Omit<Props, 'visible' | 'initialValues'> & { initialValues: Values }) {
  const colors = useColors();
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map((f) => [f.key, initialValues[f.key] ?? ''])),
  );
  const [focused, setFocused] = useState<string | null>(null);
  const canSave = fields.every((f) => !f.required || values[f.key].trim().length > 0);

  return (
    <View className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl">
      <Text className="mb-5 text-xl font-bold text-ink">{title}</Text>

      {fields.map((field, index) => (
        <View key={field.key} className="mb-4">
          <Text className="mb-1.5 text-sm font-semibold text-ink">
            {field.label}
            {field.required ? '' : <Text className="font-normal text-muted"> (optional)</Text>}
          </Text>
          <TextInput
            value={values[field.key]}
            onChangeText={(text) => setValues((v) => ({ ...v, [field.key]: text }))}
            placeholder={field.placeholder}
            multiline={field.multiline}
            autoFocus={index === 0}
            textAlignVertical={field.multiline ? 'top' : 'center'}
            placeholderTextColor={colors.faint}
            onFocus={() => setFocused(field.key)}
            onBlur={() => setFocused((f) => (f === field.key ? null : f))}
            // Indigo border while typing (and no browser focus outline on web).
            style={{
              ...NO_WEB_FOCUS_RING,
              borderWidth: 1.5,
              borderColor: focused === field.key ? colors.primary : colors.line,
              backgroundColor: focused === field.key ? colors.card : colors.surface,
            }}
            className={`rounded-xl px-4 py-3 text-base text-ink ${
              field.multiline ? 'min-h-24' : ''
            }`}
          />
        </View>
      ))}

      <View className="mt-2 flex-row gap-3">
        <Pressable
          onPress={onCancel}
          className="flex-1 items-center rounded-xl border border-line py-3 active:bg-surface"
        >
          <Text className="text-base font-semibold text-ink">Cancel</Text>
        </Pressable>
        <Pressable
          disabled={!canSave}
          onPress={() => onSave(values)}
          className={`flex-1 items-center rounded-xl py-3 ${
            canSave ? 'bg-cta active:bg-cta-dark' : 'bg-cta/40'
          }`}
        >
          <Text className="text-base font-semibold text-white">Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
