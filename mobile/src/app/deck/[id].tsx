import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { FormModal, type FormField } from '@/components/form-modal';
import { createCard, deleteCard, listCards, updateCard } from '@/data/cards';
import { getDeck } from '@/data/decks';
import type { Card, Deck } from '@/data/types';
import { confirm } from '@/lib/confirm';

const CARD_FIELDS: FormField[] = [
  { key: 'front', label: 'Front (question)', placeholder: 'e.g. What is mitosis?', multiline: true, required: true },
  { key: 'back', label: 'Back (answer)', placeholder: 'e.g. Cell division into two identical cells', multiline: true, required: true },
];

type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; card: Card };

export default function DeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined); // undefined = loading
  const [cards, setCards] = useState<Card[]>([]);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });

  const refresh = useCallback(async () => {
    const [d, c] = await Promise.all([getDeck(db, id), listCards(db, id)]);
    setDeck(d);
    setCards(c);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function handleSave(values: Record<string, string>) {
    const input = { front: values.front, back: values.back };
    if (form.mode === 'create') {
      await createCard(db, id, input);
    } else if (form.mode === 'edit') {
      await updateCard(db, form.card.id, input);
    }
    setForm({ mode: 'closed' });
    await refresh();
  }

  async function handleDelete(card: Card) {
    const ok = await confirm('Delete card?', `"${card.front}" will be deleted.`);
    if (!ok) return;
    await deleteCard(db, card.id);
    await refresh();
  }

  if (deck === undefined) {
    return <Stack.Screen options={{ title: '' }} />;
  }

  if (deck === null) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6">
        <Stack.Screen options={{ title: 'Not found' }} />
        <Text className="text-lg text-slate-600">This deck no longer exists.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: deck.name }} />

      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        contentContainerClassName="gap-3 p-4 pb-28"
        ListHeaderComponent={
          <View className="mb-1">
            {deck.description ? <Text className="mb-2 text-slate-600">{deck.description}</Text> : null}
            <Text className="text-sm text-slate-500">
              {cards.length} {cards.length === 1 ? 'card' : 'cards'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center px-6 py-16">
            <Text className="mb-2 text-lg font-semibold text-slate-800">No cards yet</Text>
            <Text className="text-center text-slate-500">
              Add a card with a question on the front and the answer on the back.
            </Text>
          </View>
        }
        renderItem={({ item: card }) => (
          <View className="rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">Front</Text>
            <Text className="mb-3 mt-1 text-base text-slate-900">{card.front}</Text>
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">Back</Text>
            <Text className="mt-1 text-base text-slate-700">{card.back}</Text>
            <View className="mt-3 flex-row justify-end gap-4">
              <Pressable onPress={() => setForm({ mode: 'edit', card })} hitSlop={8}>
                <Text className="font-medium text-indigo-600">Edit</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(card)} hitSlop={8}>
                <Text className="font-medium text-red-600">Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Pressable
        onPress={() => setForm({ mode: 'create' })}
        className="absolute bottom-8 right-6 rounded-full bg-indigo-600 px-6 py-4 shadow-lg"
      >
        <Text className="text-base font-semibold text-white">+ Add card</Text>
      </Pressable>

      <FormModal
        visible={form.mode !== 'closed'}
        title={form.mode === 'edit' ? 'Edit card' : 'New card'}
        fields={CARD_FIELDS}
        initialValues={form.mode === 'edit' ? { front: form.card.front, back: form.card.back } : {}}
        onCancel={() => setForm({ mode: 'closed' })}
        onSave={handleSave}
      />
    </View>
  );
}
