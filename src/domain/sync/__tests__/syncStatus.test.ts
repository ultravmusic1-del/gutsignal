import { describeAge, syncStatus, type SyncStatusInput } from '../syncStatus';

/**
 * What the app tells someone about whether their diary has left the device.
 *
 * The promise is that logs are not lost (§61), and a diary that has quietly stopped syncing looks
 * exactly like one that is syncing perfectly. These tests hold three tone rules that are easy to
 * lose in a rewrite: pending is not an error, offline is not a failure, and nothing here claims
 * more than is known.
 */

const NOW = new Date('2026-09-07T12:00:00.000Z');

const status = (over: Partial<SyncStatusInput> = {}) =>
  syncStatus({
    pendingCount: 0,
    lastSyncedAt: '2026-09-07T11:59:00.000Z',
    lastFailure: null,
    now: NOW,
    ...over,
  });

describe('describing how long ago', () => {
  it('is coarse rather than precise', () => {
    expect(describeAge('2026-09-07T11:59:30.000Z', NOW)).toBe('just now');
    expect(describeAge('2026-09-07T11:20:00.000Z', NOW)).toBe('40 minutes ago');
    expect(describeAge('2026-09-07T09:00:00.000Z', NOW)).toBe('3 hours ago');
    expect(describeAge('2026-09-04T12:00:00.000Z', NOW)).toBe('3 days ago');
  });

  /**
   * Rounds down, never up.
   *
   * Every example above happens to land on an exact boundary, where rounding up and rounding down
   * agree — so they pinned the wording and not the arithmetic, and a `Math.ceil` mutation survived
   * the suite. Elapsed time reported as more than it was makes a working sync look staler than it
   * is, which is the direction that causes a needless worry about lost entries.
   */
  it('rounds down, so a sync is never reported as older than it is', () => {
    expect(describeAge('2026-09-07T11:19:30.000Z', NOW)).toBe('40 minutes ago');
    expect(describeAge('2026-09-07T08:30:00.000Z', NOW)).toBe('3 hours ago');
    expect(describeAge('2026-09-04T06:00:00.000Z', NOW)).toBe('3 days ago');
  });

  it('uses the singular where it should', () => {
    expect(describeAge('2026-09-07T11:00:00.000Z', NOW)).toBe('1 hour ago');
    expect(describeAge('2026-09-06T12:00:00.000Z', NOW)).toBe('1 day ago');
  });

  it('says so plainly when nothing has ever synced', () => {
    expect(describeAge(null, NOW)).toBe('not yet');
  });

  // A device clock that has moved backwards must not produce "-3 hours ago".
  it('survives a timestamp in the future or an unparseable one', () => {
    expect(describeAge('2027-01-01T00:00:00.000Z', NOW)).toBe('just now');
    expect(describeAge('not a date', NOW)).toBe('just now');
  });
});

describe('when everything has been sent', () => {
  it('says what is known and not what is hoped', () => {
    const result = status();

    expect(result.tone).toBe('settled');
    expect(result.title).toBe('Everything on this device has been sent');
    // Never "backed up" or "safe in the cloud": this function cannot see a server.
    expect(`${result.title} ${result.detail}`).not.toMatch(/backed up|cloud|safe on our|forever/i);
  });
});

/**
 * §15: an entry waiting to upload is the offline design working. Dressing it as a warning teaches
 * people that warnings mean nothing.
 */
describe('when entries are waiting', () => {
  it('is not an error', () => {
    const result = status({ pendingCount: 3 });

    expect(result.tone).toBe('working');
    expect(result.actionable).toBe(false);
    expect(result.title).toBe('3 entries still uploading');
  });

  it('counts one entry in the singular', () => {
    expect(status({ pendingCount: 1 }).title).toBe('1 entry still uploading');
  });

  it('says the entries are on the device, so nothing reads as lost', () => {
    expect(status({ pendingCount: 3 }).detail).toMatch(/Saved on this device/);
  });
});

describe('when a run has failed', () => {
  /**
   * There is nothing to do about a tunnel. Asking someone to check their connection while they
   * are on a train is the kind of advice that makes an app feel stupid.
   */
  it('treats being offline as working, not as a problem to act on', () => {
    const result = status({ lastFailure: 'network', pendingCount: 2 });

    expect(result.tone).toBe('working');
    expect(result.actionable).toBe(false);
  });

  // The one failure the user can actually resolve.
  it('asks for attention only when the session has expired', () => {
    const result = status({ lastFailure: 'auth' });

    expect(result.tone).toBe('attention');
    expect(result.actionable).toBe(true);
    expect(result.title).toMatch(/Sign in again/);
  });

  it.each(['network', 'auth', 'conflict', 'unknown'] as const)(
    'reassures that entries are safe on the device when the reason is %s',
    (reason) => {
      expect(status({ lastFailure: reason }).detail).toMatch(
        /saved on this device|safe on this device/i
      );
    }
  );

  /**
   * A failure outranks a count: someone with four pending entries and an expired session needs to
   * hear about the session, because the four are a symptom of it.
   */
  it('leads with the failure rather than the number waiting', () => {
    const result = status({ lastFailure: 'auth', pendingCount: 4 });

    expect(result.title).toMatch(/Sign in again/);
    expect(result.title).not.toMatch(/4/);
  });

  it('still says when the last confirmed sync was', () => {
    expect(status({ lastFailure: 'unknown' }).detail).toMatch(/Last confirmed/);
  });
});

describe('before anything has ever synced', () => {
  it('explains the design rather than reporting an absence', () => {
    const result = status({ lastSyncedAt: null });

    expect(result.tone).toBe('working');
    expect(result.detail).toMatch(/saved on this device first/i);
  });
});

/**
 * §29 and §30 stop at the app's edge too: nothing on this surface may name what was logged.
 */
describe('what it never says', () => {
  it.each([
    ['settled', {}],
    ['pending', { pendingCount: 2 }],
    ['network', { lastFailure: 'network' as const }],
    ['auth', { lastFailure: 'auth' as const }],
    ['conflict', { lastFailure: 'conflict' as const }],
    ['unknown', { lastFailure: 'unknown' as const }],
    ['never synced', { lastSyncedAt: null }],
  ])('%s carries no health content and no blame', (_label, over) => {
    const result = status(over);
    const text = `${result.title} ${result.detail}`;

    expect(text).not.toMatch(/symptom|bloating|meal|bowel|stool|food/i);
    expect(text).not.toMatch(/you failed|your fault|you should have/i);
  });
});
