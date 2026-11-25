import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
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

import { AttachmentList, type AttachmentItem } from '@/components/attachments';
import { AudioRecorderModal } from '@/components/audio-recorder';
import { ScreenTip } from '@/components/screen-tip';
import { RichTextInput } from '@/components/rich-text-input';
import { colors, Icon, type IconName } from '@/components/ui';
import { addAttachment, deleteAttachment, listAttachmentsForCards } from '@/data/attachments';
import { createCard, getCard, updateCard } from '@/data/cards';
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

  const [loading, setLoading] = useState(editing);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [removed, setRemoved] = useState<Draft[]>([]);
  const [frontFocused, setFrontFocused] = useState(false);
  const [recordingSide, setRecordingSide] = useState<CardSide | null>(null);
  const [saving, setSaving] = useState(false);

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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-page">
      <Stack.Screen options={{ title: editing ? 'Edit card' : 'New card' }} />

      {loading ? null : (
        <ScrollView
          contentContainerClassName="w-full max-w-2xl self-center gap-6 px-5 pb-10 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <ScreenTip id="cardEditor" />

          {/* Question */}
          <View>
            <SectionTitle icon="help-circle-outline" title="Question" />
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
              className="min-h-20 rounded-xl bg-white px-4 py-3 text-base text-ink"
            />
            <AttachSection
              side="front"
              items={sideItems('front')}
              onRemove={remove}
              onAttach={attach}
              onRecord={() => setRecordingSide('front')}
            />
          </View>

          {/* Answer */}
          <View>
            <SectionTitle icon="bulb-outline" title="Answer" />
            <RichTextInput
              value={back}
              onChangeText={setBack}
              placeholder="e.g. Cell division into two identical cells. Use the toolbar for headings, **bold**, lists…"
            />
            <AttachSection
              side="back"
              items={sideItems('back')}
              onRemove={remove}
              onAttach={attach}
              onRecord={() => setRecordingSide('back')}
            />
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              className="flex-1 items-center rounded-xl border border-line bg-white py-3.5 active:bg-surface"
            >
              <Text className="text-base font-semibold text-ink">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!canSave}
              onPress={save}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              className={`flex-1 items-center rounded-xl py-3.5 ${canSave ? 'bg-cta active:bg-cta-dark' : 'bg-cta/40'}`}
            >
              <Text className="text-base font-semibold text-white">{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </ScrollView>
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

function SectionTitle({ icon, title }: { icon: IconName; title: string }) {
  return (
    <View className="mb-2 flex-row items-center gap-1.5">
      <Icon name={icon} size={20} color={colors.primary} />
      <Text className="text-base font-bold text-ink">{title}</Text>
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
  return (
    <View className="mt-3 gap-3">
      <View className="flex-row flex-wrap gap-2">
        {ATTACH_BUTTONS.map((button) => (
          <Pressable
            key={button.label}
            onPress={() => (button.pick ? onAttach(side, button.pick) : onRecord())}
            accessibilityRole="button"
            accessibilityLabel={`Add ${button.label.toLowerCase()} to ${sideName}`}
            className="flex-row items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 active:bg-surface"
          >
            <Icon name={button.icon} size={18} color={colors.primary} />
            <Text className="text-sm font-semibold text-ink">{button.label}</Text>
          </Pressable>
        ))}
      </View>
      <AttachmentList items={items} onRemove={onRemove} />
    </View>
  );
}
