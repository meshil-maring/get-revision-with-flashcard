import { Image } from 'expo-image';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Icon, useColors } from '@/components/ui';
import { ImageViewer } from '@/components/ui/image-viewer';
import { NoteImageProvider } from '@/components/ui/rich-text';
import type { Note, NoteAttachment } from '@/data/types';
import { imageRefs } from '@/lib/rich-text';

/** How this device's account sync is doing, for an image's loading and upload states. */
export type ImageSyncState = {
  signedIn: boolean;
  syncing: boolean;
  /** The last sync's error, e.g. an upload that failed. */
  error: string | null;
  onSyncNow?: () => void;
};

/**
 * The image a ":::image <id>" line names: by the attachment's own id, or by the stored file's
 * id (what AI apps get from upload_image), which is the last part of its remote key.
 */
export function findNoteImage(images: NoteAttachment[], ref: string): NoteAttachment | undefined {
  return images.find((i) => i.kind === 'image' && (i.id === ref || i.remoteKey?.endsWith(`/${ref}`)));
}

/** The note's images that its text shows in place (":::image" lines in the body, rows or summary). */
export function placedImageIds(note: Note, images: NoteAttachment[]): Set<string> {
  const text = note.style === 'cornell' ? [...note.rows.map((r) => r.notes), note.summary].join('\n') : note.body;
  const ids = new Set<string>();
  for (const ref of imageRefs(text)) {
    const image = findNoteImage(images, ref);
    if (image) ids.add(image.id);
  }
  return ids;
}

type ImagesContext = { sync: ImageSyncState; open: (id: string) => void };
const Images = createContext<ImagesContext | null>(null);

/**
 * Lets everything inside show the note's images: in place, where the text has an
 * ":::image <id>" line (e.g. inside a Cornell row), and in <NoteImages>. Tapping any of them
 * opens the full-screen viewer, which steps through all the note's images in order.
 */
export function NoteImagesProvider({
  images,
  sync,
  children,
}: {
  images: NoteAttachment[];
  sync: ImageSyncState;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const viewable = images.filter((i) => i.kind === 'image' && i.uri !== '');
  const openImage = (id: string) => {
    const index = viewable.findIndex((v) => v.id === id);
    if (index !== -1) setOpen(index);
  };
  const render = (ref: string) => {
    const image = findNoteImage(images, ref);
    return image ? <Figure image={image} sync={sync} onOpen={() => openImage(image.id)} /> : null;
  };

  return (
    <Images.Provider value={{ sync, open: openImage }}>
      <NoteImageProvider render={render}>{children}</NoteImageProvider>
      <ImageViewer
        images={viewable.map((v) => ({ key: v.id, uri: v.uri, name: v.name, caption: v.caption, altText: v.altText }))}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
      />
    </Images.Provider>
  );
}

/**
 * Images one under another at full width with their captions, like figures in a book (for the
 * ones the note's text doesn't place). Tap one to see it full screen and zoom. Images still
 * downloading from the account (e.g. just added by an AI app) show as loading until the next
 * sync brings them. Needs <NoteImagesProvider> around it.
 */
export function NoteImages({ images }: { images: NoteAttachment[] }) {
  const context = useContext(Images);
  if (images.length === 0 || !context) return null;
  return (
    <View className="gap-5">
      {images.map((image) => (
        <Figure key={image.id} image={image} sync={context.sync} onOpen={() => context.open(image.id)} />
      ))}
    </View>
  );
}

function Figure({ image, sync, onOpen }: { image: NoteAttachment; sync: ImageSyncState; onOpen: () => void }) {
  const colors = useColors();
  const [ratio, setRatio] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  const description = image.altText || image.caption || image.name || 'Image';

  return (
    <View className="gap-2" testID="note-image">
      {image.uri === '' ? (
        <Downloading sync={sync} name={image.name} />
      ) : failed ? (
        <View className="items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-8" accessibilityRole="alert">
          <Icon name="image-outline" size={28} color={colors.muted} />
          <Text className="text-center text-sm text-muted">Could not show this image{image.name ? ` (${image.name})` : ''}.</Text>
        </View>
      ) : (
        <Pressable onPress={onOpen} accessibilityRole="imagebutton" accessibilityLabel={`${description}. Open full screen`}>
          <Image
            source={{ uri: image.uri }}
            contentFit="contain"
            onLoad={(e) => {
              const { width, height } = e.source ?? {};
              if (width && height) setRatio(width / height);
            }}
            onError={() => setFailed(true)}
            accessibilityLabel={description}
            style={{ width: '100%', aspectRatio: ratio, maxHeight: 560, borderRadius: 16, backgroundColor: colors.surface }}
          />
        </Pressable>
      )}
      {image.caption ? <Text className="px-1 text-center text-sm italic text-muted">{image.caption}</Text> : null}
      {sync.signedIn && image.remoteKey === null ? <NotUploaded error={sync.error} /> : null}
    </View>
  );
}

function Downloading({ sync, name }: { sync: ImageSyncState; name: string }) {
  const colors = useColors();
  return (
    <View
      className="items-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-4 py-8"
      accessibilityLabel={`${name || 'Image'} is downloading`}
    >
      {sync.syncing ? <ActivityIndicator color={colors.primary} /> : <Icon name="cloud-download-outline" size={28} color={colors.muted} />}
      <Text className="text-center text-sm text-muted">
        {sync.syncing ? 'Downloading image…' : sync.error ? 'Could not download this image yet.' : 'This image appears after the next sync.'}
      </Text>
      {!sync.syncing && sync.onSyncNow ? (
        <Pressable
          onPress={sync.onSyncNow}
          accessibilityRole="button"
          className="rounded-full bg-primary-soft px-4 py-2 active:bg-primary/20"
        >
          <Text className="text-sm font-semibold text-primary">{sync.error ? 'Try again' : 'Sync now'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A picture only on this device: it uploads with the next sync (or failed to). */
function NotUploaded({ error }: { error: string | null }) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-1.5 px-1">
      <Icon name={error ? 'alert-circle-outline' : 'cloud-upload-outline'} size={14} color={error ? colors.alert : colors.muted} />
      <Text className={`flex-1 text-xs ${error ? 'text-alert' : 'text-muted'}`} numberOfLines={2}>
        {error ? `Not uploaded yet: ${error}` : 'Only on this device: uploads with the next sync.'}
      </Text>
    </View>
  );
}
