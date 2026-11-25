import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttachmentList } from '@/components/attachments';
import { AiBadge, FolderPath } from '@/components/folder-browser';
import { RichText } from '@/components/rich-text';
import { Button, colors, EmptyState, Icon, IconButton } from '@/components/ui';
import { getFolderPath } from '@/data/folders';
import { deleteNote, getNote, listNoteAttachments } from '@/data/notes';
import type { FolderCrumb, Note, NoteAttachment } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { suggestCards } from '@/lib/notes';

/** Reading a note. Edit it, turn it into flashcards, or delete it from here. */
export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<Note | null | undefined>(undefined); // undefined = loading
  const [path, setPath] = useState<FolderCrumb[]>([]);
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const n = await getNote(db, id);
        const [p, a] = await Promise.all([getFolderPath(db, n?.folderId ?? null), listNoteAttachments(db, id)]);
        setNote(n);
        setPath(p);
        setAttachments(a);
      })();
    }, [db, id]),
  );

  if (note === undefined) return <Stack.Screen options={{ title: '' }} />;

  if (note === null) {
    return (
      <View className="flex-1 justify-center bg-page">
        <Stack.Screen options={{ title: 'Not found' }} />
        <EmptyState icon="alert-circle-outline" title="Note not found" text="This note no longer exists." />
      </View>
    );
  }

  const current = note;
  const cornell = current.style === 'cornell';
  const suggested = suggestCards(current).length;
  const isEmpty = cornell ? current.rows.length === 0 && !current.summary : !current.body;

  function edit() {
    router.push({ pathname: '/note-editor', params: { noteId: current.id } });
  }

  async function handleDelete() {
    const ok = await confirm('Delete note?', `"${current.title}" will be deleted.`);
    if (!ok) return;
    await deleteNote(db, current.id);
    router.back();
  }

  return (
    <View className="flex-1 bg-page">
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View className="flex-row">
              <IconButton icon="create-outline" label="Edit note" onPress={edit} />
              <IconButton icon="trash-outline" label="Delete note" tone="danger" onPress={handleDelete} />
            </View>
          ),
        }}
      />

      <ScrollView contentContainerClassName="w-full max-w-3xl self-center gap-4 px-5 pb-8 pt-2">
        <View className="gap-1">
          <FolderPath path={path} prefix="Notes" />
          <Text className="text-3xl font-extrabold text-ink">{current.title}</Text>
          {cornell || current.createdBy ? (
            <View className="mt-1 flex-row gap-2">
              {cornell ? (
                <View className="rounded-full bg-calm-soft px-2.5 py-0.5">
                  <Text className="text-xs font-bold text-calm">Cornell notes</Text>
                </View>
              ) : null}
              {current.createdBy ? <AiBadge by={current.createdBy} /> : null}
            </View>
          ) : null}
        </View>

        {isEmpty ? (
          <Pressable onPress={edit} accessibilityRole="button" className="rounded-2xl border border-dashed border-line bg-surface p-5">
            <Text className="text-center text-base text-muted">This note is empty. Tap to start writing.</Text>
          </Pressable>
        ) : cornell ? (
          <CornellView note={current} />
        ) : (
          <View className="rounded-3xl border border-line bg-white p-5">
            <RichText text={current.body} />
          </View>
        )}

        {attachments.length > 0 ? (
          <View className="gap-2">
            <Text className="px-1 text-sm font-bold uppercase tracking-wider text-muted">Attachments</Text>
            <AttachmentList items={attachments.map((a) => ({ ...a, key: a.id }))} />
          </View>
        ) : null}
      </ScrollView>

      <View className="border-t border-line bg-white px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="w-full max-w-3xl self-center">
          <Button
            label={suggested > 0 ? `Make flashcards (${suggested} found)` : 'Make flashcards'}
            icon="copy-outline"
            variant="cta"
            onPress={() => router.push({ pathname: '/note-cards', params: { noteId: current.id } })}
          />
        </View>
      </View>
    </View>
  );
}

/** Cornell layout: cues on the left, notes on the right, summary along the bottom. */
function CornellView({ note }: { note: Note }) {
  return (
    <View className="overflow-hidden rounded-3xl border border-line bg-white">
      <View className="flex-row border-b border-line bg-surface">
        <Text className="w-1/3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary">Cues</Text>
        <Text className="flex-1 border-l border-line px-3 py-2 text-xs font-bold uppercase tracking-wider text-calm">
          Notes
        </Text>
      </View>
      {note.rows.map((row, i) => (
        <View key={i} className="flex-row border-b border-line">
          <View className="w-1/3 bg-primary-soft/50 p-3">
            <Text className="text-base font-semibold text-ink">{row.cue}</Text>
          </View>
          <View className="flex-1 border-l border-line p-3">
            <RichText text={row.notes} />
          </View>
        </View>
      ))}
      <View className="gap-1 bg-calm-soft/50 p-4">
        <View className="flex-row items-center gap-1.5">
          <Icon name="list-outline" size={18} color={colors.calm} />
          <Text className="text-xs font-bold uppercase tracking-wider text-calm">Summary</Text>
        </View>
        {note.summary ? (
          <RichText text={note.summary} />
        ) : (
          <Text className="text-sm text-muted">No summary yet. Sum up the page in a few lines.</Text>
        )}
      </View>
    </View>
  );
}
