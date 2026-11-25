import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { FolderBadge, FolderBrowser, FolderPath } from '@/components/notes/folder-browser';
import { EmptyState } from '@/components/ui';
import { getFolder, getFolderPath } from '@/data/folders';
import type { Folder, FolderCrumb } from '@/data/types';

/** One folder of notes: the folders and notes inside it. Folders can go as deep as you like. */
export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [folder, setFolder] = useState<Folder | null | undefined>(undefined); // undefined = loading
  const [path, setPath] = useState<FolderCrumb[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getFolder(db, id), getFolderPath(db, id)]).then(([f, p]) => {
        setFolder(f);
        setPath(p);
      });
    }, [db, id]),
  );

  if (folder === undefined) return <Stack.Screen options={{ title: '' }} />;

  if (folder === null) {
    return (
      <View className="flex-1 justify-center bg-page">
        <Stack.Screen options={{ title: 'Not found' }} />
        <EmptyState icon="alert-circle-outline" title="Folder not found" text="This folder no longer exists." />
      </View>
    );
  }

  const parents = path.slice(0, -1); // the folders this one is in

  return (
    <View className="flex-1 bg-page">
      <Stack.Screen options={{ title: folder.name }} />
      <FolderBrowser
        folderId={folder.id}
        emptyText="Add folders inside this one (like chapters or topics), or write a note here."
        header={
          <View className="flex-row items-center gap-3">
            <FolderBadge name={folder.name} size={64} />
            <View className="flex-1 gap-0.5">
              <FolderPath path={parents} prefix="Notes" />
              <Text className="text-2xl font-extrabold text-ink" numberOfLines={2}>
                {folder.name}
              </Text>
            </View>
          </View>
        }
      />
    </View>
  );
}
