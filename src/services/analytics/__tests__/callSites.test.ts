import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where `track` may be called from.
 *
 * Analytics is an edge concern: a screen, a mutation's `onSuccess`, a service that talks to the
 * outside world. `src/domain` is none of those. Everything under it — the pattern engine above
 * all — must stay pure and reproducible, and a `track` call inside it would make a function's
 * behaviour depend on process-wide state that tests do not set (`CLAUDE.md` §18, §41).
 *
 * It would also be the easiest possible route for health content to reach a vendor, because
 * domain code is precisely the code holding severities and meal items in local variables.
 */

const TRACKED = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx" "app/**/*.tsx"', {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.includes('__tests__'));

const importsAnalytics = (path: string) => {
  const source = readFileSync(join(process.cwd(), path), 'utf8');
  return /from '@\/services\/analytics\//.test(source);
};

describe('analytics call sites', () => {
  it('lists files, so a broken glob cannot pass silently', () => {
    expect(TRACKED.length).toBeGreaterThan(50);
  });

  it('is never reached from domain code', () => {
    const offenders = TRACKED.filter(
      (path) => path.startsWith('src/domain/') && importsAnalytics(path)
    );

    expect(offenders).toEqual([]);
  });

  // The wall only works if it is the only door. A screen importing PostHog directly, or a second
  // wrapper growing up beside this one, would bypass every guarantee in `events.ts`.
  it('is the only analytics dependency in the app', () => {
    const offenders = TRACKED.filter((path) => {
      if (path.startsWith('src/services/analytics/')) return false;

      const source = readFileSync(join(process.cwd(), path), 'utf8');
      return /from ['"](posthog|@amplitude|@segment|mixpanel|firebase\/analytics)/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
