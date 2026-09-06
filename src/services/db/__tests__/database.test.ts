/**
 * @jest-environment node
 *
 * Opening the local database when the whole app asks for it at once.
 *
 * This is the test that would have caught the boot failure. On a real phone GutSignal stopped at
 * "the local database could not be opened", with:
 *
 * ```text
 * SQLiteErrorException: cannot start a transaction within a transaction
 * ```
 *
 * `openDatabase` memoized the resolved handle, which memoizes nothing while the first call is
 * still running. Around twenty call sites reach for the database on launch, they all started
 * before any of them finished, `expo-sqlite` gave each the *same* native connection, and each ran
 * `migrate` on it — so two `BEGIN`s overlapped on one connection.
 *
 * Nothing in the suite could see that, because every other database test calls `migrate` directly
 * against its own handle. The concurrency lived entirely in `openDatabase`.
 */

import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS } from '../migrations';
import type { SqlBindValue } from '../sqlite';

/**
 * A connection that behaves the way `expo-sqlite` does in the two respects that caused the bug.
 *
 * First, `withTransactionAsync` is expo-sqlite's own implementation — a literal `BEGIN` sent
 * through `execAsync`, which is what makes an overlapping pair illegal. Its documentation is
 * explicit that the transaction "is not exclusive and can be interrupted by other async queries".
 *
 * Second, the engine underneath is real. The nested-`BEGIN` error is raised by SQLite itself, not
 * asserted by a fake that was written to agree with the diagnosis.
 */
function mockCreateConnection() {
  const db = new DatabaseSync(':memory:');

  const connection = {
    async execAsync(source: string): Promise<void> {
      db.exec(source);
    },

    async runAsync(source: string, ...params: SqlBindValue[]) {
      const result = db.prepare(source).run(...params);
      return { changes: Number(result.changes) };
    },

    async getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null> {
      return (db.prepare(source).get(...params) as T | undefined) ?? null;
    },

    async getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]> {
      return db.prepare(source).all(...params) as T[];
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      await connection.execAsync('BEGIN');
      try {
        await task();
        await connection.execAsync('COMMIT');
      } catch (error) {
        await connection.execAsync('ROLLBACK');
        throw error;
      }
    },

    async closeAsync(): Promise<void> {
      db.close();
    },
  };

  return connection;
}

/**
 * One connection per database name, handed to every caller.
 *
 * This is the part of `expo-sqlite`'s behaviour the old code assumed away. Opening the same name
 * twice does not give you two databases to migrate independently; it gives you the same one twice.
 */
const mockConnections = new Map<string, ReturnType<typeof mockCreateConnection>>();

let mockOpens = 0;

/** Set by the retry test. A namespace import is copied, so the failure has to come from inside. */
let mockOpenFailure: Error | null = null;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async (name: string) => {
    mockOpens += 1;
    if (mockOpenFailure) throw mockOpenFailure;

    const existing = mockConnections.get(name);
    if (existing) return existing;

    const created = mockCreateConnection();
    mockConnections.set(name, created);
    return created;
  },
  deleteDatabaseAsync: async (name: string) => {
    mockConnections.delete(name);
  },
}));

// Imported after the mock is registered.
const { openDatabase, closeDatabase, getSchemaVersion, DATABASE_NAME } =
  jest.requireActual<typeof import('../database')>('../database');

afterEach(async () => {
  await closeDatabase();
  mockConnections.delete(DATABASE_NAME);
  mockOpens = 0;
  mockOpenFailure = null;
});

describe('openDatabase', () => {
  it('migrates once when the whole app asks for the database at the same moment', async () => {
    // Twenty, because that is roughly how many call sites `openDatabase` has and every one of
    // them can start before the first finishes. One or two would not have reproduced it.
    const handles = await Promise.all(Array.from({ length: 20 }, () => openDatabase()));

    expect(new Set(handles).size).toBe(1);
    expect(await getSchemaVersion(handles[0]!)).toBe(MIGRATIONS.length);
  });

  it('opens the underlying database once, however many callers there are', async () => {
    await Promise.all(Array.from({ length: 20 }, () => openDatabase()));

    expect(mockOpens).toBe(1);
  });

  it('returns the same handle to a caller arriving after the open has finished', async () => {
    const first = await openDatabase();
    const second = await openDatabase();

    expect(second).toBe(first);
  });

  /**
   * A cached rejection would turn one bad launch into a permanently broken process.
   *
   * The boot screen offers a retry (spec §21), and that retry has to be able to succeed — so a
   * failed open must clear the memo rather than hand the same rejection to everyone forever.
   */
  it('lets a later call retry after a failed open', async () => {
    mockOpenFailure = new Error('disk is full');

    await expect(openDatabase()).rejects.toThrow('disk is full');

    mockOpenFailure = null;

    await expect(openDatabase()).resolves.toBeDefined();
  });
});
