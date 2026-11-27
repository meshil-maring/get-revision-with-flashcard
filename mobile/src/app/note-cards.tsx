import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeckBadge, Icon, IconButton, plural, useColors } from '@/components/ui';
import { createCard } from '@/data/cards';
import { createDeck, listDecks } from '@/data/decks';
import { getNote } from '@/data/notes';
import type { DeckWithCount, Note } from '@/data/types';
import { suggestCards } from '@/lib/notes';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;
const NEW_DECK = 'new';

type CardDraft = { key: string; front: string; back: string; include: boolean };

let counter = 0;
const newKey = () => `card-${(counter += 1)}`;

/**
 * Turns a note into flashcards. Cards found in the note are listed for the user to
 * check, change or untick, then added to a new or existing deck. URL: /note-cards?noteId=…
 */
export default function NoteCardsScreen() {
  const colors = useColors();
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const [note, setNote] = useState<Note | null>(null);
  const [decks, setDecks] = useState<DeckWithCount[]>([]);
  const [cards, setCards] = useState<CardDraft[]>([]);
  const [deckId, setDeckId] = useState<string>(NEW_DECK);
  const [deckName, setDeckName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getNote(db, noteId), listDecks(db)]).then(([n, d]) => {
      if (cancelled || !n) return;
      setNote(n);
      setDecks(d);
      const found = suggestCards(n).map((c) => ({ ...c, key: newKey(), include: true }));
      setCards(found.length > 0 ? found : [{ key: newKey(), front: '', back: '', include: true }]);
      // Add to the deck with the note's name if there is one; else make that deck.
      const same = d.find((deck) => deck.name.trim().toLowerCase() === n.title.trim().toLowerCase());
      setDeckId(same?.id ?? NEW_DECK);
      setDeckName(n.title);
    });
    return () => {
      cancelled = true;
    };
  }, [db, noteId]);

  function update(key: string, change: Partial<CardDraft>) {
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...change } : c)));
  }

  const ready = cards.filter((c) => c.include && c.front.trim() && c.back.trim());
  const canSave = ready.length > 0 && (deckId !== NEW_DECK || deckName.trim().length > 0) && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const target = deckId === NEW_DECK ? await createDeck(db, { name: deckName }) : deckId;
      for (const card of ready) await createCard(db, target, { front: card.front, back: card.back });
      router.replace({ pathname: '/deck/[id]', params: { id: target } });
    } catch {
      setSaving(false);
      if (Platform.OS === 'web') window.alert('Could not add the cards. Please try again.');
      else Alert.alert('Could not add the cards', 'Please try again.');
    }
  }

  if (!note) return <Stack.Screen options={{ title: 'Make flashcards' }} />;

  const foundAny = suggestCards(note).length > 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-page">
      <Stack.Screen options={{ title: 'Make flashcards' }} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full max-w-2xl self-center gap-4 px-4 pb-8 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-start gap-3 rounded-2xl bg-primary-soft p-4">
          <Icon name="bulb-outline" size={22} color={colors.primary} />
          <Text className="flex-1 text-sm leading-5 text-ink">
            {foundAny
              ? `Found ${plural(suggestCards(note).length, 'card')} in "${note.title}". Check them, change any you like, and untick the ones you don't want.`
              : note.style === 'cornell'
                ? 'Each cue with notes next to it becomes a card. Add some cues to your note, or write cards here.'
                : 'Lines like "Speed: distance ÷ time" and headings with text under them become cards. None found, so write cards here.'}
          </Text>
        </View>

        {cards.map((card, index) => (
          <View
            key={card.key}
            className={`gap-2 rounded-3xl border bg-card p-3 ${card.include ? 'border-line' : 'border-dashed border-line opacity-60'}`}
          >
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => update(card.key, { include: !card.include })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: card.include }}
                accessibilityLabel={`Include card ${index + 1}`}
                hitSlop={8}
                className="flex-row items-center gap-2"
              >
                <Icon name={card.include ? 'checkbox' : 'square-outline'} size={26} color={card.include ? colors.primary : colors.muted} />
                <Text className="text-sm font-bold text-muted">Card {index + 1}</Text>
              </Pressable>
              <View className="flex-1" />
              <IconButton
                icon="trash-outline"
                label={`Remove card ${index + 1}`}
                tone="danger"
                onPress={() => setCards((prev) => prev.filter((c) => c.key !== card.key))}
              />
            </View>
            <TextInput
              value={card.front}
              onChangeText={(front) => update(card.key, { front })}
              placeholder="Question"
              placeholderTextColor={colors.faint}
              accessibilityLabel={`Question ${index + 1}`}
              multiline
              style={NO_WEB_FOCUS_RING}
              className="rounded-xl bg-primary-soft/60 px-3 py-2.5 text-base font-semibold text-ink"
            />
            <TextInput
              value={card.back}
              onChangeText={(back) => update(card.key, { back })}
              placeholder="Answer"
              placeholderTextColor={colors.faint}
              accessibilityLabel={`Answer ${index + 1}`}
              multiline
              style={NO_WEB_FOCUS_RING}
              className="rounded-xl bg-calm-soft/60 px-3 py-2.5 text-base text-ink"
            />
          </View>
        ))}

        <Pressable
          onPress={() => setCards((prev) => [...prev, { key: newKey(), front: '', back: '', include: true }])}
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-primary py-3 active:bg-primary-soft"
        >
          <Icon name="add" size={22} color={colors.primary} />
          <Text className="text-base font-semibold text-primary">Add card</Text>
        </Pressable>

        {/* Which deck */}
        <View className="gap-2">
          <Text className="px-1 text-lg font-extrabold text-ink">Add to deck</Text>
          <DeckOption selected={deckId === NEW_DECK} onPress={() => setDeckId(NEW_DECK)} label="New deck" icon>
            {deckId === NEW_DECK ? (
              <TextInput
                value={deckName}
                onChangeText={setDeckName}
                placeholder="Deck name"
                placeholderTextColor={colors.faint}
                accessibilityLabel="New deck name"
                style={NO_WEB_FOCUS_RING}
                className="mt-2 rounded-xl bg-card px-3 py-2.5 text-base text-ink"
              />
            ) : null}
          </DeckOption>
          {decks.map((deck) => (
            <DeckOption
              key={deck.id}
              selected={deckId === deck.id}
              onPress={() => setDeckId(deck.id)}
              label={deck.name}
              detail={plural(deck.cardCount, 'card')}
            />
          ))}
        </View>
      </ScrollView>

      <View className="border-t border-line bg-card px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="w-full max-w-2xl self-center">
          <Pressable
            disabled={!canSave}
            onPress={save}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            className={`flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
              canSave ? 'bg-cta active:bg-cta-dark' : 'bg-cta/40'
            }`}
          >
            <Icon name={saving ? 'hourglass-outline' : 'copy-outline'} size={24} color={colors.white} />
            <Text className="text-base font-semibold text-white">
              {saving ? 'Adding…' : ready.length > 0 ? `Add ${plural(ready.length, 'card')}` : 'Add cards'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function DeckOption({
  selected,
  onPress,
  label,
  detail,
  icon,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  detail?: string;
  icon?: boolean;
  children?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View className={`rounded-2xl border p-3 ${selected ? 'border-primary bg-primary-soft' : 'border-line bg-card'}`}>
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        className="flex-row items-center gap-3"
      >
        <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? colors.primary : colors.muted} />
        {icon ? (
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-cta">
            <Icon name="add" size={22} color={colors.white} />
          </View>
        ) : (
          <DeckBadge name={label} size={36} />
        )}
        <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
          {label}
        </Text>
        {detail ? <Text className="text-sm text-muted">{detail}</Text> : null}
      </Pressable>
      {children}
    </View>
  );
}
