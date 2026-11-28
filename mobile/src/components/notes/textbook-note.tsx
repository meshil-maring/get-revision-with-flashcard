// A note in the textbook reader (components/textbook): gets what the reader needs (images,
// saved reading settings and bookmarks, the theme) and handles what it asks for (open an
// image or tag, go to the previous or next note, go back to the standard view).
import { File } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useUniwind } from 'uniwind';

import TextbookReader from '@/components/textbook/textbook-reader';
import { COLUMN_WIDTHS, TEXT_SCALES, TEXTBOOK_THEMES, type TextbookTheme } from '@/components/textbook/textbook-theme';
import { DEFAULT_PREFS, type TextbookImage, type TextbookPrefs } from '@/components/textbook/types';
import { useColors } from '@/components/ui';
import { ImageViewer } from '@/components/ui/image-viewer';
import { useReadingSize } from '@/components/ui/rich-text';
import { listWrittenPages } from '@/data/note-pages';
import { getNoteBookmarks, getTextbookPrefs, setNoteBookmarks, setTextbookPrefs } from '@/data/settings';
import type { FolderCrumb, Note, NoteAttachment, Tag } from '@/data/types';
import { bodyWithoutTitle, convertNote } from '@/lib/notes';
import { tagColor } from '@/lib/tags';

/** Images bigger than this aren't copied into the reader on a phone (they show as "can't load"). */
const MAX_INLINE_IMAGE_BYTES = 6 * 1024 * 1024;

/** The saved textbook settings, checked (they come from storage); null if none or unreadable. */
export function readPrefs(saved: unknown): TextbookPrefs | null {
  if (!saved || typeof saved !== 'object') return null;
  const s = saved as Partial<Record<keyof TextbookPrefs, unknown>>;
  const size = typeof s.size === 'number' && Number.isInteger(s.size) && s.size >= 0 && s.size < TEXT_SCALES.length ? s.size : DEFAULT_PREFS.size;
  const width = typeof s.width === 'string' && s.width in COLUMN_WIDTHS ? (s.width as TextbookPrefs['width']) : DEFAULT_PREFS.width;
  const theme = s.theme === 'light' || s.theme === 'dark' || s.theme === 'app' ? s.theme : DEFAULT_PREFS.theme;
  return { size, width, theme };
}

/** The reader's colours: its own choice, or the app's theme. */
const readerTheme = (prefs: TextbookPrefs, app: string | undefined): TextbookTheme =>
  prefs.theme === 'app' ? (app === 'dark' ? 'dark' : 'light') : prefs.theme;

const SIZE_FROM_READING: Record<string, number> = { sm: 0, base: 1, lg: 2, xl: 3 };

/**
 * The note's text as one chapter. Cornell notes become sections: each cue a heading with its
 * notes under it, and the summary last (the same as switching the note to plain).
 */
export function textbookBody(note: Note): string {
  if (note.style !== 'cornell') return bodyWithoutTitle(note.body, note.title);
  return convertNote(note, 'plain').body.replace(/^## Summary\n([\s\S]*)$/m, ':::summary\n$1\n:::');
}

/**
 * The images as the reader can load them. On the web they are already data: URLs. In the
 * Android web view, files in the app's storage can't be loaded by path, so they are read in.
 */
function useReaderImages(images: NoteAttachment[]): Record<string, TextbookImage> | null {
  const [loaded, setLoaded] = useState<Record<string, TextbookImage> | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, TextbookImage> = {};
      for (const image of images) {
        let uri = image.uri;
        if (uri && Platform.OS !== 'web' && !uri.startsWith('data:')) {
          try {
            const file = new File(uri);
            uri = file.size > MAX_INLINE_IMAGE_BYTES ? '' : `data:${image.mimeType ?? 'image/jpeg'};base64,${await file.base64()}`;
          } catch {
            uri = '';
          }
        }
        const entry: TextbookImage = { uri, caption: image.caption, alt: image.altText, name: image.name };
        // ":::image" lines name an image by its attachment id or by its stored file's id.
        out[image.id] = entry;
        const fileId = image.remoteKey?.split('/').pop();
        if (fileId) out[fileId] = entry;
      }
      if (!cancelled) setLoaded(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [images]);
  return loaded;
}

export function TextbookNote({
  note,
  path,
  tags,
  images,
  extraImageIds,
  previous,
  next,
  onNavigate,
  onUseStandard,
  focus,
  onFocusChange,
}: {
  note: Note;
  path: FolderCrumb[];
  tags: Tag[];
  images: NoteAttachment[];
  /** Images the text doesn't place, by attachment id. */
  extraImageIds: string[];
  previous: Note | null;
  next: Note | null;
  onNavigate: (to: 'previous' | 'next') => void;
  onUseStandard: () => void;
  /** Focus mode: just the text, without the app's header or the reader's side columns. */
  focus: boolean;
  onFocusChange: (on: boolean) => void;
}) {
  const db = useSQLiteContext();
  const colors = useColors();
  const { theme } = useUniwind();
  const readingSize = useReadingSize();
  const readerImages = useReaderImages(images);
  const [saved, setSaved] = useState<{ prefs: TextbookPrefs; bookmarks: string[] } | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const viewable = useMemo(() => images.filter((i) => i.uri !== ''), [images]);
  // Headings and questions with handwritten notes, read again on coming back from writing.
  const [writtenPages, setWrittenPages] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listWrittenPages(db, note.id)
        .then((pages) => !cancelled && setWrittenPages(pages))
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [db, note.id]),
  );
  const onOpenPage = useCallback(
    (page: string, title: string) => router.push({ pathname: '/note-page', params: { noteId: note.id, page, title } }),
    [note.id],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTextbookPrefs(db), getNoteBookmarks(db, note.id)])
      .then(([prefs, bookmarks]) => {
        if (cancelled) return;
        setSaved({
          // Until the reader's own size is chosen, it follows Settings → Text size.
          prefs: readPrefs(prefs) ?? { ...DEFAULT_PREFS, size: SIZE_FROM_READING[readingSize] ?? 1 },
          bookmarks,
        });
      })
      .catch(() => !cancelled && setSaved({ prefs: DEFAULT_PREFS, bookmarks: [] }));
    return () => {
      cancelled = true;
    };
  }, [db, note.id, readingSize]);

  const chapter = useMemo(
    () => ({
      id: note.id,
      title: note.title,
      body: textbookBody(note),
      path: path.map((p) => p.name),
      tags: tags.map((t) => ({ id: t.id, name: t.name, color: tagColor(t.color) })),
      createdBy: note.createdBy,
    }),
    [note, path, tags],
  );

  const onPrefsChange = useCallback((prefs: TextbookPrefs) => void setTextbookPrefs(db, prefs), [db]);
  const onBookmarksChange = useCallback((ids: string[]) => void setNoteBookmarks(db, note.id, ids), [db, note.id]);
  const onOpenTag = useCallback((id: string) => router.push({ pathname: '/tag/[id]', params: { id } }), []);
  const onOpenImage = useCallback(
    (ref: string) => {
      const index = viewable.findIndex((i) => i.id === ref || i.remoteKey?.endsWith(`/${ref}`));
      if (index !== -1) setViewing(index);
    },
    [viewable],
  );

  if (!readerImages || !saved) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.page }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1" testID="textbook-note">
      <TextbookReader
        key={note.id}
        chapter={chapter}
        images={readerImages}
        extraImages={extraImageIds}
        appTheme={theme === 'dark' ? 'dark' : 'light'}
        prefs={saved.prefs}
        bookmarks={saved.bookmarks}
        previous={previous ? { title: previous.title } : null}
        next={next ? { title: next.title } : null}
        onPrefsChange={onPrefsChange}
        onBookmarksChange={onBookmarksChange}
        onNavigate={onNavigate}
        onOpenImage={onOpenImage}
        onOpenTag={onOpenTag}
        onUseStandard={onUseStandard}
        writtenPages={writtenPages}
        onOpenPage={onOpenPage}
        focus={focus}
        onFocusChange={onFocusChange}
        dom={{
          // The page scrolls inside the reader (its own scroll box), so the web view itself never does.
          style: { flex: 1, backgroundColor: TEXTBOOK_THEMES[readerTheme(saved.prefs, theme)].page },
          containerStyle: { flex: 1 },
        }}
      />
      <ImageViewer
        images={viewable.map((v) => ({ key: v.id, uri: v.uri, name: v.name, caption: v.caption, altText: v.altText }))}
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />
    </View>
  );
}
