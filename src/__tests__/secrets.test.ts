import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No secret is committed (`CLAUDE.md` §46, §49, §58).
 *
 * A committed key is a release blocker and, worse, an irreversible one: rotating is the only fix
 * once it is in the history. This runs on every `npm test` rather than at review time, because
 * review is exactly where a `.env` pasted into a config file gets missed.
 *
 * It scans **tracked files only**, via `git ls-files`. An untracked `.env` on the developer's disk
 * is correct and expected; the question this test asks is what is in the repository.
 */

const TRACKED = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

/** Text files worth reading. Binaries and lockfiles are noise, and a lockfile holds no secrets. */
const SCANNABLE = /\.(ts|tsx|js|jsx|json|md|sql|yml|yaml|toml|sh|plist|env\.example)$/;

const EXCLUDED = new Set(['package-lock.json']);

const files = TRACKED.filter(
  (path) => SCANNABLE.test(path) && !EXCLUDED.has(path) && !path.startsWith('src/__tests__/')
);

/**
 * Shapes of real credentials.
 *
 * Deliberately anchored on the **prefixes vendors actually use** rather than on the word "key",
 * which appears legitimately all over a codebase. A pattern that fires on `apiKey` teaches people
 * to add suppressions; one that fires on `sk-` does not.
 */
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'Supabase service-role JWT', pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./ },
  { name: 'OpenAI-style secret key', pattern: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9-]{20,}/ },
  { name: 'RevenueCat secret key', pattern: /\bsk_[A-Za-z0-9]{24,}/ },
  { name: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

describe('committed secrets', () => {
  it('has files to scan, so a broken glob cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(SECRET_PATTERNS)('contains no $name', ({ pattern }) => {
    const offenders = files.filter((path) => {
      try {
        return pattern.test(readFileSync(join(process.cwd(), path), 'utf8'));
      } catch {
        return false; // deleted between listing and reading, or not readable as text
      }
    });

    expect(offenders).toEqual([]);
  });

  // §49: only intentionally public values may use the EXPO_PUBLIC_ prefix, and everything under it
  // is compiled into the bundle where anyone can read it.
  it('never commits a .env, only the example', () => {
    const committedEnvs = TRACKED.filter(
      (path) => /(^|\/)\.env/.test(path) && !path.endsWith('.env.example')
    );

    expect(committedEnvs).toEqual([]);
  });

  it('keeps an .env.example so the required variables are discoverable', () => {
    expect(TRACKED).toContain('.env.example');
  });

  // A value in the example file would be copied into a real .env and, more likely, committed.
  it('leaves every value in .env.example blank', () => {
    const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

    const filled = example
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .filter((line) => {
        const value = line.slice(line.indexOf('=') + 1).trim();
        return value.length > 0 && !/^(your|<|\.\.\.)/i.test(value);
      });

    expect(filled).toEqual([]);
  });
});
