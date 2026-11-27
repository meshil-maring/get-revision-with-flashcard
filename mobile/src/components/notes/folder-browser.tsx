import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, BackHandler, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { FolderPicker } from '@/components/notes/folder-picker';
import { ActionSheet } from '@/components/ui/action-sheet';
import { TagRow } from '@/components/tags/tag-chip';
import { FormModal, type FormField } from '@/components/ui/form-modal';
import { EmptyState, Icon, plural, scaled, subjectIcon, type IconName, useColors } from '@/components/ui';
import {
  countFolderContents,
  createFolder,
  deleteFolder,
  FolderMoveError,
  FolderNameTakenError,
  listFolders,
  moveFolders,
  renameFolder,
  setFolderFavorite,
} from '@/data/folders';
import { createNote, deleteNote, listNotes, moveNotes, setNoteFavorite } from '@/data/notes';
import { listTagsForNotes } from '@/data/tags';
import type { FolderWithCounts, Note, Tag } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { GOOD_TO_KNOW_TITLE, isGoodToKnow, notePreview } from '@/lib/notes';

const FOLDER_FIELDS: FormField[] = [
  { key: 'name', label: 'Name', placeholder: 'e.g. Class 10, Physics, Chapter 1 or Motion', required: true },
];

/** Shows a short message. Uses window.alert on web, where Alert doesn't show. */
function tell(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** "2 folders and 3 notes" */
function listWhat(folders: number, notes: number): string {
  return [folders > 0 ? plural(folders, 'folder') : null, notes > 0 ? plural(notes, 'note') : null]
    .filter(Boolean)
    .join(' and ');
}

/** A copy of the set with the id added, or taken out if it was there. */
function toggled(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'rename'; folder: FolderWithCounts };

/** "2 folders · 5 notes", or "Empty". */
export function folderSummary(folder: { folderCount: number; noteCount: number }): string {
  const parts = [];
  if (folder.folderCount > 0) parts.push(plural(folder.folderCount, 'folder'));
  if (folder.noteCount > 0) parts.push(plural(folder.noteCount, 'note'));
  return parts.length > 0 ? parts.join(' · ') : 'Empty';
}

/** A folder's icon: the subject's icon if the name is a subject (Physics → atom), else a folder. */
export function FolderBadge({ name, size = 48 }: { name: string; size?: number }) {
  const colors = useColors();
  const icon = subjectIcon(name);
  return (
    <View
      className="items-center justify-center rounded-2xl bg-primary-soft"
      style={{ width: scaled(size), height: scaled(size) }}
    >
      <MaterialCommunityIcons
        name={icon === 'book-outline' ? 'folder-outline' : icon}
        size={scaled(size * 0.52)}
        color={colors.primary}
      />
    </View>
  );
}

/** The icon for a note in a list. */
export function NoteBadge({ cornell, goodToKnow = false, size = 48 }: { cornell: boolean; goodToKnow?: boolean; size?: number }) {
  const colors = useColors();
  if (goodToKnow) {
    // A bulb, so the folder's key-points page is easy to spot at the end of the list.
    return (
      <View
        className="items-center justify-center rounded-2xl bg-warning/15"
        style={{ width: scaled(size), height: scaled(size) }}
      >
        <MaterialCommunityIcons name="lightbulb-on-outline" size={scaled(size * 0.52)} color={colors.warning} />
      </View>
    );
  }
  return (
    <View
      className="items-center justify-center rounded-2xl bg-calm-soft"
      style={{ width: scaled(size), height: scaled(size) }}
    >
      <MaterialCommunityIcons
        name={cornell ? 'page-layout-sidebar-left' : 'note-text-outline'}
        size={scaled(size * 0.52)}
        color={colors.calm}
      />
    </View>
  );
}

/**
 * What's inside one folder (or the top level, when folderId is null): its folders,
 * then its notes, with buttons to add either. Used by the Notes tab and the folder screen.
 */
export function FolderBrowser({
  folderId,
  header,
  emptyText,
  onChange,
}: {
  folderId: string | null;
  header?: ReactNode;
  emptyText: string;
  /** Called after a folder is added, renamed, starred or deleted (so a header can refresh). */
  onChange?: () => void;
}) {
  const colors = useColors();
  const db = useSQLiteContext();
  const [folders, setFolders] = useState<FolderWithCounts[] | null>(null); // null = loading
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Map<string, Tag[]>>(new Map());
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [menuFor, setMenuFor] = useState<FolderWithCounts | null>(null);
  // Select mode: tick several folders and notes, then move, star or delete them together.
  const [selecting, setSelecting] = useState(false);
  const [pickedFolders, setPickedFolders] = useState<Set<string>>(new Set());
  const [pickedNotes, setPickedNotes] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);

  const refresh = useCallback(async () => {
    const [f, n] = await Promise.all([listFolders(db, folderId), listNotes(db, folderId)]);
    const t = await listTagsForNotes(db, n.map((note) => note.id));
    setFolders(f);
    setNotes(n);
    setTags(t);
  }, [db, folderId]);

  const changed = useCallback(async () => {
    await refresh();
    onChange?.();
  }, [refresh, onChange]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function startSelecting(first?: { folderId?: string; noteId?: string }) {
    setPickedFolders(new Set(first?.folderId ? [first.folderId] : []));
    setPickedNotes(new Set(first?.noteId ? [first.noteId] : []));
    setSelecting(true);
  }

  const stopSelecting = useCallback(() => {
    setSelecting(false);
    setPickedFolders(new Set());
    setPickedNotes(new Set());
  }, []);

  // Android's back button leaves select mode before it leaves the screen.
  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      stopSelecting();
      return true;
    });
    return () => sub.remove();
  }, [selecting, stopSelecting]);

  async function deletePicked() {
    const folderList = (folders ?? []).filter((f) => pickedFolders.has(f.id));
    let insideFolders = 0;
    let insideNotes = 0;
    for (const folder of folderList) {
      const inside = await countFolderContents(db, folder.id);
      insideFolders += inside.folders;
      insideNotes += inside.notes;
    }
    const inside = listWhat(insideFolders, insideNotes);
    const ok = await confirm(
      'Delete selected?',
      `${listWhat(folderList.length, pickedNotes.size)} will be deleted` +
        (inside ? `, with everything inside (${inside}).` : '.'),
    );
    if (!ok) return;
    for (const folder of folderList) await deleteFolder(db, folder.id);
    for (const id of pickedNotes) await deleteNote(db, id);
    stopSelecting();
    await changed();
  }

  async function favoritePicked(favorite: boolean) {
    for (const id of pickedFolders) await setFolderFavorite(db, id, favorite);
    for (const id of pickedNotes) await setNoteFavorite(db, id, favorite);
    stopSelecting();
    await changed();
  }

  async function movePicked(target: string | null) {
    setMoving(false);
    try {
      await moveFolders(db, [...pickedFolders], target);
    } catch (error) {
      if (error instanceof FolderNameTakenError) {
        tell('Name already used', `${error.message} Rename one of them first.`);
        return;
      }
      if (error instanceof FolderMoveError) {
        tell("Can't move there", error.message);
        return;
      }
      throw error;
    }
    await moveNotes(db, [...pickedNotes], target);
    stopSelecting();
    await changed();
  }

  async function handleSave(values: Record<string, string>) {
    try {
      if (form.mode === 'create') await createFolder(db, { parentId: folderId, name: values.name });
      else if (form.mode === 'rename') await renameFolder(db, form.folder.id, values.name);
    } catch (error) {
      // Keep the form open so the name can be changed.
      if (!(error instanceof FolderNameTakenError)) throw error;
      tell('Name already used', error.message);
      return;
    }
    setForm({ mode: 'closed' });
    await changed();
  }

  async function handleDelete(folder: FolderWithCounts) {
    const inside = await countFolderContents(db, folder.id);
    const what = [
      inside.folders > 0 ? plural(inside.folders, 'folder') : null,
      inside.notes > 0 ? plural(inside.notes, 'note') : null,
    ].filter(Boolean);
    const ok = await confirm(
      'Delete folder?',
      what.length > 0
        ? `"${folder.name}" and everything in it (${what.join(' and ')}) will be deleted.`
        : `"${folder.name}" will be deleted.`,
    );
    if (!ok) return;
    await deleteFolder(db, folder.id);
    await changed();
  }

  async function toggleFavorite(folder: FolderWithCounts) {
    await setFolderFavorite(db, folder.id, folder.favoritedAt === null);
    await changed();
  }

  /** Makes the folder's empty "Good to know" note and opens it; an AI app fills it in later. */
  async function openNewGoodToKnow() {
    const id = await createNote(db, folderId, { title: GOOD_TO_KNOW_TITLE, style: 'plain' });
    await refresh();
    router.push({ pathname: '/note/[id]', params: { id } });
  }

  function newNote() {
    router.push({ pathname: '/note-editor', params: folderId ? { folderId } : {} });
  }

  // The folder's "Good to know" note gets its own card at the end, not a row with the others.
  const goodToKnow = notes.find(isGoodToKnow) ?? null;
  const topicNotes = notes.filter((note) => !isGoodToKnow(note));
  const loading = folders === null;
  const empty = !loading && folders.length === 0 && notes.length === 0;
  const selectable = (folders?.length ?? 0) + topicNotes.length; // Good to know stays with its folder
  const pickedCount = pickedFolders.size + pickedNotes.size;
  const allPicked = pickedCount > 0 && pickedCount === selectable;
  const pickedAreFavorites =
    pickedCount > 0 &&
    (folders ?? []).every((f) => !pickedFolders.has(f.id) || f.favoritedAt !== null) &&
    topicNotes.every((n) => !pickedNotes.has(n.id) || n.favoritedAt !== null);

  function selectAllOrNone() {
    setPickedFolders(new Set(allPicked ? [] : (folders ?? []).map((f) => f.id)));
    setPickedNotes(new Set(allPicked ? [] : topicNotes.map((n) => n.id)));
  }

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="w-full max-w-3xl self-center gap-3 px-5 pb-10 pt-4">
        {header}

        {selecting ? (
          <View className="flex-row items-center gap-2 rounded-2xl bg-primary-soft px-2 py-1.5">
            <Pressable
              onPress={stopSelecting}
              accessibilityRole="button"
              accessibilityLabel="Stop selecting"
              className="h-11 w-11 items-center justify-center rounded-full active:bg-card"
            >
              <Icon name="close" size={24} color={colors.ink} />
            </Pressable>
            <Text className="flex-1 text-base font-bold text-ink">
              {pickedCount === 0 ? 'Tap to select' : `${pickedCount} selected`}
            </Text>
            <Pressable onPress={selectAllOrNone} accessibilityRole="button" className="rounded-full px-3 py-2 active:bg-card">
              <Text className="text-base font-semibold text-primary">{allPicked ? 'Select none' : 'Select all'}</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setForm({ mode: 'create' })}
              accessibilityRole="button"
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-line bg-card py-3.5 active:bg-surface"
            >
              <Icon name="folder-open-outline" size={22} color={colors.primary} />
              <Text className="text-base font-semibold text-ink">New folder</Text>
            </Pressable>
            <Pressable
              onPress={newNote}
              accessibilityRole="button"
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cta py-3.5 active:bg-cta-dark"
            >
              <Icon name="create-outline" size={22} color={colors.white} />
              <Text className="text-base font-semibold text-white">New note</Text>
            </Pressable>
            {selectable > 0 ? (
              <Pressable
                onPress={() => startSelecting()}
                accessibilityRole="button"
                accessibilityLabel="Select"
                className="flex-row items-center justify-center gap-1.5 rounded-2xl border border-line bg-card px-4 py-3.5 active:bg-surface"
              >
                <Icon name="checkmark-circle-outline" size={22} color={colors.primary} />
                <Text className="text-base font-semibold text-ink">Select</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {empty ? <EmptyState icon="folder-open-outline" title="Nothing here yet" text={emptyText} /> : null}

        {folders && folders.length > 0 ? (
          <View className="gap-2">
            <SectionTitle title="Folders" count={folders.length} />
            {folders.map((folder) => {
              const picked = pickedFolders.has(folder.id);
              // The menu button sits beside the row's button, not inside it: on the web
              // a button inside a button is invalid HTML.
              return (
                <View
                  key={folder.id}
                  className={`flex-row items-center rounded-2xl border ${
                    picked ? 'border-primary bg-primary-soft' : 'border-transparent bg-surface'
                  }`}
                >
                  <Pressable
                    onPress={() =>
                      selecting
                        ? setPickedFolders((set) => toggled(set, folder.id))
                        : router.push({ pathname: '/folder/[id]', params: { id: folder.id } })
                    }
                    onLongPress={selecting ? undefined : () => startSelecting({ folderId: folder.id })}
                    accessibilityRole={selecting ? 'checkbox' : 'button'}
                    accessibilityState={selecting ? { checked: picked } : undefined}
                    accessibilityLabel={`${folder.name}, ${folderSummary(folder)}`}
                    className={`flex-1 flex-row items-center gap-3 rounded-2xl p-3 pl-4 ${
                      picked ? '' : 'active:bg-line'
                    }`}
                  >
                    <FolderBadge name={folder.name} />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="flex-shrink text-base font-bold text-ink" numberOfLines={1}>
                          {folder.name}
                        </Text>
                        {folder.favoritedAt ? <FavoriteStar /> : null}
                      </View>
                      <Text className="text-sm text-muted">{folderSummary(folder)}</Text>
                    </View>
                    {selecting ? <Tick picked={picked} /> : null}
                  </Pressable>
                  {selecting ? null : (
                    <Pressable
                      onPress={() => setMenuFor(folder)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`More options for ${folder.name}`}
                      className="mr-3 h-11 w-11 items-center justify-center rounded-full active:bg-card"
                    >
                      <Icon name="ellipsis-vertical" size={22} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {topicNotes.length > 0 ? (
          <View className="gap-2">
            <SectionTitle title="Notes" count={topicNotes.length} />
            {topicNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                tags={tags.get(note.id)}
                picked={selecting ? pickedNotes.has(note.id) : undefined}
                onPress={selecting ? () => setPickedNotes((set) => toggled(set, note.id)) : undefined}
                onLongPress={selecting ? undefined : () => startSelecting({ noteId: note.id })}
              />
            ))}
          </View>
        ) : null}

        {!selecting && (topicNotes.length > 0 || goodToKnow) ? (
          <GoodToKnowCard note={goodToKnow} topics={topicNotes.length} onCreate={openNewGoodToKnow} />
        ) : null}
      </ScrollView>

      {selecting ? (
        <View className="w-full max-w-3xl flex-row gap-2 self-center border-t border-line bg-page px-5 py-3">
          <BarButton icon="folder-open-outline" label="Move" disabled={pickedCount === 0} onPress={() => setMoving(true)} />
          <BarButton
            icon={pickedAreFavorites ? 'star' : 'star-outline'}
            label={pickedAreFavorites ? 'Unfavourite' : 'Favourite'}
            disabled={pickedCount === 0}
            onPress={() => favoritePicked(!pickedAreFavorites)}
          />
          <BarButton icon="trash-outline" label="Delete" danger disabled={pickedCount === 0} onPress={deletePicked} />
        </View>
      ) : null}

      <FolderPicker
        visible={moving}
        title={`Move ${listWhat(pickedFolders.size, pickedNotes.size)} to`}
        currentFolderId={folderId}
        movingFolderIds={[...pickedFolders]}
        onPick={movePicked}
        onClose={() => setMoving(false)}
      />

      <FormModal
        visible={form.mode !== 'closed'}
        title={form.mode === 'rename' ? 'Rename folder' : 'New folder'}
        fields={FOLDER_FIELDS}
        initialValues={form.mode === 'rename' ? { name: form.folder.name } : {}}
        onCancel={() => setForm({ mode: 'closed' })}
        onSave={handleSave}
      />

      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.name ?? ''}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                menuFor.favoritedAt
                  ? { icon: 'star', label: 'Remove from favourites', onPress: () => toggleFavorite(menuFor) }
                  : { icon: 'star-outline', label: 'Add to favourites', onPress: () => toggleFavorite(menuFor) },
                { icon: 'pencil-outline', label: 'Rename', onPress: () => setForm({ mode: 'rename', folder: menuFor }) },
                { icon: 'trash-outline', label: 'Delete', tone: 'danger', onPress: () => handleDelete(menuFor) },
              ]
            : []
        }
      />
    </View>
  );
}

/** The tick circle on a row in select mode. */
function Tick({ picked }: { picked: boolean }) {
  const colors = useColors();
  return (
    <View className="h-11 w-11 items-center justify-center">
      <Icon name={picked ? 'checkmark-circle' : 'ellipse-outline'} size={30} color={picked ? colors.primary : colors.faint} />
    </View>
  );
}

/** A button in the bar at the bottom of select mode. */
function BarButton({
  icon,
  label,
  onPress,
  disabled,
  danger = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  const colors = useColors();
  const color = disabled ? colors.faint : danger ? colors.alert : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="flex-1 items-center gap-1 rounded-2xl bg-surface py-2.5 active:bg-line"
    >
      <Icon name={icon} size={24} color={color} />
      <Text className="text-sm font-semibold" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View className="mt-2 flex-row items-center gap-2 px-1">
      <Text className="text-lg font-extrabold text-ink">{title}</Text>
      <View className="rounded-full bg-primary-soft px-2.5 py-0.5">
        <Text className="text-xs font-bold text-primary">{count}</Text>
      </View>
    </View>
  );
}

/**
 * The folder's key-points page, at the end of its notes. Before an AI app has made
 * it, the card says how to get one, so students know it's there.
 */
function GoodToKnowCard({ note, topics, onCreate }: { note: Note | null; topics: number; onCreate: () => void }) {
  const colors = useColors();
  const sections = note ? (note.body.match(/^## /gm) ?? []).length : 0;
  const content = (
    <>
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-warning/20">
        <MaterialCommunityIcons name="lightbulb-on-outline" size={scaled(26)} color={colors.warning} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-extrabold text-ink">Good to know</Text>
        <Text className="text-sm text-muted">
          {note
            ? sections > 0
              ? `Key points from ${plural(sections, 'note')} in one place`
              : notePreview(note) || 'Key points from this folder'
            : `Key points from ${topics === 1 ? 'this note' : `these ${topics} notes`} will collect here. ` +
              'Ask your AI app: "Add good to know for these notes".'}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </>
  );

  if (!note) {
    return (
      <Pressable
        onPress={onCreate}
        accessibilityRole="button"
        accessibilityLabel="Good to know, not made yet"
        className="mt-2 flex-row items-center gap-3 rounded-2xl border border-dashed border-warning/60 bg-warning/5 p-3 pl-4 active:bg-warning/15"
      >
        {content}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
      accessibilityRole="button"
      accessibilityLabel="Good to know: key points from this folder"
      className="mt-2 flex-row items-center gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-3 pl-4 active:bg-warning/20"
    >
      {content}
    </Pressable>
  );
}

/** A note in a list: its title and the first words of its text. */
export function NoteRow({
  note,
  subtitle,
  tags = [],
  picked,
  onPress,
  onLongPress,
}: {
  note: Note;
  subtitle?: string;
  tags?: Tag[];
  /** In select mode, whether it's ticked (undefined = not selecting). */
  picked?: boolean;
  /** Used instead of opening the note. */
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const colors = useColors();
  const cornell = note.style === 'cornell';
  const preview = subtitle ?? notePreview(note);
  const selecting = picked !== undefined;
  return (
    <Pressable
      onPress={onPress ?? (() => router.push({ pathname: '/note/[id]', params: { id: note.id } }))}
      onLongPress={onLongPress}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: picked } : undefined}
      className={`flex-row items-center gap-3 rounded-2xl border p-3 pl-4 ${
        picked ? 'border-primary bg-primary-soft' : 'border-line bg-card active:bg-surface'
      }`}
    >
      <NoteBadge cornell={cornell} goodToKnow={isGoodToKnow(note)} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="flex-shrink text-base font-bold text-ink" numberOfLines={1}>
            {note.title}
          </Text>
          {cornell ? (
            <View className="rounded-full bg-calm-soft px-2 py-0.5">
              <Text className="text-xs font-bold text-calm">Cornell</Text>
            </View>
          ) : null}
          {note.createdBy ? <AiBadge by={note.createdBy} /> : null}
          {note.favoritedAt ? <FavoriteStar /> : null}
        </View>
        {preview ? (
          <Text className="text-sm text-muted" numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
        <TagRow tags={tags} />
      </View>
      {picked !== undefined ? <Tick picked={picked} /> : <Icon name="chevron-forward" size={18} color={colors.muted} />}
    </Pressable>
  );
}

/** "Class 10 › Physics › Chapter 1", for showing where a folder or note is. */
export function FolderPath({ path, prefix }: { path: { id: string; name: string }[]; prefix?: string }) {
  const colors = useColors();
  if (path.length === 0 && !prefix) return null;
  const names = path.map((p) => p.name);
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name="folder-outline" size={16} color={colors.muted} />
      <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
        {[prefix, ...names].filter(Boolean).join(' › ')}
      </Text>
    </View>
  );
}

/** Marks a note an AI app wrote (through MCP), e.g. "AI · Claude". */
export function AiBadge({ by }: { by: string }) {
  const colors = useColors();
  return (
    <View
      className="flex-row items-center gap-1 rounded-full bg-cta/15 px-2 py-0.5"
      accessibilityLabel={`Written by ${by}`}
    >
      <Icon name="sparkles" size={13} color={colors.cta} />
      <Text className="text-xs font-bold text-cta-dark">AI · {by}</Text>
    </View>
  );
}

/** The small star next to a favourite's name. */
export function FavoriteStar() {
  const colors = useColors();
  return (
    <View accessibilityLabel="Favourite">
      <Icon name="star" size={16} color={colors.warning} />
    </View>
  );
}
