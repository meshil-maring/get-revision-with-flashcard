import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

type Values = { name: string; description: string };

type Props = {
  visible: boolean;
  title: string;
  initialName?: string;
  initialDescription?: string;
  onCancel: () => void;
  onSave: (values: Values) => void;
};

export function DeckFormModal({
  visible,
  title,
  initialName = '',
  initialDescription = '',
  onCancel,
  onSave,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center bg-black/50 px-6"
      >
        {/* Mounted only while visible, so the fields start fresh each time the form opens. */}
        {visible ? (
          <DeckForm
            title={title}
            initialName={initialName}
            initialDescription={initialDescription}
            onCancel={onCancel}
            onSave={onSave}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DeckForm({
  title,
  initialName,
  initialDescription,
  onCancel,
  onSave,
}: Omit<Props, 'visible'> & { initialName: string; initialDescription: string }) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const canSave = name.trim().length > 0;

  return (
    <View className="rounded-2xl bg-white p-5">
      <Text className="mb-4 text-lg font-semibold text-slate-900">{title}</Text>

      <Text className="mb-1 text-sm text-slate-600">Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Biology – Cells"
        autoFocus
        className="mb-4 rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
      />

      <Text className="mb-1 text-sm text-slate-600">Description (optional)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What is this deck about?"
        multiline
        className="mb-5 min-h-16 rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
      />

      <View className="flex-row justify-end gap-3">
        <Pressable onPress={onCancel} className="rounded-lg px-4 py-2">
          <Text className="text-base text-slate-600">Cancel</Text>
        </Pressable>
        <Pressable
          disabled={!canSave}
          onPress={() => onSave({ name, description })}
          className={`rounded-lg px-4 py-2 ${canSave ? 'bg-indigo-600' : 'bg-indigo-300'}`}
        >
          <Text className="text-base font-semibold text-white">Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
