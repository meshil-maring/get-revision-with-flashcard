import type { SQLiteDatabase } from 'expo-sqlite';

import { dayKey } from '@/lib/dates';

/** One day of study: cards reviewed and seconds spent studying. */
export type DayActivity = { day: string; cards: number; seconds: number };

/** Counts one reviewed card for today (local day). */
export async function recordReview(db: SQLiteDatabase, when: Date = new Date()): Promise<void> {
  await db.runAsync(
    `INSERT INTO study_log (day, cards) VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET cards = cards + 1`,
    dayKey(when),
  );
}

/** Adds study time to today's total (local day). */
export async function recordStudyTime(db: SQLiteDatabase, seconds: number, when: Date = new Date()): Promise<void> {
  const secs = Math.round(seconds);
  if (secs <= 0) return;
  await db.runAsync(
    `INSERT INTO study_log (day, cards, seconds) VALUES (?, 0, ?)
     ON CONFLICT(day) DO UPDATE SET seconds = seconds + excluded.seconds`,
    dayKey(when),
    secs,
  );
}

/** Every day that has study, oldest first. One small row per day, so this stays cheap. */
export async function listActivity(db: SQLiteDatabase): Promise<DayActivity[]> {
  return db.getAllAsync<DayActivity>(
    'SELECT day, cards, seconds FROM study_log WHERE cards > 0 OR seconds > 0 ORDER BY day ASC',
  );
}
