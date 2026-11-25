import type { SQLiteDatabase } from 'expo-sqlite';

import { listActivity, recordReview, recordStudyTime } from '@/data/activity';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;

beforeEach(async () => {
  db = await createTestDb();
});

describe('study activity', () => {
  it('counts reviewed cards per local day', async () => {
    await recordReview(db, new Date(2026, 10, 24, 23, 50));
    await recordReview(db, new Date(2026, 10, 25, 8, 0));
    await recordReview(db, new Date(2026, 10, 25, 21, 0));

    expect(await listActivity(db)).toEqual([
      { day: '2026-11-24', cards: 1, seconds: 0 },
      { day: '2026-11-25', cards: 2, seconds: 0 },
    ]);
  });

  it('adds up study time per local day', async () => {
    await recordStudyTime(db, 90, new Date(2026, 10, 24, 22, 0));
    await recordReview(db, new Date(2026, 10, 25, 8, 0));
    await recordStudyTime(db, 600, new Date(2026, 10, 25, 8, 5));
    await recordStudyTime(db, 30.4, new Date(2026, 10, 25, 9, 0));
    await recordStudyTime(db, 0, new Date(2026, 10, 26, 9, 0)); // nothing to add

    expect(await listActivity(db)).toEqual([
      { day: '2026-11-24', cards: 0, seconds: 90 },
      { day: '2026-11-25', cards: 1, seconds: 630 },
    ]);
  });

  it('is empty before any study', async () => {
    expect(await listActivity(db)).toEqual([]);
  });
});
