import {
  cleanSignOutPrompt,
  planSignOut,
  signOutPrompt,
  unknownSignOutPrompt,
  unsentSignOutPrompt,
} from '../signOutPlan';

/**
 * The warning shown before signing out with entries the server has not accepted.
 *
 * These are copy tests, which usually earn their keep poorly — but not here. `CLAUDE.md` §15
 * forbids discarding an unsynchronised record silently, and this copy *is* the compliance: if it
 * stops naming the number, or stops naming the risk, the app is quietly back in breach with every
 * other check still green.
 */

describe('deciding whether to warn', () => {
  it('says nothing when everything reached the server', () => {
    expect(planSignOut(0)).toEqual({ kind: 'clean' });
  });

  it('warns about a single outstanding entry', () => {
    expect(planSignOut(1)).toEqual({ kind: 'unsent', count: 1 });
  });

  it('carries the count through so the warning can name it', () => {
    expect(planSignOut(7)).toEqual({ kind: 'unsent', count: 7 });
  });
});

describe('the ordinary prompt', () => {
  it('says entries are on the account rather than only on the device', () => {
    const prompt = cleanSignOutPrompt();

    expect(prompt.body).toMatch(/saved to your account/i);
    expect(prompt.confirmLabel).toBe('Sign out');
  });
});

describe('the warning', () => {
  it('names how many entries are at risk', () => {
    expect(unsentSignOutPrompt(3).body).toContain('3 entries');
  });

  it('reads correctly for exactly one', () => {
    const body = unsentSignOutPrompt(1).body;

    expect(body).toContain('1 entry has');
    expect(body).not.toContain('entries have');
  });

  // The whole point of §15: the loss must not be a surprise afterwards.
  it('states the risk rather than gesturing at it', () => {
    const body = unsentSignOutPrompt(2).body;

    expect(body).toMatch(/someone else signs in/i);
    expect(body).toMatch(/removed/i);
  });

  // It would be easy to write "your entries are safe" and technically defend it. A warning that
  // reassures is not a warning.
  it('does not claim the entries are safe', () => {
    const body = unsentSignOutPrompt(2).body;

    expect(body).not.toMatch(/\bsafe\b/i);
    expect(body).not.toMatch(/don't worry|nothing will be lost|no data will be lost/i);
  });

  it('offers a real recovery path as well as the risk', () => {
    expect(unsentSignOutPrompt(2).body).toMatch(/signing back in/i);
  });

  // A confirm button reading "Sign out" on a destructive prompt gives no pause at all.
  it('labels the destructive choice as the exception it is', () => {
    expect(unsentSignOutPrompt(2).confirmLabel).toBe('Sign out anyway');
    expect(unsentSignOutPrompt(2).title).not.toBe(cleanSignOutPrompt().title);
  });
});

describe('when the count cannot be read', () => {
  // Treating an unreadable count as zero would turn a storage failure into the silent discard
  // §15 forbids. Saying "we do not know" is vague, but it is true and it still lets the user choose.
  it('admits it does not know rather than implying nothing is outstanding', () => {
    const prompt = unknownSignOutPrompt();

    expect(prompt.body).toMatch(/could not check/i);
    expect(prompt.body).toMatch(/someone else signs in/i);
    expect(prompt.confirmLabel).toBe('Sign out anyway');
  });

  it('never claims everything is saved', () => {
    expect(unknownSignOutPrompt().body).not.toMatch(/everything .* saved|all saved|safe/i);
  });
});

describe('choosing the prompt for a plan', () => {
  it('uses the ordinary copy when nothing is outstanding', () => {
    expect(signOutPrompt({ kind: 'clean' })).toEqual(cleanSignOutPrompt());
  });

  it('uses the warning when something is', () => {
    expect(signOutPrompt({ kind: 'unsent', count: 4 })).toEqual(unsentSignOutPrompt(4));
  });
});
