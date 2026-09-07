import {
  DUPLICATE_WINDOW_MINUTES,
  findNearDuplicate,
  hasGoodDayFor,
  type DuplicateCandidate,
} from '../duplicates';

/**
 * Spotting an entry the user did not mean to make twice.
 *
 * The rule these tests hold above the others: this module **detects and never decides**. §15 does
 * not permit an entry to be dropped because it looked like a duplicate, so everything here returns
 * a finding for the caller to ask about.
 */

const at = (iso: string, signature = 'symptom:bloating:5'): DuplicateCandidate => ({
  occurredAt: iso,
  signature,
});

describe('finding a near duplicate', () => {
  it('finds an identical entry moments earlier', () => {
    const existing = [at('2026-09-07T12:00:00.000Z')];

    expect(findNearDuplicate(existing, at('2026-09-07T12:00:30.000Z'))).not.toBeNull();
  });

  it('finds nothing when the entries differ', () => {
    const existing = [at('2026-09-07T12:00:00.000Z', 'symptom:bloating:5')];

    expect(findNearDuplicate(existing, at('2026-09-07T12:00:30.000Z', 'symptom:cramping:5'))).toBe(
      null
    );
  });

  /**
   * People do eat the same thing twice and a symptom can return. Outside the window it is a
   * repeat, and a repeat is a real entry.
   */
  it('finds nothing when the same thing is recorded again much later', () => {
    const existing = [at('2026-09-07T08:00:00.000Z')];

    expect(findNearDuplicate(existing, at('2026-09-07T19:00:00.000Z'))).toBe(null);
  });

  it('treats the window as inclusive at its edge', () => {
    const existing = [at('2026-09-07T12:00:00.000Z')];
    const edge = new Date(
      Date.parse('2026-09-07T12:00:00.000Z') + DUPLICATE_WINDOW_MINUTES * 60_000
    ).toISOString();

    expect(findNearDuplicate(existing, at(edge))).not.toBeNull();
  });

  it('looks in both directions, not only backwards', () => {
    const existing = [at('2026-09-07T12:05:00.000Z')];

    expect(findNearDuplicate(existing, at('2026-09-07T12:04:00.000Z'))).not.toBeNull();
  });

  /**
   * Compared by when it happened, not when it was typed.
   *
   * Backdating this morning's meal while sitting at dinner must not collide with the meal
   * actually eaten this morning — those are the same entry, recorded once.
   */
  it('compares the instant the entry is about, not the moment it was entered', () => {
    const existing = [at('2026-09-07T08:00:00.000Z')];

    expect(findNearDuplicate(existing, at('2026-09-07T20:00:00.000Z'))).toBe(null);
  });

  it('returns the closest of several matches, so the caller can name it', () => {
    const existing = [at('2026-09-07T12:00:00.000Z'), at('2026-09-07T12:03:00.000Z')];

    expect(findNearDuplicate(existing, at('2026-09-07T12:04:00.000Z'))?.occurredAt).toBe(
      '2026-09-07T12:03:00.000Z'
    );
  });

  it('finds nothing in an empty diary', () => {
    expect(findNearDuplicate([], at('2026-09-07T12:00:00.000Z'))).toBe(null);
  });

  // A malformed timestamp is not a duplicate and must not throw on the save path.
  it('survives an unparseable timestamp on either side', () => {
    expect(findNearDuplicate([at('not a date')], at('2026-09-07T12:00:00.000Z'))).toBe(null);
    expect(findNearDuplicate([at('2026-09-07T12:00:00.000Z')], at('not a date'))).toBe(null);
  });
});

/**
 * "Feeling good" is a statement about a day rather than a moment, so the window does not apply.
 */
describe('a good day already on record', () => {
  it('recognises the day whatever time it was recorded', () => {
    expect(hasGoodDayFor(['2026-09-07'], '2026-09-07')).toBe(true);
  });

  it('does not confuse it with another day', () => {
    expect(hasGoodDayFor(['2026-09-06'], '2026-09-07')).toBe(false);
  });

  it('is false for an empty diary', () => {
    expect(hasGoodDayFor([], '2026-09-07')).toBe(false);
  });
});
