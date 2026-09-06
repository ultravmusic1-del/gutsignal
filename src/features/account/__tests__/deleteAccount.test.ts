import {
  accountDeletionExplainer,
  DELETE_CONFIRMATION_WORD,
  isDeletionConfirmed,
  runAccountDeletion,
  type DeleteAccountPorts,
} from '../deleteAccount';

/**
 * Account deletion (spec §97, `CLAUDE.md` §58).
 *
 * The ordering is the whole design, so it is what these tests are about. The server holds the
 * only copy that outlives the device, so it goes first: if that call fails, nothing else may
 * happen and the user must be left with an account they can still use and try again from.
 * Wiping the device first would produce the one outcome with no recovery — local data gone,
 * server data intact, and no session left to reach it with.
 */

function ports(overrides: Partial<DeleteAccountPorts> = {}) {
  const calls: string[] = [];

  const base: DeleteAccountPorts = {
    deleteOnServer: async () => {
      calls.push('server');
      return { ok: true };
    },
    clearLocalData: async () => {
      calls.push('local');
    },
    signOut: async () => {
      calls.push('signOut');
    },
  };

  return { calls, ports: { ...base, ...overrides } };
}

describe('running an account deletion', () => {
  it('deletes on the server, then clears the device, then ends the session', async () => {
    const { calls, ports: p } = ports();

    const result = await runAccountDeletion(p);

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['server', 'local', 'signOut']);
  });

  // The failure that matters. A server error must leave the account usable and the diary intact,
  // so the person can try again — rather than stranding them with a wiped device and a live
  // account they can no longer sign in to inspect.
  it('touches nothing on the device when the server call fails', async () => {
    const { calls, ports: p } = ports({
      deleteOnServer: async () => {
        calls.push('server');
        return { ok: false, message: 'network unreachable' };
      },
    });

    const result = await runAccountDeletion(p);

    expect(result).toEqual({
      ok: false,
      failedAt: 'server',
      message: 'network unreachable',
    });
    expect(calls).toEqual(['server']);
    expect(calls).not.toContain('local');
    expect(calls).not.toContain('signOut');
  });

  /**
   * Once the server has deleted the account there is no going back, and no account left to sign
   * in to. Leaving the person signed in to something that no longer exists would strand the app
   * in a state with no route out, so the session ends even when clearing the device failed.
   */
  it('still ends the session when clearing the device fails, and says so', async () => {
    const { calls, ports: p } = ports({
      clearLocalData: async () => {
        calls.push('local');
        throw new Error('sqlite is locked');
      },
    });

    const result = await runAccountDeletion(p);

    expect(result).toEqual({ ok: true, localDataCleared: false });
    expect(calls).toEqual(['server', 'local', 'signOut']);
  });

  // The account is already gone server-side, so a failed sign-out is not a failed deletion.
  it('reports success when only the sign-out call fails', async () => {
    const { ports: p } = ports({
      signOut: async () => {
        throw new Error('no session to clear');
      },
    });

    await expect(runAccountDeletion(p)).resolves.toEqual({ ok: true, localDataCleared: true });
  });
});

describe('confirming a deletion', () => {
  it('accepts only the exact word, ignoring case and surrounding space', () => {
    expect(isDeletionConfirmed(DELETE_CONFIRMATION_WORD)).toBe(true);
    expect(isDeletionConfirmed(` ${DELETE_CONFIRMATION_WORD.toLowerCase()} `)).toBe(true);
  });

  it('rejects anything else, including the empty string', () => {
    expect(isDeletionConfirmed('')).toBe(false);
    expect(isDeletionConfirmed('   ')).toBe(false);
    expect(isDeletionConfirmed('delete my account')).toBe(false);
    expect(isDeletionConfirmed('yes')).toBe(false);
  });
});

describe('what the user is told before deleting', () => {
  const explainer = accountDeletionExplainer();

  // Spec §97 requires this to be said separately, and it is the one thing a user cannot discover
  // afterwards: the account is gone, so there is nothing left to read the warning from.
  it('says that deleting does not cancel an Apple subscription', () => {
    const text = explainer.points.join(' ');

    expect(text).toMatch(/subscription/i);
    expect(text).toMatch(/does not (automatically )?cancel/i);
  });

  it('says the deletion cannot be undone, and names what goes', () => {
    const text = [explainer.title, explainer.body, ...explainer.points].join(' ');

    expect(text).toMatch(/cannot be undone|permanent/i);
    expect(text).toMatch(/log|entr|diary/i);
  });

  // §17: nothing about the user's health, and no reassurance the flow cannot deliver.
  it('promises nothing it cannot keep', () => {
    const text = [explainer.title, explainer.body, ...explainer.points].join(' ');

    expect(text).not.toMatch(/recover|restore|undo it later|we keep a copy/i);
  });
});
