import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOCAL_QUERY_OPTIONS } from '../localQuery';

/**
 * Every query that reads local storage says so.
 *
 * The client defaults are written for server state: stale for a minute, retried twice, refetched
 * on reconnect. Applied to a `SELECT` against local SQLite each of those is wrong, and the one
 * that costs the user is `retry: 2` — a local read does not fail transiently, so two retries with
 * backoff only hold a blank card on screen for seconds before showing the error that was already
 * known. That is the same delay the boot screen had before ADR-0046.
 *
 * A hook that forgets this inherits the server defaults silently and nothing breaks, which is why
 * the check is here rather than left to review.
 */

const ROOT = process.cwd();

/** Hooks that read from the device: SQLite, or the OS. */
const LOCAL_READ_HOOKS = [
  'src/features/logs/useMealLogs.ts',
  'src/features/logs/useSimpleLogs.ts',
  'src/features/logs/useSymptomLogs.ts',
  'src/features/logs/useEditLog.ts',
  'src/features/timeline/useTimeline.ts',
  'src/features/insights/useInsights.ts',
  'src/features/reports/useWeeklyReview.ts',
  'src/features/notifications/useNotificationSettings.ts',
];

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('the local query options', () => {
  it('does not retry, because a local read does not fail transiently', () => {
    expect(LOCAL_QUERY_OPTIONS.retry).toBe(false);
  });

  it('does not refetch on reconnect, because nothing local changed', () => {
    expect(LOCAL_QUERY_OPTIONS.refetchOnReconnect).toBe(false);
  });

  it('is never stale, because a local read costs a millisecond', () => {
    expect(LOCAL_QUERY_OPTIONS.staleTime).toBe(0);
  });
});

describe('every hook that reads from this device', () => {
  it.each(LOCAL_READ_HOOKS)('%s applies them', (path) => {
    expect(read(path)).toContain('...LOCAL_QUERY_OPTIONS,');
  });

  /**
   * `useQuery` counted rather than asserted one-by-one: a file that grows a second local query
   * and spreads the options into only one of them would otherwise pass.
   */
  it.each(LOCAL_READ_HOOKS)('%s applies them to every query it declares', (path) => {
    const source = read(path);

    const queries = (source.match(/useQuery(?:<[^>]*>)?\(\{/g) ?? []).length;
    const applied = (source.match(/\.\.\.LOCAL_QUERY_OPTIONS,/g) ?? []).length;

    expect(applied).toBeGreaterThanOrEqual(queries);
  });

  /**
   * The two that run the pattern engine override `staleTime` deliberately — it is the one local
   * read expensive enough to cache. The override has to come after the spread or it does nothing.
   */
  it.each(['src/features/insights/useInsights.ts', 'src/features/reports/useWeeklyReview.ts'])(
    '%s overrides staleTime after the spread, not before it',
    (path) => {
      const source = read(path);

      expect(source.indexOf('...LOCAL_QUERY_OPTIONS,')).toBeLessThan(
        source.indexOf('staleTime: STALE_TIME_MS,')
      );
    }
  );
});
