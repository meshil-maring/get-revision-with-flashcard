import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { TagRow } from '@/components/tags/tag-chip';
import { FormModal, type FormField } from '@/components/ui/form-modal';
import { colors, EmptyState, Icon, plural, scaled, subjectIcon } from '@/components/ui';
import {
  countFolderContents,
  createFolder,
  deleteFolder,
  FolderNameTakenError,
  listFolders,
  renameFolder,
  setFolderFavorite,
} from '@/data/folders';
import { listNotes } from '@/data/notes';
import { listTagsForNotes } from '@/data/tags';
import type { FolderWithCounts, Note, Tag } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { notePreview } from '@/lib/notes';

const FOLDER_FIELDS: FormField[] = [
  { key: 'name', label: 'Name', placeholder: 'e.g. Class 10, Physics, Chapter 1 or Motion', required: true },
];

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
export function NoteBadge({ cornell, size = 48 }: { cornell: boolean; size?: number }) {
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
  const db = useSQLiteContext();
  const [folders, setFolders] = useState<FolderWithCounts[] | null>(null); // null = loading
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Map<string, Tag[]>>(new Map());
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [menuFor, setMenuFor] = useState<FolderWithCounts | null>(null);

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

  async function handleSave(values: Record<string, string>) {
    try {
      if (form.mode === 'create') await createFolder(db, { parentId: folderId, name: values.name });
      else if (form.mode === 'rename') await renameFolder(db, form.folder.id, values.name);
    } catch (error) {
      // Keep the form open so the name can be changed.
      if (!(error instanceof FolderNameTakenError)) throw error;
      if (Platform.OS === 'web') window.alert(`Name already used

${error.message}`);
      else Alert.alert('Name already used', error.message);
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

  function newNote() {
    router.push({ pathname: '/note-editor', params: folderId ? { folderId } : {} });
  }

  const loading = folders === null;
  const empty = !loading && folders.length === 0 && notes.length === 0;

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="w-full max-w-3xl self-center gap-3 px-5 pb-10 pt-4">
        {header}

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => setForm({ mode: 'create' })}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-line bg-white py-3.5 active:bg-surface"
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
        </View>

        {empty ? <EmptyState icon="folder-open-outline" title="Nothing here yet" text={emptyText} /> : null}

        {folders && folders.length > 0 ? (
          <View className="gap-2">
            <SectionTitle title="Folders" count={folders.length} />
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                onPress={() => router.push({ pathname: '/folder/[id]', params: { id: folder.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${folder.name}, ${folderSummary(folder)}`}
                className="flex-row items-center gap-3 rounded-2xl bg-surface p-3 pl-4 active:bg-line"
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
                <Pressable
                  onPress={() => setMenuFor(folder)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`More options for ${folder.name}`}
                  className="h-11 w-11 items-center justify-center rounded-full active:bg-white"
                >
                  <Icon name="ellipsis-vertical" size={22} color={colors.muted} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}

        {notes.length > 0 ? (
          <View className="gap-2">
            <SectionTitle title="Notes" count={notes.length} />
            {notes.map((note) => (
              <NoteRow key={note.id} note={note} tags={tags.get(note.id)} />
            ))}
          </View>
        ) : null}
      </ScrollView>

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

/** A note in a list: its title and the first words of its text. */
export function NoteRow({ note, subtitle, tags = [] }: { note: Note; subtitle?: string; tags?: Tag[] }) {
  const cornell = note.style === 'cornell';
  const preview = subtitle ?? notePreview(note);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-2xl border border-line bg-white p-3 pl-4 active:bg-surface"
    >
      <NoteBadge cornell={cornell} />
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
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** "Class 10 › Physics › Chapter 1", for showing where a folder or note is. */
export function FolderPath({ path, prefix }: { path: { id: string; name: string }[]; prefix?: string }) {
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
  return (
    <View accessibilityLabel="Favourite">
      <Icon name="star" size={16} color={colors.warning} />
    </View>
  );
}
