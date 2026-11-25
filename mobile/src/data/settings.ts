import type { SQLiteDatabase } from 'expo-sqlite';

/** Keys of the app's small saved settings. */
export const SETTINGS = {
  welcomeSeen: 'welcome_seen',
  lastCustomAutoNext: 'last_custom_auto_next',
} as const;

// Screen tips are saved one key each, e.g. 'tip:study' (see components/screen-tip.tsx).
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

/** Shows every screen tip again. */
export async function resetTips(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM settings WHERE key LIKE 'tip:%'");
}
