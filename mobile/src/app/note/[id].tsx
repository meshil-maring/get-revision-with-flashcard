import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttachmentList } from '@/components/cards/attachments';
import { AiBadge, FolderPath } from '@/components/notes/folder-browser';
import { FocusReader } from '@/components/notes/focus-reader';
import { ArticleHeader, ArticleNote, CornellPaper } from '@/components/notes/note-layouts';
import { NoteImages, NoteImagesProvider, placedImageIds, type ImageSyncState } from '@/components/notes/note-images';
import { ReadAloudButton, ReadAloudPlayer, useReadAloud } from '@/components/notes/read-aloud';
import { PatrickHand_400Regular, useFonts } from '@expo-google-fonts/patrick-hand';

import { ActionSheet } from '@/components/ui/action-sheet';
import {
  NoteLookProvider,
  useNoteFont,
  type NoteLook,
} from '@/components/ui/rich-text';
import { TagChip } from '@/components/tags/tag-chip';
import { Button, EmptyState, Icon, IconButton, useColors } from '@/components/ui';
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
  // The page scrolls to a section when one is picked from a plain note's contents.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
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
    : { article: true };
  const plainBody = bodyWithoutTitle(current.body, current.title);

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
      <ScrollView ref={scroll} contentContainerClassName="w-full max-w-3xl self-center gap-4 px-5 pb-8 pt-2">
        <View className="gap-1">
          <FolderPath path={path} prefix="Notes" />
          {!cornell ? (
            <ArticleHeader title={current.title} body={plainBody} />
          ) : isEmpty ? (
            <NoteTitle title={current.title} />
          ) : null}
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
          <CornellPaper note={current} />
        ) : (
          <ArticleNote body={plainBody} onJump={(y) => scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true })} />
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

      <View className="gap-3 border-t border-line bg-card px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
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
  const colors = useColors();
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

/** An empty Cornell note's title (a Cornell note with content has it on its sheet). */
function NoteTitle({ title }: { title: string }) {
  const colors = useColors();
  const font = useNoteFont();
  return (
    <View className="flex-row">
      <Text
        accessibilityRole="header"
        className="rounded-lg px-2 py-0.5 text-3xl font-extrabold"
        style={[{ backgroundColor: colors.highlight, color: colors.highlightInk }, font]}
      >
        {title}
      </Text>
    </View>
  );
}
