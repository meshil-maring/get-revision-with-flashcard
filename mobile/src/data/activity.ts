import type { SQLiteDatabase } from 'expo-sqlite';

import { dayKey } from '@/lib/dates';

export type DayActivity = { day: string; cards: number };

/** Counts one reviewed card for today (local day). */
export async function recordReview(db: SQLiteDatabase, when: Date = new Date()): Promise<void> {
  await db.runAsync(
    `INSERT INTO study_log (day, cards) VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET cards = cards + 1`,
    dayKey(when),
  );
}

/** Every day that has study, oldest first. One small row per day, so this stays cheap. */
export async function listActivity(db: SQLiteDatabase): Promise<DayActivity[]> {
  return db.getAllAsync<DayActivity>(
    'SELECT day, cards FROM study_log WHERE cards > 0 ORDER BY day ASC',
  );
}
