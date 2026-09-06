import { MIGRATIONS } from '../migrations';
import { splitSqlStatements } from '../sqlStatements';

/**
 * Splitting a migration into statements.
 *
 * The migrator has to run statements one at a time, because `expo-sqlite`'s multi-statement API
 * opens a transaction and cannot be nested inside the one the migrator needs. Everything here is
 * about not corrupting a migration on the way through — a mis-split does not usually throw, it
 * produces a shorter statement that is still valid SQL and quietly does something else.
 */

describe('splitting statements', () => {
  it('splits on semicolons and trims', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps a trailing statement with no final semicolon', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('produces nothing from whitespace or an empty string', () => {
    expect(splitSqlStatements('')).toEqual([]);
    expect(splitSqlStatements('   \n  ;  ;  ')).toEqual([]);
  });

  // The case that makes a naive split dangerous: the semicolon is inside a comment.
  it('ignores a semicolon inside a line comment', () => {
    const sql = `
      CREATE TABLE a (id TEXT);
      -- watch out; this semicolon is not a statement boundary
      CREATE TABLE b (id TEXT);
    `;

    const statements = splitSqlStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TABLE a');
    expect(statements[1]).toContain('CREATE TABLE b');
  });

  it('ignores a semicolon inside a block comment', () => {
    const statements = splitSqlStatements('CREATE TABLE a (id TEXT); /* nope; nope */ SELECT 1;');

    expect(statements).toEqual(['CREATE TABLE a (id TEXT)', 'SELECT 1']);
  });

  it('ignores a semicolon inside a quoted string', () => {
    const statements = splitSqlStatements(`INSERT INTO a VALUES ('one;two'); SELECT 1;`);

    expect(statements).toEqual([`INSERT INTO a VALUES ('one;two')`, 'SELECT 1']);
  });

  it('handles an escaped quote inside a quoted string', () => {
    const statements = splitSqlStatements(`INSERT INTO a VALUES ('it''s; fine'); SELECT 1;`);

    expect(statements).toEqual([`INSERT INTO a VALUES ('it''s; fine')`, 'SELECT 1']);
  });

  it('leaves a quoted identifier alone', () => {
    const statements = splitSqlStatements('CREATE TABLE "odd;name" (id TEXT); SELECT 1;');

    expect(statements).toEqual(['CREATE TABLE "odd;name" (id TEXT)', 'SELECT 1']);
  });
});

/**
 * The real migrations, not invented SQL.
 *
 * A splitter that works on examples and mangles the actual schema would be worse than none, and
 * the migrations are the only input this function will ever see in production.
 */
describe('every real migration survives the split', () => {
  it.each(MIGRATIONS.map((m) => [`v${m.version} ${m.name}`, m] as const))(
    '%s splits into statements that each look complete',
    (_label, migration) => {
      const statements = splitSqlStatements(migration.sql);

      expect(statements.length).toBeGreaterThan(0);

      for (const statement of statements) {
        // Every statement in this schema starts with a DDL or DML keyword. A fragment produced by
        // a bad split — `ON sync_queue (status)` — would not.
        expect(statement).toMatch(/^(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|PRAGMA)\b/i);
        // And nothing should carry a stray comment marker into execution.
        expect(statement).not.toMatch(/^--/);
      }
    }
  );

  // The count is not asserted per migration — that would break on every schema change for no
  // reason. What matters is that nothing vanishes.
  it('never loses a CREATE TABLE', () => {
    for (const migration of MIGRATIONS) {
      const inSource = (migration.sql.match(/CREATE TABLE/gi) ?? []).length;
      const inStatements = splitSqlStatements(migration.sql).filter((s) =>
        /^CREATE TABLE/i.test(s)
      ).length;

      expect(inStatements).toBe(inSource);
    }
  });
});
