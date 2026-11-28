// What the textbook reader is given. It crosses into a web view on Android, so everything is
// plain data (functions only at the top level, and they can't return anything synchronously).
import type { ColumnWidth, TextbookTheme } from '@/components/textbook/textbook-theme';

/** Reading settings the reader saves through `onPrefsChange`. */
export type TextbookPrefs = {
  /** 0–3: Small, Medium, Large, Extra large. */
  size: number;
  width: ColumnWidth;
  /** 'app' follows the app's light / dark setting. */
  theme: 'app' | TextbookTheme;
};

/** One of the note's images, by every name the text may use for it (attachment id or file id). */
export type TextbookImage = { uri: string; caption: string | null; alt: string | null; name: string };

export type TextbookChapter = {
  id: string;
  title: string;
  body: string;
  /** The folders the note is in, e.g. ["Year 12", "Mathematics"]. */
  path: string[];
  tags: { id: string; name: string; color: string }[];
  /** The AI app that wrote it, if any. */
  createdBy: string | null;
};

export type TextbookNeighbour = { title: string } | null;

export type TextbookReaderProps = {
  chapter: TextbookChapter;
  /** Images by reference; '' as uri while one is still downloading. */
  images: Record<string, TextbookImage>;
  /** Images the text doesn't place, shown as figures at the end. */
  extraImages: string[];
  appTheme: TextbookTheme;
  prefs: TextbookPrefs;
  bookmarks: string[];
  previous: TextbookNeighbour;
  next: TextbookNeighbour;
  onPrefsChange?: (prefs: TextbookPrefs) => void | Promise<void>;
  onBookmarksChange?: (ids: string[]) => void | Promise<void>;
  onNavigate?: (to: 'previous' | 'next') => void | Promise<void>;
  onOpenImage?: (ref: string) => void | Promise<void>;
  onOpenTag?: (id: string) => void | Promise<void>;
  /** Back to the standard note view. */
  onUseStandard?: () => void | Promise<void>;
  /** Handwriting pages (by key, see lib/textbook.ts pageKey) that have writing on them. */
  writtenPages?: string[];
  /** A heading or question was tapped: open its handwriting page. */
  onOpenPage?: (page: string, title: string) => void | Promise<void>;
  /** Focus mode: one centred column, no side columns (the app hides its own header). */
  focus?: boolean;
  onFocusChange?: (on: boolean) => void | Promise<void>;
};

export const DEFAULT_PREFS: TextbookPrefs = { size: 1, width: 'normal', theme: 'app' };
