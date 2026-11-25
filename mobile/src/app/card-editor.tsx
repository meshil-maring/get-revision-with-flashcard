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

import { AttachmentList, type AttachmentItem } from '@/components/cards/attachments';
import { AudioRecorderModal } from '@/components/cards/audio-recorder';
import { ScreenTip } from '@/components/ui/screen-tip';
import { RichTextInput } from '@/components/ui/rich-text-input';
import { colors, Icon, type IconName } from '@/components/ui';
import { addAttachment, deleteAttachment, listAttachmentsForCards } from '@/data/attachments';
import { createCard, getCard, updateCard } from '@/data/cards';
import { getDeck } from '@/data/decks';
import type { CardSide } from '@/data/types';
import {
  keepFile,
  pickAudioFile,
  pickImage,
  pickPdf,
  removeFile,
  type PickedFile,
} from '@/lib/attachment-files';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

/** An attachment in the editor. `savedId` is set for ones already in the database. */
type Draft = AttachmentItem & { side: CardSide; savedId?: string };

let draftCounter = 0;
const newKey = () => `draft-${(draftCounter += 1)}`;

function showError(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/**
 * Create or edit a card: question, formatted answer, and pictures, PDFs or audio on
 * either side. URL: /card-editor?deckId=… (new card) or ?deckId=…&cardId=… (edit).
 */
export default function CardEditorScreen() {
  const { deckId, cardId } = useLocalSearchParams<{ deckId: string; cardId?: string }>();
  const db = useSQLiteContext();
  const editing = Boolean(cardId);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(editing);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [removed, setRemoved] = useState<Draft[]>([]);
  const [frontFocused, setFrontFocused] = useState(false);
  const [recordingSide, setRecordingSide] = useState<CardSide | null>(null);
  const [saving, setSaving] = useState(false);
  const [deckName, setDeckName] = useState('');

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    getDeck(db, deckId).then((deck) => {
      if (!cancelled && deck) setDeckName(deck.name);
    });
    return () => {
      cancelled = true;
    };
  }, [db, deckId]);

  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    Promise.all([getCard(db, cardId), listAttachmentsForCards(db, [cardId])]).then(([card, byCard]) => {
      if (cancelled) return;
      if (card) {
        setFront(card.front);
        setBack(card.back);
      }
      setDrafts(
        (byCard.get(cardId) ?? []).map((a) => ({
          key: a.id,
          savedId: a.id,
          side: a.side,
          kind: a.kind,
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType,
        })),
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [db, cardId]);

  function addDraft(side: CardSide, file: PickedFile | null) {
    if (!file) return;
    setDrafts((prev) => [...prev, { ...file, key: newKey(), side }]);
  }

  async function attach(side: CardSide, pick: () => Promise<PickedFile | null>) {
    try {
      addDraft(side, await pick());
    } catch {
      showError('Could not attach file', 'Please try again.');
    }
  }

  function remove(item: AttachmentItem) {
    const draft = drafts.find((d) => d.key === item.key);
    if (!draft) return;
    setDrafts((prev) => prev.filter((d) => d.key !== item.key));
    if (draft.savedId) setRemoved((prev) => [...prev, draft]);
  }

  const canSave = front.trim().length > 0 && back.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = { front, back };
      let id = cardId;
      if (id) await updateCard(db, id, input);
      else id = await createCard(db, deckId, input);

      for (const draft of drafts.filter((d) => !d.savedId)) {
        const uri = await keepFile(draft);
        await addAttachment(db, id, { side: draft.side, kind: draft.kind, uri, name: draft.name, mimeType: draft.mimeType });
      }
      for (const draft of removed) {
        await deleteAttachment(db, draft.savedId!);
        removeFile(draft.uri);
      }
      router.back();
    } catch {
      setSaving(false);
      showError('Could not save the card', 'Please try again.');
    }
  }

  const sideItems = (side: CardSide) => drafts.filter((d) => d.side === side);

  const missing = !front.trim() ? 'a question' : !back.trim() ? 'an answer' : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-page">
      <Stack.Screen
        options={{
          title: editing ? 'Edit card' : 'New card',
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/help/[topic]', params: { topic: 'cards' } })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Help with cards"
              className="h-10 w-10 items-center justify-center rounded-full active:bg-surface"
            >
              <Icon name="help-circle-outline" size={30} color={colors.ink} />
            </Pressable>
          ),
        }}
      />

      {loading ? null : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName="w-full max-w-2xl self-center gap-4 px-4 pb-8 pt-1"
            keyboardShouldPersistTaps="handled"
          >
            {deckName ? (
              <View className="flex-row items-center gap-1.5 px-1">
                <Icon name="albums-outline" size={18} color={colors.muted} />
                <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                  {editing ? 'In ' : 'Adding to '}
                  <Text className="font-semibold text-ink">{deckName}</Text>
                </Text>
              </View>
            ) : null}

            <ScreenTip id="cardEditor" />

            {/* Question */}
            <SectionCard icon="help" title="Question" accent="primary" filled={front.trim().length > 0}>
              <TextInput
                value={front}
                onChangeText={setFront}
                placeholder="e.g. What is mitosis?"
                placeholderTextColor={colors.faint}
                multiline
                autoFocus={!editing}
                textAlignVertical="top"
                accessibilityLabel="Question"
                onFocus={() => setFrontFocused(true)}
                onBlur={() => setFrontFocused(false)}
                style={{
                  ...NO_WEB_FOCUS_RING,
                  borderWidth: 1.5,
                  borderColor: frontFocused ? colors.primary : colors.line,
                }}
                className="min-h-20 rounded-xl bg-white px-4 py-3 text-lg text-ink"
              />
              <AttachSection
                side="front"
                items={sideItems('front')}
                onRemove={remove}
                onAttach={attach}
                onRecord={() => setRecordingSide('front')}
              />
            </SectionCard>

            {/* Answer */}
            <SectionCard icon="chatbox-ellipses" title="Answer" accent="calm" filled={back.trim().length > 0}>
              <RichTextInput
                value={back}
                onChangeText={setBack}
                accent={colors.calm}
                placeholder="e.g. Cell division into two identical cells. Select text and use the toolbar to format it."
              />
              <AttachSection
                side="back"
                items={sideItems('back')}
                onRemove={remove}
                onAttach={attach}
                onRecord={() => setRecordingSide('back')}
              />
            </SectionCard>
          </ScrollView>

          {/* Actions stay on screen while you scroll and type. */}
          <View className="border-t border-line bg-white px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
            <View className="w-full max-w-2xl self-center">
              {missing ? (
                <Text className="mb-2 text-center text-xs text-muted">Add {missing} to save this card</Text>
              ) : null}
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => router.back()}
                  accessibilityRole="button"
                  className="flex-1 items-center justify-center rounded-2xl border border-line bg-white py-4 active:bg-surface"
                >
                  <Text className="text-base font-semibold text-ink">Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!canSave}
                  onPress={save}
                  accessibilityRole="button"
                  accessibilityLabel="Save"
                  accessibilityState={{ disabled: !canSave }}
                  style={{ flex: 1.4 }}
                  className={`flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
                    canSave ? 'bg-cta active:bg-cta-dark' : 'bg-cta/40'
                  }`}
                >
                  <Icon name={saving ? 'hourglass-outline' : 'checkmark'} size={24} color={colors.white} />
                  <Text className="text-base font-semibold text-white">{saving ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      )}

      <AudioRecorderModal
        visible={recordingSide !== null}
        onCancel={() => setRecordingSide(null)}
        onDone={(file) => {
          if (recordingSide) addDraft(recordingSide, file);
          setRecordingSide(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

type Accent = 'primary' | 'calm';

const ACCENTS: Record<Accent, { color: string; chip: string }> = {
  primary: { color: colors.primary, chip: 'bg-primary-soft active:bg-primary/20' },
  calm: { color: colors.calm, chip: 'bg-calm-soft active:bg-calm/20' },
};

/** A white card holding one side of the flashcard, with a coloured icon and a tick once it's filled in. */
function SectionCard({
  icon,
  title,
  accent,
  filled,
  children,
}: {
  icon: IconName;
  title: string;
  accent: Accent;
  filled: boolean;
  children: ReactNode;
}) {
  return (
    <View className="rounded-3xl border border-line bg-white p-4 shadow-sm">
      <View className="mb-3 flex-row items-center gap-2.5">
        <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: ACCENTS[accent].color }}>
          <Icon name={icon} size={22} color={colors.white} />
        </View>
        <Text className="flex-1 text-lg font-bold text-ink">{title}</Text>
        {filled ? (
          <Icon name="checkmark-circle" size={24} color={colors.calm} />
        ) : (
          <Text className="text-xs font-semibold text-muted">Required</Text>
        )}
      </View>
      {children}
    </View>
  );
}

const ATTACH_BUTTONS: { label: string; icon: IconName; pick?: () => Promise<PickedFile | null> }[] = [
  { label: 'Image', icon: 'image-outline', pick: pickImage },
  { label: 'PDF', icon: 'document-text-outline', pick: pickPdf },
  { label: 'Record', icon: 'mic-outline' }, // opens the recorder
  { label: 'Audio file', icon: 'musical-notes-outline', pick: pickAudioFile },
];

function AttachSection({
  side,
  items,
  onRemove,
  onAttach,
  onRecord,
}: {
  side: CardSide;
  items: AttachmentItem[];
  onRemove: (item: AttachmentItem) => void;
  onAttach: (side: CardSide, pick: () => Promise<PickedFile | null>) => void;
  onRecord: () => void;
}) {
  const sideName = side === 'front' ? 'question' : 'answer';
  const accent = ACCENTS[side === 'front' ? 'primary' : 'calm'];
  return (
    <View className="mt-3 gap-3">
      <View className="flex-row flex-wrap gap-2">
        {ATTACH_BUTTONS.map((button) => (
          <Pressable
            key={button.label}
            onPress={() => (button.pick ? onAttach(side, button.pick) : onRecord())}
            accessibilityRole="button"
            accessibilityLabel={`Add ${button.label.toLowerCase()} to ${sideName}`}
            className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${accent.chip}`}
          >
            <Icon name={button.icon} size={18} color={accent.color} />
            <Text className="text-sm font-semibold text-ink">{button.label}</Text>
          </Pressable>
        ))}
      </View>
      <AttachmentList items={items} onRemove={onRemove} />
    </View>
  );
}
