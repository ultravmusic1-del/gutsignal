import { ANALYTICS_EVENT_SCHEMAS } from '@/services/analytics/events';

import { classifySyncFailure, dominantFailureReason } from '../failureReason';

/**
 * Classifying a sync failure into the four words `sync_failed` is allowed to carry.
 *
 * The point of this module is what it *cannot* pass on. A Supabase error message can contain a
 * constraint name, a column, a row id, or the text a user typed about their own health, and
 * `sync_failed` takes a fixed enum precisely so none of that can reach a vendor (§29, §58). The
 * last test in this file is the one that matters most.
 */

describe('reading structured fields', () => {
  // A status code means the same thing in every locale and across library versions; message text
  // does not. So the codes are checked first.
  it('recognises a refused write as an auth problem', () => {
    expect(classifySyncFailure({ code: '42501' })).toBe('auth');
    expect(classifySyncFailure({ status: 401 })).toBe('auth');
    expect(classifySyncFailure({ status: 403 })).toBe('auth');
  });

  it('recognises an expired session', () => {
    expect(classifySyncFailure({ code: 'PGRST301' })).toBe('auth');
  });

  it('recognises a constraint violation as a conflict', () => {
    expect(classifySyncFailure({ code: '23505' })).toBe('conflict');
    expect(classifySyncFailure({ code: '23503' })).toBe('conflict');
    expect(classifySyncFailure({ status: 409 })).toBe('conflict');
  });

  // A request that never reached a server has no status at all.
  it('recognises a request that never arrived', () => {
    expect(classifySyncFailure({ name: 'TypeError', message: 'Network request failed' })).toBe(
      'network'
    );
    expect(classifySyncFailure({ name: 'AbortError' })).toBe('network');
  });

  it('prefers the code over the message when they disagree', () => {
    expect(classifySyncFailure({ code: '42501', message: 'network unreachable' })).toBe('auth');
  });
});

describe('falling back to the message', () => {
  it('reads an auth failure', () => {
    expect(classifySyncFailure({ message: 'JWT expired' })).toBe('auth');
    expect(classifySyncFailure({ message: 'new row violates row-level security policy' })).toBe(
      'auth'
    );
  });

  it('reads a conflict', () => {
    expect(classifySyncFailure({ message: 'duplicate key value violates unique constraint' })).toBe(
      'conflict'
    );
  });

  it('reads a network failure', () => {
    for (const message of ['Network request failed', 'fetch failed', 'Request timed out']) {
      expect(classifySyncFailure({ message })).toBe('network');
    }
  });

  it('works on a real Error instance, not only a plain object', () => {
    expect(classifySyncFailure(new Error('Network request failed'))).toBe('network');
  });
});

describe('refusing to guess', () => {
  it.each([null, undefined, 42, 'a string', {}, { message: '' }])(
    'returns unknown for %p rather than inventing a cause',
    (input) => {
      expect(classifySyncFailure(input)).toBe('unknown');
    }
  );

  it('returns unknown for a message it does not recognise', () => {
    expect(classifySyncFailure({ message: 'something went sideways' })).toBe('unknown');
  });
});

describe('choosing one reason for a whole run', () => {
  it('reports nothing for a run that failed at nothing', () => {
    expect(dominantFailureReason([])).toBeNull();
  });

  // Fifty rows failing behind one expired session is one problem, and reporting it as the thing
  // that happened to come first would send someone after the wrong thing.
  it('lets the most actionable cause win over the most common one', () => {
    expect(dominantFailureReason(['network', 'network', 'network', 'network', 'auth'])).toBe(
      'auth'
    );
  });

  it('orders conflict above network, and network above unknown', () => {
    expect(dominantFailureReason(['network', 'conflict'])).toBe('conflict');
    expect(dominantFailureReason(['unknown', 'network'])).toBe('network');
  });

  it('passes a single reason through unchanged', () => {
    expect(dominantFailureReason(['conflict'])).toBe('conflict');
  });
});

describe('what can never escape', () => {
  // The whole reason this module exists. Every classification must be one of the four declared
  // words, so no fragment of an error message — which can name a constraint, a column, a row, or
  // something the user typed about their own health — can travel to a vendor.
  it('only ever produces a value the allowlist accepts', () => {
    const errors: unknown[] = [
      new Error('duplicate key value violates unique constraint "meal_logs_pkey"'),
      { message: 'insert into "symptom_logs" failed: severity 9 out of range' },
      { message: 'could not sync note: felt awful after the curry', code: 'XX000' },
      { name: 'TypeError', message: 'Network request failed' },
      { status: 401 },
      null,
    ];

    for (const error of errors) {
      const reason = classifySyncFailure(error);
      const parsed = ANALYTICS_EVENT_SCHEMAS.sync_failed.safeParse({ reason });

      expect(parsed.success).toBe(true);
    }
  });

  it('never returns anything derived from the message text', () => {
    const reason = classifySyncFailure({
      message: 'duplicate key value violates unique constraint on symptom bloating severity 9',
    });

    expect(['auth', 'conflict', 'network', 'unknown']).toContain(reason);
    expect(reason).not.toContain('bloating');
  });
});
