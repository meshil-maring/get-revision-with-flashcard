import type { SQLiteDatabase } from 'expo-sqlite';

/** Keys of the app's small saved settings. */
export const SETTINGS = {
  welcomeSeen: 'welcome_seen',
  lastCustomAutoNext: 'last_custom_auto_next',
  noteFocusSize: 'note_focus_size',
  noteHandwriting: 'note_handwriting',
  theme: 'theme',
  readingSize: 'reading_size',
} as const;

// Screen tips are saved one key each, e.g. 'tip:study' (see components/ui/screen-tip.tsx).
// Auto-next time per deck is saved as 'autoNext:<deckId>'.
type SettingKey =
  | (typeof SETTINGS)[keyof typeof SETTINGS]
  | `tip:${string}`
  | `autoNext:${string}`
  | `autoNextPause:${string}`;

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

/** Shows every screen tip again. */
export async function resetTips(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM settings WHERE key LIKE 'tip:%'");
}
