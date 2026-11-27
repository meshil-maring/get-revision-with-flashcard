import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, Icon, scaled } from '@/components/ui';
import { compareNames, listAllFolders, pathFromFolders } from '@/data/folders';

type Place = { id: string | null; label: string; depth: number };

/**
 * Pick the folder to move things into. Leaves out the folder they're in now, and the
 * folders being moved along with every folder inside them (a folder can't go inside itself).
 */
export function FolderPicker({
  visible,
  title,
  currentFolderId,
  movingFolderIds,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  currentFolderId: string | null;
  movingFolderIds: string[];
  onPick: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [places, setPlaces] = useState<Place[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    listAllFolders(db).then((all) => {
      const byId = new Map(all.map((f) => [f.id, f]));
      const moving = new Set(movingFolderIds);
      const list = all
        .map((f) => ({ folder: f, path: pathFromFolders(byId, f.id) }))
        .filter(({ folder, path }) => folder.id !== currentFolderId && !path.some((p) => moving.has(p.id)))
        .sort((a, b) => {
          // Parents before their children, and names in order at each level.
          const n = Math.min(a.path.length, b.path.length);
          for (let i = 0; i < n; i++) {
            const c = compareNames(a.path[i].name, b.path[i].name);
            if (c !== 0) return c;
          }
          return a.path.length - b.path.length;
        })
        .map(({ folder, path }) => ({
          id: folder.id,
          label: path.map((p) => p.name).join(' › '),
          depth: path.length - 1,
        }));
      const top: Place[] = currentFolderId === null ? [] : [{ id: null, label: 'Notes (top level)', depth: 0 }];
      if (live) setPlaces([...top, ...list]);
    });
    return () => {
      live = false;
    };
  }, [db, visible, currentFolderId, movingFolderIds]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close" />
      <View
        className="max-h-[75%] rounded-t-3xl bg-page px-5 pt-3"
        style={{ paddingBottom: insets.bottom + scaled(16) }}
      >
        <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-line" />
        <Text className="mb-3 text-xl font-bold text-ink" numberOfLines={1}>
          {title}
        </Text>
        <ScrollView contentContainerClassName="gap-2 pb-2">
          {places && places.length === 0 ? (
            <Text className="py-6 text-center text-base text-muted">
              {"There's no other folder to move to. Make a new folder first."}
            </Text>
          ) : null}
          {places?.map((place) => (
            <Pressable
              key={place.id ?? 'top'}
              onPress={() => onPick(place.id)}
              accessibilityRole="button"
              accessibilityLabel={`Move to ${place.label}`}
              className="flex-row items-center gap-3 rounded-2xl bg-surface p-4 active:bg-line"
            >
              <Icon name={place.id === null ? 'home-outline' : 'folder-outline'} size={24} color={colors.primary} />
              <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={2}>
                {place.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
