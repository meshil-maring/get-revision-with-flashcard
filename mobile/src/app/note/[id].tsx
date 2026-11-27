import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttachmentList } from '@/components/cards/attachments';
import { AiBadge, FolderPath } from '@/components/notes/folder-browser';
import { FocusReader } from '@/components/notes/focus-reader';
import { NoteImages, NoteImagesProvider, placedImageIds, type ImageSyncState } from '@/components/notes/note-images';
import { ReadAloudButton, ReadAloudPlayer, useReadAloud } from '@/components/notes/read-aloud';
import { PatrickHand_400Regular, useFonts } from '@expo-google-fonts/patrick-hand';

import { ActionSheet } from '@/components/ui/action-sheet';
import {
  CHIP_YELLOW,
  NOTE_PURPLE,
  NoteLookProvider,
  RichText,
  useNoteFont,
  type NoteLook,
} from '@/components/ui/rich-text';
import { TagChip } from '@/components/tags/tag-chip';
import { Button, colors, EmptyState, Icon, IconButton } from '@/components/ui';
import { getFolderPath } from '@/data/folders';
import { deleteNote, getNote, listNoteAttachments, listNotes, setNoteFavorite } from '@/data/notes';
import { getNoteHandwriting, setNoteHandwriting } from '@/data/settings';
import { listTagsForNotes } from '@/data/tags';
import type { FolderCrumb, Note, NoteAttachment, Tag } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { useOptionalAccount } from '@/providers/account-context';
import { bodyWithoutTitle, isGoodToKnow, suggestCards } from '@/lib/notes';

/** Reading a note. Read it aloud, step through the folder, and (from the ⋮ menu) make flashcards, favourite, edit or delete it. */
export default function NoteScreen() {
  // focus=1: opened with Previous / Next from focus mode, so stay in focus mode.
  const { id, focus: startInFocus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<Note | null | undefined>(undefined); // undefined = loading
  const [path, setPath] = useState<FolderCrumb[]>([]);
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  // The other notes in the same folder (or at the top level), in the order they're listed, for Previous / Next.
  const [siblings, setSiblings] = useState<Note[]>([]);
  const [focus, setFocus] = useState(startInFocus === '1');
  const exitFocus = useCallback(() => setFocus(false), []);
  const readAloud = useReadAloud(note ?? null);
  const stopReading = readAloud.stop;
  // Cornell notes are shown in a handwritten font, unless it was turned off from the ⋮ menu.
  const [handwriting, setHandwriting] = useState(true);
  const [fontLoaded] = useFonts({ PatrickHand_400Regular });

  const load = useCallback(async () => {
    const n = await getNote(db, id);
    const [p, a, t, s, h] = await Promise.all([
      getFolderPath(db, n?.folderId ?? null),
      listNoteAttachments(db, id),
      listTagsForNotes(db, [id]),
      n ? listNotes(db, n.folderId) : Promise.resolve([]),
      getNoteHandwriting(db),
    ]);
    setHandwriting(h);
    setNote(n);
    setPath(p);
    setAttachments(a);
    setTags(t.get(id) ?? []);
    setSiblings(s);
  }, [db, id]);

  // A sync can bring images an AI app added (or finish downloading them): show them.
  const account = useOptionalAccount();
  const lastSyncedAt = account?.lastSyncedAt ?? null;
  useFocusEffect(
    useCallback(() => {
      if (lastSyncedAt) void load();
    }, [lastSyncedAt, load]),
  );

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
  // Images show as figures; PDFs and audio stay chips. A file still downloading (uri '') can
  // only be shown as loading, so only images are listed before they arrive.
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image' && a.uri !== '');
  // Images the text places (":::image" lines, e.g. inside a Cornell row) show there; the rest at the end.
  const placed = placedImageIds(current, images);
  const otherImages = images.filter((i) => !placed.has(i.id));
  const imageSync: ImageSyncState = {
    signedIn: account?.user != null,
    syncing: account?.syncStatus === 'syncing',
    error: account?.syncError ?? null,
    onSyncNow: account?.user ? () => void account.syncNow() : undefined,
  };
  const suggested = suggestCards(current).length;
  const isEmpty = cornell
    ? current.rows.length === 0 && !current.summary
    : !bodyWithoutTitle(current.body, current.title).trim();
  const position = siblings.findIndex((n) => n.id === current.id);
  const previous = position > 0 ? siblings[position - 1] : null;
  const next = position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : null;
  const look: NoteLook = cornell
    ? { cornell: true, font: handwriting && fontLoaded ? 'PatrickHand_400Regular' : undefined }
    : {};

  async function toggleHandwriting() {
    await setNoteHandwriting(db, !handwriting);
    setHandwriting(!handwriting);
  }

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
        <NoteLookProvider look={look}>
          <NoteImagesProvider images={images} sync={imageSync}>
            <FocusReader
              note={current}
              onExit={exitFocus}
              readAloud={readAloud}
              footer={steps}
              after={otherImages.length > 0 ? <NoteImages images={otherImages} /> : null}
            />
          </NoteImagesProvider>
        </NoteLookProvider>
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
              {isEmpty ? null : <ReadAloudButton speaking={readAloud.open} onPress={readAloud.toggle} />}
              <IconButton icon="ellipsis-vertical" label="More options" onPress={() => setMenuOpen(true)} />
            </View>
          ),
        }}
      />

      <NoteLookProvider look={look}>
      <NoteImagesProvider images={images} sync={imageSync}>
      <ScrollView contentContainerClassName="w-full max-w-3xl self-center gap-4 px-5 pb-8 pt-2">
        <View className="gap-1">
          <FolderPath path={path} prefix="Notes" />
          <NoteTitle title={current.title} cornell={cornell} />
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
            <Text className="text-center text-base text-muted">
              {isGoodToKnow(current)
                ? 'Key points from each note in this folder will collect here. Ask your AI app: "Add good to know for these notes". You can also write your own.'
                : 'This note is empty. Tap to start writing.'}
            </Text>
          </Pressable>
        ) : cornell ? (
          <CornellView note={current} />
        ) : (
          <View className="rounded-3xl border border-line bg-white p-5">
            <RichText text={bodyWithoutTitle(current.body, current.title)} />
          </View>
        )}

        {otherImages.length > 0 ? (
          <View className="gap-2">
            <Text className="px-1 text-sm font-bold uppercase tracking-wider text-muted">
              {otherImages.length === 1 ? 'Image' : 'Images'}
            </Text>
            <NoteImages images={otherImages} />
          </View>
        ) : null}
        {files.length > 0 ? (
          <View className="gap-2">
            <Text className="px-1 text-sm font-bold uppercase tracking-wider text-muted">Attachments</Text>
            <AttachmentList items={files.map((a) => ({ ...a, key: a.id }))} />
          </View>
        ) : null}
      </ScrollView>
      </NoteImagesProvider>
      </NoteLookProvider>

      <View className="gap-3 border-t border-line bg-white px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <ReadAloudPlayer readAloud={readAloud} />
        <View className="w-full max-w-3xl flex-row items-center gap-2 self-center">
          <Button label="Focus" icon="book-outline" variant="secondary" disabled={isEmpty} onPress={() => setFocus(true)} />
          {steps ? <View className="flex-1">{steps}</View> : null}
        </View>
      </View>

      <ActionSheet
        visible={menuOpen}
        title={current.title}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            icon: 'copy-outline',
            label: suggested > 0 ? `Make flashcards (${suggested} found)` : 'Make flashcards',
            onPress: () => router.push({ pathname: '/note-cards', params: { noteId: current.id } }),
          },
          current.favoritedAt
            ? { icon: 'star', label: 'Remove from favourites', onPress: toggleFavorite }
            : { icon: 'star-outline', label: 'Add to favourites', onPress: toggleFavorite },
          ...(cornell
            ? [
                {
                  icon: 'pencil-outline' as const,
                  label: handwriting ? 'Use normal font' : 'Use handwritten font',
                  onPress: toggleHandwriting,
                },
              ]
            : []),
          { icon: 'create-outline', label: 'Edit note', onPress: edit },
          { icon: 'trash-outline', label: 'Delete note', tone: 'danger', onPress: handleDelete },
        ]}
      />
    </View>
  );
}

/**
 * Previous / Next for notes in the same folder (or both at the top level). Replaces this screen rather than
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
    <View className="w-full max-w-3xl flex-row items-center gap-2 self-center">
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

/** The note's title; on a Cornell note it sits on a yellow highlight, in the note's font. */
function NoteTitle({ title, cornell }: { title: string; cornell: boolean }) {
  const font = useNoteFont();
  if (!cornell) return <Text className="text-3xl font-extrabold text-ink">{title}</Text>;
  return (
    <View className="flex-row">
      <Text
        accessibilityRole="header"
        className="rounded-lg px-2 py-0.5 text-3xl font-extrabold text-ink"
        style={[{ backgroundColor: CHIP_YELLOW }, font]}
      >
        {title}
      </Text>
    </View>
  );
}

/** Lavender behind the cue column and the Summary label, and the yellow of the summary box. */
const CUE_LAVENDER = '#f6f3ff';
const SUMMARY_YELLOW = '#fff8d6';
const SUMMARY_BORDER = '#efd77a';
const SUMMARY_CHIP = '#e4dcfb';

/**
 * Cornell layout, like a hand-made Cornell page: cue questions (each with a purple ▸) on the
 * left, notes on the right, and the summary in a yellow box along the bottom.
 */
function CornellView({ note }: { note: Note }) {
  const font = useNoteFont();
  return (
    <View className="gap-3">
      <View className="overflow-hidden rounded-3xl border-2 border-line bg-white">
        <View className="flex-row border-b-2 border-line" style={{ backgroundColor: '#fffbe8' }}>
          <View className="w-1/3 px-3 py-2">
            <Text className="text-lg font-bold text-ink" style={font}>
              Cues / Questions
            </Text>
          </View>
          <View className="flex-1 flex-row items-center gap-1.5 border-l-2 border-line px-3 py-2">
            <Icon name="create-outline" size={20} color={colors.ink} />
            <Text className="text-lg font-bold text-ink" style={font}>
              Notes
            </Text>
          </View>
        </View>
        {note.rows.map((row, i) => (
          <View key={i} className={`flex-row ${i < note.rows.length - 1 ? 'border-b border-line' : ''}`}>
            <View className="w-1/3 flex-row gap-1 p-3" style={{ backgroundColor: CUE_LAVENDER }}>
              {row.cue.trim() ? (
                <>
                  <View className="pt-1">
                    <Icon name="caret-forward" size={18} color={NOTE_PURPLE} />
                  </View>
                  <Text className="flex-1 text-base font-semibold text-ink" style={font}>
                    {row.cue}
                  </Text>
                </>
              ) : null}
            </View>
            <View className="flex-1 border-l-2 border-line p-3">
              <RichText text={row.notes} />
            </View>
          </View>
        ))}
      </View>

      <View
        className="flex-row flex-wrap items-start gap-3 rounded-3xl border-2 p-4"
        style={{ backgroundColor: SUMMARY_YELLOW, borderColor: SUMMARY_BORDER }}
      >
        <Text
          accessibilityRole="header"
          className="rounded-lg px-2.5 py-0.5 text-xl font-bold text-ink"
          style={[{ backgroundColor: SUMMARY_CHIP, transform: [{ rotate: '-3deg' }] }, font]}
        >
          Summary
        </Text>
        <View className="min-w-48 flex-1">
          {note.summary ? (
            <RichText text={note.summary} />
          ) : (
            <Text className="text-sm text-muted" style={font}>
              No summary yet. Sum up the page in a few lines.
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
