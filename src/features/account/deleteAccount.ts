/**
 * Deleting an account, and everything it owns (spec §97, `CLAUDE.md` §58).
 *
 * A missing account-deletion path is a release blocker, and so is one that only appears to work.
 * The point of this module is the **ordering**, which is the part that decides whether a failure
 * is recoverable:
 *
 * ```text
 * server  →  device  →  session
 * ```
 *
 * The server holds the only copy that outlives the device, so it goes first. If that call fails,
 * nothing else happens: the account still exists, the diary is untouched, and the person can try
 * again. Wiping the device first would produce the one arrangement with no way back — local data
 * gone, server data intact, and no session left to reach it with.
 *
 * Past the server call the direction reverses, because the account no longer exists. Clearing the
 * device and ending the session are then attempted regardless of each other's outcome: leaving
 * someone signed in to an account that is gone strands the app in a state with no route out.
 *
 * Everything is behind injected ports so the ordering can be tested without a network, a
 * database, or a session — which is the only way to test the failure paths that matter, since
 * they are precisely the ones that are hard to produce on demand.
 */

/** What the flow needs from the outside world. Each is trivially faked in a test. */
export type DeleteAccountPorts = {
  /**
   * Calls the `delete-account` Edge Function, which removes the auth user; every user-owned table
   * cascades from it. Never resolves by deleting locally — the server is the authority here.
   */
  deleteOnServer: () => Promise<{ ok: boolean; message?: string }>;
  /** Destroys the local SQLite mirror. */
  clearLocalData: () => Promise<void>;
  /** Ends the session and unlinks the identity on this device. */
  signOut: () => Promise<void>;
};

export type DeleteAccountResult =
  | {
      ok: true;
      /**
       * False when the server deleted the account but the device could not be cleared. The
       * deletion still succeeded — the account is gone — but the app must say that a local copy
       * may remain rather than claim a clean sweep it did not achieve.
       */
      localDataCleared: boolean;
    }
  | { ok: false; failedAt: 'server'; message: string };

export async function runAccountDeletion(ports: DeleteAccountPorts): Promise<DeleteAccountResult> {
  const server = await ports.deleteOnServer();

  if (!server.ok) {
    // Nothing has been touched. The account works, the diary is intact, and this is retryable.
    return {
      ok: false,
      failedAt: 'server',
      message: server.message ?? 'The account could not be deleted just now.',
    };
  }

  // Past this line the account no longer exists, so neither of the remaining steps may abort the
  // others. A device that could not be cleared is worth reporting; it is not worth stranding
  // someone in a session belonging to a deleted account.
  let localDataCleared = true;
  try {
    await ports.clearLocalData();
  } catch {
    localDataCleared = false;
  }

  try {
    await ports.signOut();
  } catch {
    // The session is already void server-side; failing to clear it locally changes nothing about
    // whether the account was deleted, and must not be reported as if it did.
  }

  return { ok: true, localDataCleared };
}

/**
 * The word someone types to confirm.
 *
 * Spec §97 asks for reauthentication "if needed". Neither of this app's sign-in methods can
 * provide it: Sign in with Apple has no password to re-enter, and an emailed one-time code would
 * make an irreversible action depend on an inbox arriving — which fails exactly when someone is
 * travelling or has lost access to that address, and teaches nothing about intent anyway.
 *
 * A typed word is the honest substitute. It cannot be hit by accident, it cannot be produced by a
 * mis-tap, and it makes the action deliberate — which is what reauthentication is for here.
 */
export const DELETE_CONFIRMATION_WORD = 'DELETE';

export function isDeletionConfirmed(typed: string): boolean {
  return typed.trim().toLocaleUpperCase() === DELETE_CONFIRMATION_WORD;
}

export type AccountDeletionExplainer = {
  title: string;
  body: string;
  /** Said as separate points, because §97 requires the subscription note to stand on its own. */
  points: string[];
  confirmLabel: string;
};

/**
 * What someone is told before they delete.
 *
 * This is the last screen that exists for them, so it is the last chance to say anything true.
 * It states what goes and that it does not come back, and it does not soften either — a
 * reassurance here would be a reassurance no one is left to correct.
 */
export function accountDeletionExplainer(): AccountDeletionExplainer {
  return {
    title: 'Delete your account',
    body:
      'This removes your account and everything in it — every meal, symptom, bowel, wellbeing ' +
      'and context entry, your journal, and every pattern GutSignal worked out from them. It ' +
      'happens on our servers and on this device.',
    points: [
      'This cannot be undone. There is no copy kept, and no way to bring the account back.',
      'Export your diary first if you want to keep it. Once the account is gone, so is the data ' +
        'it was built from.',
      'Deleting your GutSignal account does not automatically cancel an Apple subscription. ' +
        'You cancel that in your Apple account settings, and it will keep renewing until you do.',
    ],
    confirmLabel: `Type ${DELETE_CONFIRMATION_WORD} to confirm`,
  };
}
