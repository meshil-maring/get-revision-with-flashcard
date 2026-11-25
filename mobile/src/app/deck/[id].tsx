import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { FormModal, type FormField } from '@/components/form-modal';
import { Button, DeckBadge, EmptyState, Fab, IconButton, plural } from '@/components/ui';
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
      <View className="flex-1 justify-center bg-page">
        <Stack.Screen options={{ title: 'Not found' }} />
        <EmptyState
          icon="alert-circle-outline"
          title="Deck not found"
          text="This deck no longer exists."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-page">
      <Stack.Screen options={{ title: deck.name }} />

      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        contentContainerClassName="w-full max-w-3xl self-center gap-3 px-4 pb-32 pt-2"
        ListHeaderComponent={
          <View className="mb-2 rounded-2xl border border-line bg-white p-4">
            <View className="flex-row items-center gap-3">
              <DeckBadge name={deck.name} size={52} />
              <View className="flex-1">
                <Text className="text-lg font-bold text-ink">{deck.name}</Text>
                <Text className="text-sm text-muted">{plural(cards.length, 'card')}</Text>
              </View>
            </View>
            {deck.description ? (
              <Text className="mt-3 text-sm leading-5 text-muted">{deck.description}</Text>
            ) : null}
            {cards.length > 0 ? (
              <Button
                label="Study"
                icon="play"
                className="mt-4"
                onPress={() => router.push({ pathname: '/study/[id]', params: { id } })}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="copy-outline"
            title="No cards yet"
            text="Add a card with a question on the front and the answer on the back."
          />
        }
        renderItem={({ item: card, index }) => (
          <View className="rounded-2xl border border-line bg-white">
            <View className="flex-row items-start gap-3 p-4 pb-3">
              <Text className="w-6 pt-0.5 text-xs font-bold text-muted">{index + 1}</Text>
              <View className="flex-1 gap-3">
                <View>
                  <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">
                    Question
                  </Text>
                  <Text className="text-base font-medium leading-6 text-ink">{card.front}</Text>
                </View>
                <View>
                  <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-brand">
                    Answer
                  </Text>
                  <Text className="text-base leading-6 text-muted">{card.back}</Text>
                </View>
              </View>
            </View>
            <View className="flex-row justify-end border-t border-line px-2 py-1">
              <IconButton icon="create-outline" label="Edit card" onPress={() => setForm({ mode: 'edit', card })} />
              <IconButton icon="trash-outline" label="Delete card" tone="danger" onPress={() => handleDelete(card)} />
            </View>
          </View>
        )}
      />

      <Fab label="Add card" onPress={() => setForm({ mode: 'create' })} />

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
