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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttachmentList, type AttachmentItem } from '@/components/attachments';
import { AudioRecorderModal } from '@/components/audio-recorder';
import { FolderPath } from '@/components/folder-browser';
import { RichTextInput } from '@/components/rich-text-input';
import { colors, Icon, IconButton, type IconName } from '@/components/ui';
import { getFolderPath } from '@/data/folders';
import {
  addNoteAttachment,
  createNote,
  deleteNoteAttachment,
  getNote,
  listNoteAttachments,
  updateNote,
} from '@/data/notes';
import type { FolderCrumb, NoteStyle } from '@/data/types';
import {
  keepFile,
  pickAudioFile,
  pickImage,
  pickPdf,
  removeFile,
  type PickedFile,
} from '@/lib/attachment-files';
import { convertNote } from '@/lib/notes';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

/** An attachment in the editor. `savedId` is set for ones already in the database. */
type Draft = AttachmentItem & { savedId?: string };
/** A Cornell row being edited, with a key that stays the same while rows are added or removed. */
type RowDraft = { key: string; cue: string; notes: string };

let counter = 0;
const newKey = () => `draft-${(counter += 1)}`;
const emptyRow = (): RowDraft => ({ key: newKey(), cue: '', notes: '' });

function showError(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const STYLES: { style: NoteStyle; label: string; icon: IconName; hint: string }[] = [
  { style: 'plain', label: 'Plain', icon: 'document-text-outline', hint: 'One page of notes' },
  { style: 'cornell', label: 'Cornell', icon: 'grid-outline', hint: 'Cues, notes and a summary' },
];

/**
 * Write or edit a note. URL: /note-editor?folderId=… (new note in a folder; no folderId =
 * top level) or ?noteId=… (edit).
 */
export default function NoteEditorScreen() {
  const { folderId, noteId } = useLocalSearchParams<{ folderId?: string; noteId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const editing = Boolean(noteId);

  const [loading, setLoading] = useState(editing);
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState<NoteStyle>('plain');
  const [body, setBody] = useState('');
  const [rows, setRows] = useState<RowDraft[]>(() => [emptyRow()]);
  const [summary, setSummary] = useState('');
  const [path, setPath] = useState<FolderCrumb[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [removed, setRemoved] = useState<Draft[]>([]);
  const [recording, setRecording] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!noteId) {
        const p = await getFolderPath(db, folderId ?? null);
        if (!cancelled) setPath(p);
        return;
      }
      const [note, attachments] = await Promise.all([getNote(db, noteId), listNoteAttachments(db, noteId)]);
      const p = await getFolderPath(db, note?.folderId ?? null);
      if (cancelled) return;
      if (note) {
        setTitle(note.title);
        setStyle(note.style);
        setBody(note.body);
        setRows(note.rows.length > 0 ? note.rows.map((r) => ({ ...r, key: newKey() })) : [emptyRow()]);
        setSummary(note.summary);
      }
      setPath(p);
      setDrafts(attachments.map((a) => ({ ...a, key: a.id, savedId: a.id })));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, noteId, folderId]);

  function switchStyle(to: NoteStyle) {
    if (to === style) return;
    const converted = convertNote({ body, rows, summary }, to);
    setBody(converted.body);
    setRows(converted.rows.length > 0 ? converted.rows.map((r) => ({ ...r, key: newKey() })) : [emptyRow()]);
    setSummary(converted.summary);
    setStyle(to);
  }

  function updateRow(key: string, change: Partial<RowDraft>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : [emptyRow()]));
  }

  async function attach(pick: () => Promise<PickedFile | null>) {
    try {
      const file = await pick();
      if (file) setDrafts((prev) => [...prev, { ...file, key: newKey() }]);
    } catch {
      showError('Could not attach file', 'Please try again.');
    }
  }

  function removeAttachment(item: AttachmentItem) {
    const draft = drafts.find((d) => d.key === item.key);
    if (!draft) return;
    setDrafts((prev) => prev.filter((d) => d.key !== item.key));
    if (draft.savedId) setRemoved((prev) => [...prev, draft]);
  }

  const canSave = title.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = { title, style, body, rows: rows.map(({ cue, notes }) => ({ cue, notes })), summary };
      let id = noteId;
      if (id) await updateNote(db, id, input);
      else id = await createNote(db, folderId ?? null, input);

      for (const draft of drafts.filter((d) => !d.savedId)) {
        const uri = await keepFile(draft);
        await addNoteAttachment(db, id, { kind: draft.kind, uri, name: draft.name, mimeType: draft.mimeType });
      }
      for (const draft of removed) {
        await deleteNoteAttachment(db, draft.savedId!);
        removeFile(draft.uri);
      }
      if (editing) router.back();
      else router.replace({ pathname: '/note/[id]', params: { id } });
    } catch {
      setSaving(false);
      showError('Could not save the note', 'Please try again.');
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-page">
      <Stack.Screen options={{ title: editing ? 'Edit note' : 'New note' }} />

      {loading ? null : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName="w-full max-w-2xl self-center gap-4 px-4 pb-8 pt-1"
            keyboardShouldPersistTaps="handled"
          >
            <View className="px-1">
              <FolderPath path={path} prefix={editing ? 'In Notes' : 'Adding to Notes'} />
            </View>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title, e.g. Newton’s laws"
              placeholderTextColor={colors.faint}
              autoFocus={!editing}
              accessibilityLabel="Title"
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
              style={{ ...NO_WEB_FOCUS_RING, borderWidth: 1.5, borderColor: titleFocused ? colors.primary : colors.line }}
              className="rounded-xl bg-white px-4 py-3 text-xl font-bold text-ink"
            />

            {/* Plain or Cornell */}
            <View className="flex-row gap-2" accessibilityRole="radiogroup">
              {STYLES.map((option) => {
                const selected = style === option.style;
                return (
                  <Pressable
                    key={option.style}
                    onPress={() => switchStyle(option.style)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${option.label} notes: ${option.hint}`}
                    className={`flex-1 flex-row items-center gap-2.5 rounded-2xl border p-3 ${
                      selected ? 'border-primary bg-primary-soft' : 'border-line bg-white active:bg-surface'
                    }`}
                  >
                    <Icon name={option.icon} size={24} color={selected ? colors.primary : colors.muted} />
                    <View className="flex-1">
                      <Text className={`text-base font-bold ${selected ? 'text-primary' : 'text-ink'}`}>{option.label}</Text>
                      <Text className="text-xs text-muted">{option.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {style === 'plain' ? (
              <RichTextInput
                value={body}
                onChangeText={setBody}
                label="Note"
                placeholder={'Write your notes. Tip: lines like "Speed: distance ÷ time" and headings become flashcards.'}
              />
            ) : (
              <View className="gap-3">
                <Text className="px-1 text-sm leading-5 text-muted">
                  Put a <Text className="font-bold text-primary">cue</Text> (a keyword or question) next to each part of your{' '}
                  <Text className="font-bold text-calm">notes</Text>. Cover the notes later and use the cues to test yourself.
                </Text>
                {rows.map((row, index) => (
                  <View key={row.key} className="gap-2 rounded-3xl border border-line bg-white p-3">
                    <View className="flex-row items-center gap-2">
                      <View className="h-8 w-8 items-center justify-center rounded-full bg-primary-soft">
                        <Text className="text-xs font-extrabold text-primary">{index + 1}</Text>
                      </View>
                      <TextInput
                        value={row.cue}
                        onChangeText={(cue) => updateRow(row.key, { cue })}
                        placeholder="Cue, e.g. What is inertia?"
                        placeholderTextColor={colors.faint}
                        accessibilityLabel={`Cue ${index + 1}`}
                        multiline
                        style={NO_WEB_FOCUS_RING}
                        className="flex-1 rounded-xl bg-primary-soft/60 px-3 py-2.5 text-base font-semibold text-ink"
                      />
                      <IconButton icon="close" label={`Remove row ${index + 1}`} onPress={() => removeRow(row.key)} />
                    </View>
                    <RichTextInput
                      value={row.notes}
                      onChangeText={(notes) => updateRow(row.key, { notes })}
                      label={`Notes ${index + 1}`}
                      accent={colors.calm}
                      compact
                      placeholder="Notes for this cue"
                    />
                  </View>
                ))}
                <Pressable
                  onPress={() => setRows((prev) => [...prev, emptyRow()])}
                  accessibilityRole="button"
                  className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-primary py-3 active:bg-primary-soft"
                >
                  <Icon name="add" size={22} color={colors.primary} />
                  <Text className="text-base font-semibold text-primary">Add row</Text>
                </Pressable>

                <View className="gap-2 rounded-3xl border border-line bg-calm-soft/40 p-3">
                  <View className="flex-row items-center gap-1.5 px-1">
                    <Icon name="list-outline" size={18} color={colors.calm} />
                    <Text className="text-sm font-bold uppercase tracking-wider text-calm">Summary</Text>
                  </View>
                  <RichTextInput
                    value={summary}
                    onChangeText={setSummary}
                    label="Summary"
                    accent={colors.calm}
                    compact
                    placeholder="Sum up the main ideas in your own words"
                  />
                </View>
              </View>
            )}

            {/* Attachments */}
            <View className="gap-3 rounded-3xl border border-line bg-white p-4">
              <Text className="text-base font-bold text-ink">Attachments</Text>
              <View className="flex-row flex-wrap gap-2">
                {(
                  [
                    { label: 'Image', icon: 'image-outline', onPress: () => attach(pickImage) },
                    { label: 'PDF', icon: 'document-text-outline', onPress: () => attach(pickPdf) },
                    { label: 'Record', icon: 'mic-outline', onPress: () => setRecording(true) },
                    { label: 'Audio file', icon: 'musical-notes-outline', onPress: () => attach(pickAudioFile) },
                  ] as { label: string; icon: IconName; onPress: () => void }[]
                ).map((button) => (
                  <Pressable
                    key={button.label}
                    onPress={button.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${button.label.toLowerCase()}`}
                    className="flex-row items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-2 active:bg-primary/20"
                  >
                    <Icon name={button.icon} size={18} color={colors.primary} />
                    <Text className="text-sm font-semibold text-ink">{button.label}</Text>
                  </Pressable>
                ))}
              </View>
              <AttachmentList items={drafts} onRemove={removeAttachment} />
            </View>
          </ScrollView>

          <View className="border-t border-line bg-white px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
            <View className="w-full max-w-2xl self-center">
              {!title.trim() ? <Text className="mb-2 text-center text-xs text-muted">Add a title to save this note</Text> : null}
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
        visible={recording}
        onCancel={() => setRecording(false)}
        onDone={(file) => {
          if (file) setDrafts((prev) => [...prev, { ...file, key: newKey() }]);
          setRecording(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}
