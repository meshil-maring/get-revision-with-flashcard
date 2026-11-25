import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';

import { NoteRow } from '@/components/notes/folder-browser';
import { TagFormModal } from '@/components/tags/tag-form';
import { EmptyState, Icon, IconButton, plural } from '@/components/ui';
import { listNotesWithTag } from '@/data/notes';
import { deleteTag, getTag, listTagsForNotes, TagNameTakenError, updateTag } from '@/data/tags';
import type { NoteWithPath, Tag } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { tagColor } from '@/lib/tags';

/** Every note with one tag, from any folder. The tag can be renamed, recoloured or deleted here. */
export default function TagScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [tag, setTag] = useState<Tag | null | undefined>(undefined); // undefined = loading
  const [notes, setNotes] = useState<NoteWithPath[]>([]);
  const [noteTags, setNoteTags] = useState<Map<string, Tag[]>>(new Map());
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [t, n] = await Promise.all([getTag(db, id), listNotesWithTag(db, id)]);
    setTag(t);
    setNotes(n);
    setNoteTags(await listTagsForNotes(db, n.map((note) => note.id)));
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (tag === undefined) return <Stack.Screen options={{ title: '' }} />;

  if (tag === null) {
    return (
      <View className="flex-1 justify-center bg-page">
        <Stack.Screen options={{ title: 'Not found' }} />
        <EmptyState icon="alert-circle-outline" title="Tag not found" text="This tag no longer exists." />
      </View>
    );
  }

  const current = tag;
  const color = tagColor(current.color);

  async function handleDelete() {
    const ok = await confirm(
      'Delete tag?',
      `"${current.name}" will be taken off ${plural(notes.length, 'note')}. The notes themselves are kept.`,
    );
    if (!ok) return;
    await deleteTag(db, current.id);
    router.back();
  }

  return (
    <View className="flex-1 bg-page">
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View className="flex-row">
              <IconButton icon="create-outline" label="Edit tag" onPress={() => setEditing(true)} />
              <IconButton icon="trash-outline" label="Delete tag" tone="danger" onPress={handleDelete} />
            </View>
          ),
        }}
      />

      <ScrollView contentContainerClassName="w-full max-w-3xl self-center gap-3 px-5 pb-10 pt-2">
        <View className="mb-2 flex-row items-center gap-3">
          <View className="h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}1f` }}>
            <Icon name="pricetag" size={28} color={color} />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold uppercase tracking-widest" style={{ color }}>
              Tag
            </Text>
            <Text className="text-2xl font-extrabold text-ink" numberOfLines={2}>
              {current.name}
            </Text>
            <Text className="text-sm text-muted">{plural(notes.length, 'note')}</Text>
          </View>
        </View>

        {notes.length === 0 ? (
          <EmptyState
            icon="pricetags-outline"
            title="No notes with this tag"
            text="Open a note, tap Edit, and choose this tag under Tags."
          />
        ) : null}

        {notes.map((note) => (
          <View key={note.id} className="gap-1">
            <Text className="px-1 text-xs font-semibold text-muted" numberOfLines={1}>
              {['Notes', ...note.path.map((p) => p.name)].join(' › ')}
            </Text>
            <NoteRow note={note} tags={noteTags.get(note.id)} />
          </View>
        ))}
      </ScrollView>

      <TagFormModal
        visible={editing}
        title="Edit tag"
        initial={{ name: current.name, color: current.color }}
        onCancel={() => setEditing(false)}
        onSave={async (values) => {
          try {
            await updateTag(db, current.id, values);
          } catch (error) {
            if (!(error instanceof TagNameTakenError)) throw error;
            if (Platform.OS === 'web') window.alert(`Name already used\n\n${error.message}`);
            else Alert.alert('Name already used', error.message);
            return;
          }
          setEditing(false);
          await load();
        }}
      />
    </View>
  );
}
