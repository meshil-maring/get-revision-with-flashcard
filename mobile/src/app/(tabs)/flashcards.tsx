import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormModal, type FormField } from '@/components/form-modal';
import { ScreenTip } from '@/components/screen-tip';
import { colors, DeckBadge, EmptyState, Icon, IconButton, plural } from '@/components/ui';
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

/** The Flashcards tab: all decks. Opening /flashcards?new=deck shows the new-deck form. */
export default function FlashcardsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ new?: string }>();
  const [decks, setDecks] = useState<DeckWithCount[] | null>(null); // null = loading
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

  // "New deck" from the + menu or the Home screen: open the form once per request,
  // then clear the param so it can be asked for again.
  const [seenNew, setSeenNew] = useState<string | undefined>(undefined);
  if (params.new !== seenNew) {
    setSeenNew(params.new);
    if (params.new === 'deck') setForm({ mode: 'create' });
  }
  useEffect(() => {
    if (params.new) router.setParams({ new: undefined });
  }, [params.new]);

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

  const list = decks ?? [];
  const totalCards = list.reduce((sum, d) => sum + d.cardCount, 0);

  return (
    <View className="flex-1 bg-page" style={{ paddingTop: insets.top }}>
      <FlatList
        data={list}
        keyExtractor={(deck) => deck.id}
        contentContainerClassName="w-full max-w-3xl self-center gap-3 px-5 pb-8 pt-4"
        ListHeaderComponent={
          <View className="mb-2">
            <View className="mb-5 flex-row items-center justify-between">
              <View>
                <Text className="text-3xl font-extrabold text-ink">Flashcards</Text>
                {list.length > 0 ? (
                  <Text className="mt-0.5 text-base text-muted">
                    {plural(list.length, 'deck')} · {plural(totalCards, 'card')}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setForm({ mode: 'create' })}
                accessibilityRole="button"
                className="flex-row items-center gap-1.5 rounded-2xl bg-primary px-4 py-3 active:bg-primary-dark"
              >
                <Icon name="add" size={20} color={colors.white} />
                <Text className="text-base font-bold text-white">New deck</Text>
              </Pressable>
            </View>

            {list.length > 0 ? <ScreenTip id="flashcards" className="mb-3" /> : null}

            {list.some((d) => d.cardCount > 0) ? (
              <Pressable
                onPress={() => router.push('/new-revision')}
                accessibilityRole="button"
                className="mb-2 flex-row items-center gap-4 rounded-3xl bg-primary p-4 active:bg-primary-dark"
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Icon name="git-merge-outline" size={24} color={colors.white} />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-white">Create revision</Text>
                  <Text className="text-sm text-white/75">Mix several decks into one session</Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.white} />
              </Pressable>
            ) : null}

            {list.some((d) => d.cardCount > 0) ? (
              <Pressable
                onPress={() => router.push('/favorites')}
                accessibilityRole="button"
                className="mb-2 flex-row items-center gap-4 rounded-3xl border border-line bg-white p-4 active:bg-surface"
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-warning/20">
                  <Icon name="star" size={24} color={colors.warning} />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-ink">Favourites</Text>
                  <Text className="text-sm text-muted">Your starred cards from every deck</Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          decks === null ? undefined : (
            <EmptyState
              icon="layers-outline"
              title="No decks yet"
              text="Create your first deck to start adding flashcards."
            />
          )
        }
        renderItem={({ item: deck }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: deck.id } })}
            className="flex-row items-center gap-4 rounded-3xl bg-surface p-4 active:bg-line"
          >
            <DeckBadge name={deck.name} size={56} />
            <View className="flex-1">
              <Text className="text-lg font-bold text-ink" numberOfLines={1}>
                {deck.name}
              </Text>
              <Text className="text-sm text-muted" numberOfLines={1}>
                {deck.description ? `${plural(deck.cardCount, 'card')} · ${deck.description}` : plural(deck.cardCount, 'card')}
              </Text>
              <View className="mt-1 flex-row">
                <IconButton icon="create-outline" label="Edit deck" onPress={() => setForm({ mode: 'edit', deck })} />
                <IconButton icon="trash-outline" label="Delete deck" tone="danger" onPress={() => handleDelete(deck)} />
              </View>
            </View>
            {deck.cardCount > 0 ? (
              <Pressable
                onPress={() => router.push({ pathname: '/study/[id]', params: { id: deck.id } })}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Study ${deck.name}`}
                className="h-12 w-12 items-center justify-center rounded-full bg-cta active:bg-cta-dark"
              >
                <Icon name="play" size={22} color={colors.white} />
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />

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
