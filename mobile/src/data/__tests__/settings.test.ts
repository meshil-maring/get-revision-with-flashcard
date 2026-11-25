import type { SQLiteDatabase } from 'expo-sqlite';

import {
  dismissTip,
  getSetting,
  hasSeenWelcome,
  isTipDismissed,
  markWelcomeSeen,
  resetTips,
  setSetting,
  SETTINGS,
} from '@/data/settings';
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

  it('remembers dismissed tips, and can show them all again', async () => {
    await dismissTip(db, 'study');
    await dismissTip(db, 'deck');
    await markWelcomeSeen(db);

    expect(await isTipDismissed(db, 'study')).toBe(true);
    expect(await isTipDismissed(db, 'home')).toBe(false);

    await resetTips(db);

    expect(await isTipDismissed(db, 'study')).toBe(false);
    expect(await isTipDismissed(db, 'deck')).toBe(false);
    // Other settings are kept.
    expect(await hasSeenWelcome(db)).toBe(true);
  });
});
