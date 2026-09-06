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

import { createExpoSqliteLikeConnection } from '../expoSqliteLike.testing';
import { MIGRATIONS } from '../migrations';

/**
 * A connection that behaves the way `expo-sqlite` does, including the transaction semantics that
 * caused this bug. Shared with `serialize.test.ts` — see that module for what it reproduces and why.
 */
function mockCreateConnection() {
  return createExpoSqliteLikeConnection();
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

/** Seeds a newly created connection, for tests that need the database to start out damaged. */
let mockOnOpen: ((connection: ReturnType<typeof mockCreateConnection>) => void) | null = null;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async (name: string) => {
    mockOpens += 1;
    if (mockOpenFailure) throw mockOpenFailure;

    const existing = mockConnections.get(name);
    if (existing) return existing;

    const created = mockCreateConnection();
    mockOnOpen?.(created);
    mockConnections.set(name, created);
    return created;
  },
  /**
   * Refuses to delete a database that is still open, exactly as the native module does:
   *
   * ```text
   * Unable to delete database … that is currently open. Close it prior to deletion
   * ```
   *
   * (expo-sqlite/ios/SQLiteModule.swift:510 and Exceptions.swift:29.) Without this rule the fake
   * would happily delete anything, and the leak below would be invisible here while breaking the
   * only recovery a user has on a device.
   */
  deleteDatabaseAsync: async (name: string) => {
    const existing = mockConnections.get(name);

    if (existing?.isOpen() === true) {
      throw new Error(`Unable to delete database ${name} that is currently open`);
    }

    mockConnections.delete(name);
  },
}));

// Imported after the mock is registered.
const { openDatabase, closeDatabase, deleteLocalDatabase, getSchemaVersion, DATABASE_NAME } =
  jest.requireActual<typeof import('../database')>('../database');

afterEach(async () => {
  await closeDatabase();
  mockConnections.delete(DATABASE_NAME);
  mockOpens = 0;
  mockOpenFailure = null;
  mockOnOpen = null;
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

  /**
   * A migration that fails must not leave the connection behind.
   *
   * `openDatabaseAsync` succeeds and `migrate` throws, so the handle exists but nobody holds a
   * reference to it — and `expo-sqlite` keeps it in its native cache, where it refuses to delete a
   * database that is still open. That turns a recoverable schema fault into an unrecoverable one:
   * the app cannot open the database, and the boot screen's delete button cannot remove it either.
   * On a device this looked like a button that did nothing at all.
   */
  it('closes the connection when the migration fails, so the database can still be deleted', async () => {
    // A version row claiming a migration ran, with none of its tables present. This is the state
    // the interleaved-transaction bug left behind, and it is what the phone actually contained.
    mockOnOpen = (connection) => {
      connection.execAsync(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT);
        INSERT INTO schema_migrations VALUES (2, 'symptom_logs', '2026-09-06T00:00:00.000Z');
      `);
    };

    await expect(openDatabase()).rejects.toThrow();

    await expect(deleteLocalDatabase()).resolves.toBeUndefined();
  });
});
