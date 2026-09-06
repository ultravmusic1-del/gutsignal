/**
 * Splitting a migration into its individual statements.
 *
 * This exists because of an incompatibility that only appears on a real device. `expo-sqlite`'s
 * `execAsync` is the only API that runs several statements at once — and it opens a transaction of
 * its own, so calling it inside `withTransactionAsync` fails outright:
 *
 * ```text
 * SQLiteErrorException: cannot start a transaction within a transaction
 * ```
 *
 * `node:sqlite`, which the tests run against, permits that nesting. So the migrator passed every
 * test while being unable to apply a single migration on an iPhone.
 *
 * `runAsync` executes one statement and opens no transaction, so it nests correctly — but it takes
 * one statement at a time. Hence this: the migration is split here, and the runner keeps its
 * transaction. Atomicity is preserved on both engines rather than traded for compatibility.
 *
 * **This is not a general SQL parser and must not become one.** It handles what the migrations in
 * this repository contain — line comments, block comments and quoted text — and it is deliberately
 * strict about nothing else. A migration needing more than this should be split into two.
 */

/**
 * Splits on semicolons that are not inside a comment or a quoted string.
 *
 * A naive `split(';')` is wrong the moment a migration contains `-- ends the day;` or a default
 * value with a semicolon in it, and it fails silently: half a statement is usually still valid SQL.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';

  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i] ?? '';
    const next = sql[i + 1] ?? '';

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '-' && next === '-') {
        inLineComment = true;
        i += 1;
        continue;
      }

      if (char === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }

      if (char === ';') {
        const trimmed = current.trim();
        if (trimmed !== '') statements.push(trimmed);
        current = '';
        continue;
      }
    }

    // A doubled quote inside a quoted string is an escaped quote, not the end of it.
    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && next === "'") {
        current += char + next;
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      if (inDoubleQuote && next === '"') {
        current += char + next;
        i += 1;
        continue;
      }
      inDoubleQuote = !inDoubleQuote;
    }

    current += char;
  }

  // Trailing statement without a final semicolon.
  const remaining = current.trim();
  if (remaining !== '') statements.push(remaining);

  return statements;
}
