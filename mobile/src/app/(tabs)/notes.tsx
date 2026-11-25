import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FolderBadge, FolderBrowser, NoteRow } from '@/components/folder-browser';
import { ScreenTip } from '@/components/screen-tip';
import { colors, EmptyState, Icon } from '@/components/ui';
import { noteText, searchNotes } from '@/data/notes';
import type { FolderSearchResult, NoteSearchResult } from '@/data/types';
import { snippet } from '@/lib/notes';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

type Results = { folders: FolderSearchResult[]; notes: NoteSearchResult[] };

/** The Notes tab: top-level folders and notes, and search across every note. */
export default function NotesScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;

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
          header={<ScreenTip id="notes" />}
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
    setResults(await searchNotes(db, query));
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

  const none = results !== null && results.folders.length === 0 && results.notes.length === 0;

  return (
    <ScrollView
      contentContainerClassName="w-full max-w-3xl self-center gap-3 px-5 pb-10 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      {none ? <EmptyState icon="search-outline" title="No matches" text={`Nothing in your notes matches "${query.trim()}".`} /> : null}

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
              {['Notes', ...folder.path.map((p) => p.name)].join(' › ')}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}

      {results?.notes.map((note) => (
        <View key={note.id} className="gap-1">
          <Text className="px-1 text-xs font-semibold text-muted" numberOfLines={1}>
            {['Notes', ...note.path.map((p) => p.name)].join(' › ')}
          </Text>
          <NoteRow note={note} subtitle={snippet(noteText({ ...note, title: '' }), query)} />
        </View>
      ))}
    </ScrollView>
  );
}
