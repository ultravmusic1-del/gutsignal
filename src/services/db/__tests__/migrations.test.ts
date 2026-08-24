import { MIGRATIONS, pendingMigrations, targetVersion, type Migration } from '../migrations';

describe('local migration set', () => {
  it('uses a contiguous version sequence starting at 1', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual(versions.map((_, i) => i + 1));
  });

  it('has unique names', () => {
    const names = MIGRATIONS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('creates the sync outbox, which every offline write depends on', () => {
    const sql = MIGRATIONS.map((m) => m.sql).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sync_queue');
    expect(sql).toContain("CHECK (operation IN ('insert', 'update', 'delete'))");
  });
});

describe('pendingMigrations', () => {
  const fixtures: Migration[] = [
    { version: 1, name: 'one', sql: 'SELECT 1;' },
    { version: 2, name: 'two', sql: 'SELECT 2;' },
    { version: 3, name: 'three', sql: 'SELECT 3;' },
  ];

  it('returns everything for a fresh database', () => {
    expect(pendingMigrations(0, fixtures).map((m) => m.version)).toEqual([1, 2, 3]);
  });

  it('returns only newer migrations for a partially migrated database', () => {
    expect(pendingMigrations(2, fixtures).map((m) => m.version)).toEqual([3]);
  });

  it('returns nothing when up to date', () => {
    expect(pendingMigrations(3, fixtures)).toEqual([]);
  });

  it('returns nothing when the database is somehow ahead of the code (downgraded app)', () => {
    expect(pendingMigrations(9, fixtures)).toEqual([]);
  });

  it('always applies in ascending order regardless of declaration order', () => {
    const shuffled = [fixtures[2]!, fixtures[0]!, fixtures[1]!];
    expect(pendingMigrations(0, shuffled).map((m) => m.version)).toEqual([1, 2, 3]);
  });

  it('reports the target version', () => {
    expect(targetVersion(fixtures)).toBe(3);
    expect(targetVersion([])).toBe(0);
  });
});
