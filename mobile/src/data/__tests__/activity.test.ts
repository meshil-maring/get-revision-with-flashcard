import type { SQLiteDatabase } from 'expo-sqlite';

import { listActivity, recordReview } from '@/data/activity';
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
      { day: '2026-11-24', cards: 1 },
      { day: '2026-11-25', cards: 2 },
    ]);
  });

  it('is empty before any study', async () => {
    expect(await listActivity(db)).toEqual([]);
  });
});
