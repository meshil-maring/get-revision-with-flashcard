import type { SQLiteDatabase } from 'expo-sqlite';

/** Keys of the app's small saved settings. */
export const SETTINGS = {
  welcomeSeen: 'welcome_seen',
  lastCustomAutoNext: 'last_custom_auto_next',
  noteFocusSize: 'note_focus_size',
  noteHandwriting: 'note_handwriting',
  theme: 'theme',
  readingSize: 'reading_size',
  lastReadNote: 'last_read_note',
  textbookPrefs: 'textbook_prefs',
  noteViewDefault: 'note_view_default',
  /** Study sounds: the last one picked and its volume, as JSON (lib/focus-sounds.ts). */
  focusSound: 'focus_sound',
  /** Pomodoro timer: the lengths picked, as JSON (lib/pomodoro.ts). */
  pomodoro: 'pomodoro',
  /** Custom pen and highlighter colours picked before, newest first, as JSON. */
  inkColors: 'ink_colors',
} as const;

// Screen tips are saved one key each, e.g. 'tip:study' (see components/ui/screen-tip.tsx).
// Auto-next time per deck is saved as 'autoNext:<deckId>'.
// How a note is read (standard or textbook) and its bookmarked sections: 'noteView:<noteId>',
// 'bookmarks:<noteId>'. These stay on the device.
type SettingKey =
  | (typeof SETTINGS)[keyof typeof SETTINGS]
  | `tip:${string}`
  | `autoNext:${string}`
  | `autoNextPause:${string}`
  | `noteView:${string}`
  | `bookmarks:${string}`;

export async function getSetting(db: SQLiteDatabase, key: SettingKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: SettingKey, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

/** Whether the welcome tour has been finished or skipped. */
export async function hasSeenWelcome(db: SQLiteDatabase): Promise<boolean> {
  return (await getSetting(db, SETTINGS.welcomeSeen)) === '1';
}

export async function markWelcomeSeen(db: SQLiteDatabase): Promise<void> {
  await setSetting(db, SETTINGS.welcomeSeen, '1');
}

/** Whether a screen tip was closed with "Got it". */
export async function isTipDismissed(db: SQLiteDatabase, tipId: string): Promise<boolean> {
  return (await getSetting(db, `tip:${tipId}`)) === '1';
}

export async function dismissTip(db: SQLiteDatabase, tipId: string): Promise<void> {
  await setSetting(db, `tip:${tipId}`, '1');
}

/** Choices for the time per card while studying; 0 = off. */
export const AUTO_NEXT_OPTIONS = [0, 10, 20, 30, 45, 60, 90, 120];
/** Limits for a custom time per card, in seconds. */
export const AUTO_NEXT_MIN = 5;
export const AUTO_NEXT_MAX = 30 * 60;

/** Seconds each card of a deck stays before study moves on by itself (0 = off). */
export async function getAutoNext(db: SQLiteDatabase, deckId: string): Promise<number> {
  const value = Number(await getSetting(db, `autoNext:${deckId}`));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function setAutoNext(db: SQLiteDatabase, deckId: string, seconds: number): Promise<void> {
  await setSetting(db, `autoNext:${deckId}`, String(Math.max(0, Math.round(seconds))));
}

/** Whether the countdown waits while the answer is showing (per deck; off by default). */
export async function getAutoNextPauseOnAnswer(db: SQLiteDatabase, deckId: string): Promise<boolean> {
  return (await getSetting(db, `autoNextPause:${deckId}`)) === '1';
}

export async function setAutoNextPauseOnAnswer(db: SQLiteDatabase, deckId: string, on: boolean): Promise<void> {
  await setSetting(db, `autoNextPause:${deckId}`, on ? '1' : '0');
}

/** The last custom time per card someone typed, offered first in the picker (0 = none yet). */
export async function getLastCustomAutoNext(db: SQLiteDatabase): Promise<number> {
  const value = Number(await getSetting(db, SETTINGS.lastCustomAutoNext));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function setLastCustomAutoNext(db: SQLiteDatabase, seconds: number): Promise<void> {
  await setSetting(db, SETTINGS.lastCustomAutoNext, String(Math.round(seconds)));
}

/** Text sizes for reading a note in focus mode, smallest first. */
export const NOTE_FOCUS_SIZES = ['base', 'lg', 'xl'] as const;
export type NoteFocusSize = (typeof NOTE_FOCUS_SIZES)[number];

/** The text size last picked in focus mode (large by default). */
export async function getNoteFocusSize(db: SQLiteDatabase): Promise<NoteFocusSize> {
  const value = await getSetting(db, SETTINGS.noteFocusSize);
  return NOTE_FOCUS_SIZES.find((size) => size === value) ?? 'lg';
}

export async function setNoteFocusSize(db: SQLiteDatabase, size: NoteFocusSize): Promise<void> {
  await setSetting(db, SETTINGS.noteFocusSize, size);
}

/** Whether Cornell notes are shown in a handwritten font (on until turned off). */
export async function getNoteHandwriting(db: SQLiteDatabase): Promise<boolean> {
  return (await getSetting(db, SETTINGS.noteHandwriting)) !== '0';
}

export async function setNoteHandwriting(db: SQLiteDatabase, on: boolean): Promise<void> {
  await setSetting(db, SETTINGS.noteHandwriting, on ? '1' : '0');
}

/** Light or dark colours, or follow the phone's setting. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The chosen theme (follows the phone by default). */
export async function getThemePreference(db: SQLiteDatabase): Promise<ThemePreference> {
  const value = await getSetting(db, SETTINGS.theme);
  return THEME_PREFERENCES.find((theme) => theme === value) ?? 'system';
}

export async function setThemePreference(db: SQLiteDatabase, theme: ThemePreference): Promise<void> {
  await setSetting(db, SETTINGS.theme, theme);
}

/** Text sizes for notes and flashcards, smallest first ('base' = Medium, the default). */
export const READING_SIZES = ['sm', 'base', 'lg', 'xl'] as const;
export type ReadingSize = (typeof READING_SIZES)[number];

/** The text size for reading notes and flashcards (Medium by default). */
export async function getReadingSize(db: SQLiteDatabase): Promise<ReadingSize> {
  const value = await getSetting(db, SETTINGS.readingSize);
  return READING_SIZES.find((size) => size === value) ?? 'base';
}

export async function setReadingSize(db: SQLiteDatabase, size: ReadingSize): Promise<void> {
  await setSetting(db, SETTINGS.readingSize, size);
}

/** standard = the app's note view; textbook = typeset like a textbook (maths, numbered sections…). */
export type NoteView = 'standard' | 'textbook';

/** How this note was last chosen to be read, or null if never chosen (the app then decides). */
export async function getNoteView(db: SQLiteDatabase, noteId: string): Promise<NoteView | null> {
  const value = await getSetting(db, `noteView:${noteId}`);
  return value === 'standard' || value === 'textbook' ? value : null;
}

export async function setNoteView(db: SQLiteDatabase, noteId: string, view: NoteView): Promise<void> {
  await setSetting(db, `noteView:${noteId}`, view);
}

/** How notes open unless one was switched itself: auto = as a textbook when it has maths or textbook blocks. */
export const NOTE_VIEW_DEFAULTS = ['auto', 'standard', 'textbook'] as const;
export type NoteViewDefault = (typeof NOTE_VIEW_DEFAULTS)[number];

export async function getNoteViewDefault(db: SQLiteDatabase): Promise<NoteViewDefault> {
  const value = await getSetting(db, SETTINGS.noteViewDefault);
  return NOTE_VIEW_DEFAULTS.find((v) => v === value) ?? 'auto';
}

export async function setNoteViewDefault(db: SQLiteDatabase, value: NoteViewDefault): Promise<void> {
  await setSetting(db, SETTINGS.noteViewDefault, value);
}

/** The textbook reader's own settings (text size 0–3, column width, theme), as it saves them; null if never set. */
export async function getTextbookPrefs(db: SQLiteDatabase): Promise<unknown> {
  const value = await getSetting(db, SETTINGS.textbookPrefs);
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function setTextbookPrefs(db: SQLiteDatabase, prefs: object): Promise<void> {
  await setSetting(db, SETTINGS.textbookPrefs, JSON.stringify(prefs));
}

/** The sections of a note bookmarked in the textbook reader (their ids, e.g. "sec-2-1"). */
export async function getNoteBookmarks(db: SQLiteDatabase, noteId: string): Promise<string[]> {
  const value = await getSetting(db, `bookmarks:${noteId}`);
  if (!value) return [];
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').slice(0, 200) : [];
  } catch {
    return [];
  }
}

export async function setNoteBookmarks(db: SQLiteDatabase, noteId: string, ids: string[]): Promise<void> {
  await setSetting(db, `bookmarks:${noteId}`, JSON.stringify(ids.slice(0, 200)));
}

/** Shows every screen tip again. */
export async function resetTips(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM settings WHERE key LIKE 'tip:%'");
}
