import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FavoriteStar, FolderBadge, FolderBrowser, folderSummary, NoteRow } from '@/components/folder-browser';
import { ScreenTip } from '@/components/screen-tip';
import { TagChip } from '@/components/tag-chip';
import { colors, EmptyState, Icon } from '@/components/ui';
import { listFavorites, noteText, searchNotes } from '@/data/notes';
import { listTags, listTagsForNotes, searchTags } from '@/data/tags';
import type {
  FavoriteFolder,
  FolderCrumb,
  FolderSearchResult,
  NoteSearchResult,
  NoteWithPath,
  Tag,
  TagWithCount,
} from '@/data/types';
import { snippet } from '@/lib/notes';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

type Results = {
  folders: FolderSearchResult[];
  notes: NoteSearchResult[];
  tags: TagWithCount[];
  noteTags: Map<string, Tag[]>;
};

/** "Notes › Class 10 › Physics" */
function placeText(path: FolderCrumb[]) {
  return ['Notes', ...path.map((p) => p.name)].join(' › ');
}

/** The Notes tab: top-level folders and notes, and search across every note. */
export default function NotesScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  // Bumped when folders change below, so Favourites at the top reloads too.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const searchBox = (
    <View className="flex-row items-center gap-2 rounded-2xl bg-surface px-4">
      <Icon name="search" size={22} color={colors.muted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search notes"
        placeholderTextColor={colors.faint}
        accessibilityLabel="Search notes"
        returnKeyType="search"
        style={NO_WEB_FOCUS_RING}
        className="flex-1 py-3.5 text-base text-ink"
      />
      {searching ? (
        <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="close-circle" size={22} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );

  // The title and search box stay put; only the list under them changes while searching
  // (so the search box keeps the keyboard).
  return (
    <View className="flex-1 bg-page" style={{ paddingTop: insets.top }}>
      <View className="w-full max-w-3xl gap-4 self-center px-5 pt-4">
        <Text className="text-3xl font-extrabold text-ink">Notes</Text>
        {searchBox}
      </View>
      {searching ? (
        <SearchResults query={query} />
      ) : (
        <FolderBrowser
          folderId={null}
          onChange={bump}
          header={
            <View className="gap-3">
              <ScreenTip id="notes" />
              {/* A new key (after a folder changes below) loads it again. */}
              <TagsAndFavorites key={version} />
            </View>
          }
          emptyText="Make a folder for each class, like Class 10. Inside it, add folders for subjects, then chapters, then topics."
        />
      )}
    </View>
  );
}

function SearchResults({ query }: { query: string }) {
  const db = useSQLiteContext();
  const [results, setResults] = useState<Results | null>(null);

  const run = useCallback(async () => {
    const [found, tags] = await Promise.all([searchNotes(db, query), searchTags(db, query)]);
    const noteTags = await listTagsForNotes(db, found.notes.map((n) => n.id));
    setResults({ ...found, tags, noteTags });
  }, [db, query]);

  // Search a moment after typing stops, and again when coming back to the tab.
  useEffect(() => {
    const timer = setTimeout(run, 150);
    return () => clearTimeout(timer);
  }, [run]);
  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  const none =
    results !== null && results.folders.length === 0 && results.notes.length === 0 && results.tags.length === 0;

  return (
    <ScrollView
      contentContainerClassName="w-full max-w-3xl self-center gap-3 px-5 pb-10 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      {none ? <EmptyState icon="search-outline" title="No matches" text={`Nothing in your notes matches "${query.trim()}".`} /> : null}

      {results && results.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {results.tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              size="md"
              count={tag.noteCount}
              onPress={() => router.push({ pathname: '/tag/[id]', params: { id: tag.id } })}
            />
          ))}
        </View>
      ) : null}

      {results?.folders.map((folder) => (
        <Pressable
          key={folder.id}
          onPress={() => router.push({ pathname: '/folder/[id]', params: { id: folder.id } })}
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-2xl bg-surface p-3 pl-4 active:bg-line"
        >
          <FolderBadge name={folder.name} />
          <View className="flex-1">
            <Text className="text-base font-bold text-ink" numberOfLines={1}>
              {folder.name}
            </Text>
            <Text className="text-sm text-muted" numberOfLines={1}>
              {placeText(folder.path)}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}

      {results?.notes.map((note) => (
        <View key={note.id} className="gap-1">
          <Text className="px-1 text-xs font-semibold text-muted" numberOfLines={1}>
            {placeText(note.path)}
          </Text>
          <NoteRow
            note={note}
            subtitle={snippet(noteText({ ...note, title: '' }), query)}
            tags={results.noteTags.get(note.id)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

/** The top of the Notes tab: every tag (tap one to see its notes), then starred folders and notes. */
function TagsAndFavorites() {
  const db = useSQLiteContext();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [notes, setNotes] = useState<NoteWithPath[]>([]);
  const [noteTags, setNoteTags] = useState<Map<string, Tag[]>>(new Map());

  const load = useCallback(async () => {
    const [t, favorites] = await Promise.all([listTags(db), listFavorites(db)]);
    setTags(t);
    setFolders(favorites.folders);
    setNotes(favorites.notes);
    setNoteTags(await listTagsForNotes(db, favorites.notes.map((n) => n.id)));
  }, [db]);

  // Reload whenever the screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const hasFavorites = folders.length + notes.length > 0;
  if (tags.length === 0 && !hasFavorites) return null;

  return (
    <View className="gap-3">
      {tags.length > 0 ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-1.5 px-1">
            <Icon name="pricetags-outline" size={18} color={colors.ink} />
            <Text className="text-lg font-extrabold text-ink">Tags</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-1">
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                size="md"
                count={tag.noteCount}
                onPress={() => router.push({ pathname: '/tag/[id]', params: { id: tag.id } })}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {hasFavorites ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-1.5 px-1">
            <Icon name="star" size={18} color={colors.warning} />
            <Text className="text-lg font-extrabold text-ink">Favourites</Text>
          </View>
          {folders.map((folder) => (
            <Pressable
              key={folder.id}
              onPress={() => router.push({ pathname: '/folder/[id]', params: { id: folder.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Favourite folder ${folder.name}`}
              className="flex-row items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 pl-4 active:bg-warning/20"
            >
              <FolderBadge name={folder.name} size={40} />
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="flex-shrink text-base font-bold text-ink" numberOfLines={1}>
                    {folder.name}
                  </Text>
                  <FavoriteStar />
                </View>
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {folder.path.length > 0 ? `${placeText(folder.path)} · ` : ''}
                  {folderSummary(folder)}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
          {notes.map((note) => (
            <View key={note.id} className="gap-1">
              {note.path.length > 0 ? (
                <Text className="px-1 text-xs font-semibold text-muted" numberOfLines={1}>
                  {placeText(note.path)}
                </Text>
              ) : null}
              <NoteRow note={note} tags={noteTags.get(note.id)} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
