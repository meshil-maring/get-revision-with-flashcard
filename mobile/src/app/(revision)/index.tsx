import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { FormModal, type FormField } from '@/components/form-modal';
import { createDeck, deleteDeck, listDecks, updateDeck } from '@/data/decks';
import type { DeckWithCount } from '@/data/types';
import { confirm } from '@/lib/confirm';

const DECK_FIELDS: FormField[] = [
  { key: 'name', label: 'Name', placeholder: 'e.g. Biology – Cells', required: true },
  {
    key: 'description',
    label: 'Description',
    placeholder: 'What is this deck about?',
    multiline: true,
  },
];

type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; deck: DeckWithCount };

export default function HomeScreen() {
  const db = useSQLiteContext();
  const [decks, setDecks] = useState<DeckWithCount[]>([]);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });

  const refresh = useCallback(async () => {
    setDecks(await listDecks(db));
  }, [db]);

  // Reload whenever this screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function handleSave(values: Record<string, string>) {
    const input = { name: values.name, description: values.description };
    if (form.mode === 'create') {
      await createDeck(db, input);
    } else if (form.mode === 'edit') {
      await updateDeck(db, form.deck.id, input);
    }
    setForm({ mode: 'closed' });
    await refresh();
  }

  async function handleDelete(deck: DeckWithCount) {
    const ok = await confirm(
      'Delete deck?',
      `"${deck.name}" and its ${deck.cardCount} card(s) will be deleted.`,
    );
    if (!ok) return;
    await deleteDeck(db, deck.id);
    await refresh();
  }

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        data={decks}
        keyExtractor={(deck) => deck.id}
        contentContainerClassName="gap-3 p-4 pb-28"
        ListEmptyComponent={
          <View className="items-center px-6 py-20">
            <Text className="mb-2 text-lg font-semibold text-slate-800">No decks yet</Text>
            <Text className="text-center text-slate-500">
              Create your first deck to start adding flashcards.
            </Text>
          </View>
        }
        renderItem={({ item: deck }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: deck.id } })}
            className="rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-100"
          >
            <Text className="text-lg font-semibold text-slate-900">{deck.name}</Text>
            {deck.description ? (
              <Text className="mt-1 text-slate-600" numberOfLines={2}>
                {deck.description}
              </Text>
            ) : null}
            <View className="mt-3 flex-row items-center justify-between">
              <Text className="text-sm text-slate-500">
                {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
              </Text>
              <View className="flex-row gap-4">
                <Pressable onPress={() => setForm({ mode: 'edit', deck })} hitSlop={8}>
                  <Text className="font-medium text-indigo-600">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(deck)} hitSlop={8}>
                  <Text className="font-medium text-red-600">Delete</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        )}
      />

      <Pressable
        onPress={() => setForm({ mode: 'create' })}
        className="absolute bottom-8 right-6 rounded-full bg-indigo-600 px-6 py-4 shadow-lg"
      >
        <Text className="text-base font-semibold text-white">+ New deck</Text>
      </Pressable>

      <FormModal
        visible={form.mode !== 'closed'}
        title={form.mode === 'edit' ? 'Edit deck' : 'New deck'}
        fields={DECK_FIELDS}
        initialValues={
          form.mode === 'edit' ? { name: form.deck.name, description: form.deck.description } : {}
        }
        onCancel={() => setForm({ mode: 'closed' })}
        onSave={handleSave}
      />
    </View>
  );
}
