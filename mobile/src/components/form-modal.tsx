import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

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
        className="flex-1 justify-center bg-black/50 px-6"
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
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map((f) => [f.key, initialValues[f.key] ?? ''])),
  );
  const canSave = fields.every((f) => !f.required || values[f.key].trim().length > 0);

  return (
    <View className="rounded-2xl bg-white p-5">
      <Text className="mb-4 text-lg font-semibold text-slate-900">{title}</Text>

      {fields.map((field, index) => (
        <View key={field.key} className="mb-4">
          <Text className="mb-1 text-sm text-slate-600">
            {field.label}
            {field.required ? '' : ' (optional)'}
          </Text>
          <TextInput
            value={values[field.key]}
            onChangeText={(text) => setValues((v) => ({ ...v, [field.key]: text }))}
            placeholder={field.placeholder}
            multiline={field.multiline}
            autoFocus={index === 0}
            textAlignVertical={field.multiline ? 'top' : 'center'}
            className={`rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 ${
              field.multiline ? 'min-h-20' : ''
            }`}
          />
        </View>
      ))}

      <View className="mt-1 flex-row justify-end gap-3">
        <Pressable onPress={onCancel} className="rounded-lg px-4 py-2">
          <Text className="text-base text-slate-600">Cancel</Text>
        </Pressable>
        <Pressable
          disabled={!canSave}
          onPress={() => onSave(values)}
          className={`rounded-lg px-4 py-2 ${canSave ? 'bg-indigo-600' : 'bg-indigo-300'}`}
        >
          <Text className="text-base font-semibold text-white">Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
