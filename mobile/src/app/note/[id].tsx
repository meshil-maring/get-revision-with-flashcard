import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttachmentList } from '@/components/cards/attachments';
import { AiBadge, FolderPath } from '@/components/notes/folder-browser';
import { FocusReader } from '@/components/notes/focus-reader';
import { ReadAloudButton, useReadAloud } from '@/components/notes/read-aloud';
import { RichText } from '@/components/ui/rich-text';
import { TagChip } from '@/components/tags/tag-chip';
import { Button, colors, EmptyState, Icon, IconButton } from '@/components/ui';
import { getFolderPath } from '@/data/folders';
import { deleteNote, getNote, listNoteAttachments, listNotes, setNoteFavorite } from '@/data/notes';
import { listTagsForNotes } from '@/data/tags';
import type { FolderCrumb, Note, NoteAttachment, Tag } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { suggestCards } from '@/lib/notes';

/** Reading a note. Edit it, turn it into flashcards, or delete it from here. */
export default function NoteScreen() {
  // focus=1: opened with Previous / Next from focus mode, so stay in focus mode.
  const { id, focus: startInFocus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<Note | null | undefined>(undefined); // undefined = loading
  const [path, setPath] = useState<FolderCrumb[]>([]);
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  // The other notes in the same folder, in the order the folder lists them, for Previous / Next.
  const [siblings, setSiblings] = useState<Note[]>([]);
  const [focus, setFocus] = useState(startInFocus === '1');
  const exitFocus = useCallback(() => setFocus(false), []);
  const readAloud = useReadAloud(note ?? null);
  const stopReading = readAloud.stop;

  const load = useCallback(async () => {
    const n = await getNote(db, id);
    const [p, a, t, s] = await Promise.all([
      getFolderPath(db, n?.folderId ?? null),
      listNoteAttachments(db, id),
      listTagsForNotes(db, [id]),
      n?.folderId ? listNotes(db, n.folderId) : Promise.resolve([]),
    ]);
    setNote(n);
    setPath(p);
    setAttachments(a);
    setTags(t.get(id) ?? []);
    setSiblings(s);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Opening the editor or another screen stops the reading.
      return stopReading;
    }, [load, stopReading]),
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
  const position = siblings.findIndex((n) => n.id === current.id);
  const previous = position > 0 ? siblings[position - 1] : null;
  const next = position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : null;

  function edit() {
    router.push({ pathname: '/note-editor', params: { noteId: current.id } });
  }

  async function toggleFavorite() {
    await setNoteFavorite(db, current.id, current.favoritedAt === null);
    await load();
  }

  async function handleDelete() {
    const ok = await confirm('Delete note?', `"${current.title}" will be deleted.`);
    if (!ok) return;
    await deleteNote(db, current.id);
    router.back();
  }

  const steps =
    previous || next ? (
      <NoteSteps previous={previous} next={next} position={position} total={siblings.length} inFocus={focus && !isEmpty} />
    ) : null;

  if (focus && !isEmpty) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar hidden />
        <FocusReader note={current} onExit={exitFocus} readAloud={readAloud} footer={steps} />
      </>
    );
  }

  return (
    <View className="flex-1 bg-page">
      <Stack.Screen
        options={{
          title: '',
          headerShown: true,
          headerRight: () => (
            <View className="flex-row">
              {isEmpty ? null : <ReadAloudButton speaking={readAloud.speaking} onPress={readAloud.toggle} />}
              <IconButton
                icon={current.favoritedAt ? 'star' : 'star-outline'}
                label={current.favoritedAt ? 'Remove from favourites' : 'Add to favourites'}
                tone={current.favoritedAt ? 'favorite' : 'default'}
                onPress={toggleFavorite}
              />
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
          {tags.length > 0 ? (
            <View className="mt-2 flex-row flex-wrap gap-2">
              {tags.map((tag) => (
                <TagChip
                  key={tag.id}
                  tag={tag}
                  size="md"
                  onPress={() => router.push({ pathname: '/tag/[id]', params: { id: tag.id } })}
                />
              ))}
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
        {steps}
        <View className="w-full max-w-3xl flex-row gap-3 self-center">
          <Button label="Focus" icon="book-outline" variant="secondary" disabled={isEmpty} onPress={() => setFocus(true)} />
          <Button
            label={suggested > 0 ? `Make flashcards (${suggested} found)` : 'Make flashcards'}
            icon="copy-outline"
            variant="cta"
            className="flex-1"
            onPress={() => router.push({ pathname: '/note-cards', params: { noteId: current.id } })}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Previous / Next for notes in the same folder. Replaces this screen rather than
 * stacking a new one, so Back still returns to the folder.
 */
function NoteSteps({
  previous,
  next,
  position,
  total,
  inFocus,
}: {
  previous: Note | null;
  next: Note | null;
  position: number;
  total: number;
  inFocus: boolean;
}) {
  const open = (note: Note) =>
    router.replace({ pathname: '/note/[id]', params: inFocus ? { id: note.id, focus: '1' } : { id: note.id } });
  return (
    <View className={`w-full max-w-3xl flex-row items-center gap-2 self-center ${inFocus ? '' : 'mb-3'}`}>
      <Pressable
        onPress={previous ? () => open(previous) : undefined}
        disabled={!previous}
        accessibilityRole="button"
        accessibilityLabel={previous ? `Previous note: ${previous.title}` : 'No previous note'}
        accessibilityState={{ disabled: !previous }}
        className={`min-h-11 flex-1 flex-row items-center gap-1 rounded-xl px-2 active:bg-surface ${previous ? '' : 'opacity-30'}`}
      >
        <Icon name="chevron-back" size={22} color={colors.primary} />
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-wider text-muted">Previous</Text>
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
            {previous?.title ?? '—'}
          </Text>
        </View>
      </Pressable>
      <Text className="text-xs font-semibold text-muted">
        {position + 1} / {total}
      </Text>
      <Pressable
        onPress={next ? () => open(next) : undefined}
        disabled={!next}
        accessibilityRole="button"
        accessibilityLabel={next ? `Next note: ${next.title}` : 'No next note'}
        accessibilityState={{ disabled: !next }}
        className={`min-h-11 flex-1 flex-row items-center gap-1 rounded-xl px-2 active:bg-surface ${next ? '' : 'opacity-30'}`}
      >
        <View className="flex-1 items-end">
          <Text className="text-xs font-bold uppercase tracking-wider text-muted">Next</Text>
          <Text className="text-right text-sm font-semibold text-ink" numberOfLines={1}>
            {next?.title ?? '—'}
          </Text>
        </View>
        <Icon name="chevron-forward" size={22} color={colors.primary} />
      </Pressable>
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
