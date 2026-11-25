import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, hasSeenWelcome, markWelcomeSeen, setSetting, SETTINGS } from '@/data/settings';
import { createTestDb } from '@/test-utils/test-db';

let db: SQLiteDatabase;

beforeEach(async () => {
  db = await createTestDb();
});

describe('settings', () => {
  it('returns null for a setting that was never saved', async () => {
    expect(await getSetting(db, SETTINGS.welcomeSeen)).toBeNull();
  });

  it('saves and overwrites a setting', async () => {
    await setSetting(db, SETTINGS.welcomeSeen, 'a');
    await setSetting(db, SETTINGS.welcomeSeen, 'b');
    expect(await getSetting(db, SETTINGS.welcomeSeen)).toBe('b');
  });

  it('remembers that the welcome tour was seen', async () => {
    expect(await hasSeenWelcome(db)).toBe(false);
    await markWelcomeSeen(db);
    expect(await hasSeenWelcome(db)).toBe(true);
  });
});
