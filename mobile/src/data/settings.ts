import type { SQLiteDatabase } from 'expo-sqlite';

/** Keys of the app's small saved settings. */
export const SETTINGS = {
  welcomeSeen: 'welcome_seen',
} as const;

type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

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
