/**
 * Whether a log sheet is safe to show a form for.
 *
 * ## The bug this exists to close
 *
 * Every log screen doubles as its own edit screen: with no `id` it creates, with an `id` it loads
 * the entry, calls `reset(...)` and saves an update. None of them checked whether that load had
 * finished or succeeded.
 *
 * So an edit opened while the read was still in flight — or after it failed — rendered the form
 * with its **default** values and the real entry's id still in scope. Saving then wrote the
 * defaults over a real entry: a severity the user never chose, a note deleted, a time replaced.
 * Silent, irreversible, and indistinguishable from the user having done it themselves. That is
 * exactly the loss `CLAUDE.md` §15 and §54 put above everything else.
 *
 * ## Why `isPending` alone is not the test
 *
 * The query is `enabled: Boolean(id)`, and a disabled TanStack query reports `isPending: true`
 * forever — it has no data and never will. Gating on `isPending` would therefore hide the form on
 * every *new* entry, which is the common case. The id has to be part of the decision.
 */

export type EditLoadState =
  /** No id — a new entry. Nothing to load, form is safe. */
  | 'new'
  /** Reading the entry. */
  | 'loading'
  /** Read succeeded and the entry is not there: deleted here or on another device. */
  | 'missing'
  /** The read itself failed. */
  | 'failed'
  /** Loaded. Form is safe and `reset` will have run. */
  | 'ready';

export function editLoadState(
  id: string | undefined,
  query: { isPending: boolean; isError: boolean; data: unknown }
): EditLoadState {
  if (id === undefined || id === '') return 'new';

  // Error before pending: a disabled or failed query can report both, and "it failed" is the more
  // useful of the two to say.
  if (query.isError) return 'failed';
  if (query.isPending) return 'loading';
  if (query.data === null || query.data === undefined) return 'missing';

  return 'ready';
}

/**
 * Whether the form may be rendered at all.
 *
 * A type predicate rather than a plain boolean, so the compiler knows what is left in the other
 * branch. That is what lets `EditLoadGate` accept only the three states it has copy for — adding a
 * state without deciding what the sheet shows for it becomes a compile error rather than a blank
 * screen.
 */
export function canShowForm(state: EditLoadState): state is 'new' | 'ready' {
  return state === 'new' || state === 'ready';
}
