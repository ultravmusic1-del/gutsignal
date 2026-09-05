/**
 * What to tell someone before they sign out (`CLAUDE.md` §15, §53).
 *
 * Signing out used to be free: everything stayed on the device, and signing back in picked up
 * where it left off. That is no longer quite true. Since another account's local data is cleared
 * when a different person signs in, an entry the server has not accepted can be lost — and §15 is
 * unambiguous that an unsynchronised record must never be discarded **silently**.
 *
 * Sign-out is the only moment where that can be said to the person it belongs to. Afterwards they
 * are gone, and the loss happens to somebody who is no longer there to be warned. So the flow is:
 * try to send what is left, then count what remains, then say so plainly before continuing.
 *
 * The copy below is deliberately not reassuring. It would be easy to write "your entries are safe"
 * and technically defend it — they are safe *unless* someone else signs in — but a warning that
 * has to be read twice to find the risk is not a warning.
 */

export type SignOutPlan =
  /** Everything reached the server. Signing out costs nothing. */
  | { kind: 'clean' }
  /** Entries the server has not accepted. The user has to decide. */
  | { kind: 'unsent'; count: number };

/**
 * Whether sign-out needs a second conversation.
 *
 * Takes the count measured **after** a flush attempt: warning about entries that a final sync is
 * about to send would train people to dismiss the warning, which is worse than not showing one.
 */
export function planSignOut(unsentAfterFlush: number): SignOutPlan {
  return unsentAfterFlush > 0 ? { kind: 'unsent', count: unsentAfterFlush } : { kind: 'clean' };
}

export type SignOutPrompt = {
  title: string;
  body: string;
  confirmLabel: string;
};

/** The ordinary case: nothing outstanding, and the copy says exactly that. */
export function cleanSignOutPrompt(): SignOutPrompt {
  return {
    title: 'Sign out?',
    body: 'Everything you have logged is saved to your account. Signing back in on any device brings it all back.',
    confirmLabel: 'Sign out',
  };
}

/**
 * The case that matters.
 *
 * Names the number, says why it happened, and states the actual risk rather than gesturing at it.
 * "Signing back in on this device" is the honest recovery path — it is real, and it is the only
 * one — but it is stated alongside what breaks it rather than instead of it.
 */
export function unsentSignOutPrompt(count: number): SignOutPrompt {
  const entries = count === 1 ? '1 entry has' : `${count} entries have`;
  const them = count === 1 ? 'it' : 'them';

  return {
    title: 'Sign out with unsaved entries?',
    body:
      `${entries} not reached your account yet — usually because this device has been offline. ` +
      `Signing back in here will finish sending ${them}. ` +
      `But if someone else signs in on this device first, ${them} will be removed.`,
    confirmLabel: 'Sign out anyway',
  };
}

/**
 * When the count itself could not be read.
 *
 * Treating an unreadable count as zero would turn a storage failure into exactly the silent
 * discard §15 forbids, so this errs the other way and says it does not know. Vague, but true —
 * and the user can still choose.
 */
export function unknownSignOutPrompt(): SignOutPrompt {
  return {
    title: 'Sign out?',
    body: 'GutSignal could not check whether everything has reached your account. Signing back in on this device will finish sending anything left, but if someone else signs in first it will be removed.',
    confirmLabel: 'Sign out anyway',
  };
}

/** The prompt for a plan, so a screen never has to decide which copy applies. */
export function signOutPrompt(plan: SignOutPlan): SignOutPrompt {
  return plan.kind === 'clean' ? cleanSignOutPrompt() : unsentSignOutPrompt(plan.count);
}
