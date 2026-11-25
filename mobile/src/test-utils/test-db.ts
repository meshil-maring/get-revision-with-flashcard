import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { migrateDbIfNeeded } from '@/data/db';

/**
 * An in-memory database for tests. It runs the app's real SQL on Node's built-in
 * SQLite, behind the small part of the expo-sqlite API that the data layer uses.
 */
export async function createTestDb(): Promise<SQLiteDatabase> {
  const raw = new DatabaseSync(':memory:');
  const params = (args: unknown[]) => args as SQLInputValue[];

  const db = {
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const result = raw.prepare(sql).run(...params(args));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getAllAsync(sql: string, ...args: unknown[]) {
      return raw.prepare(sql).all(...params(args));
    },
    async getFirstAsync(sql: string, ...args: unknown[]) {
      return raw.prepare(sql).get(...params(args)) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;

  await migrateDbIfNeeded(db);
  return db;
}
