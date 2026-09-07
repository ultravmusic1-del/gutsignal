import { canShowForm, editLoadState, type EditLoadState } from '../editLoadState';

/**
 * Whether a log sheet may render its form.
 *
 * The case that matters is the one in the middle: an edit whose entry has not arrived. The form
 * would render with its defaults and the entry's real id, and saving would write those defaults
 * over the entry. Every assertion here exists to keep that impossible.
 */

const disabled = { isPending: true, isError: false, data: undefined };
const loading = { isPending: true, isError: false, data: undefined };
const failed = { isPending: false, isError: true, data: undefined };
const absent = { isPending: false, isError: false, data: null };
const loaded = { isPending: false, isError: false, data: { id: 'entry-1' } };

describe('deciding whether a log form is safe to show', () => {
  /**
   * A disabled TanStack query reports `isPending: true` forever. Gating on that alone would hide
   * the form on every new entry, which is the common case — so the id is part of the decision.
   */
  it('treats a sheet with no id as a new entry, however the query reports itself', () => {
    expect(editLoadState(undefined, disabled)).toBe('new');
    expect(editLoadState('', disabled)).toBe('new');
  });

  it('is loading while the entry is being read', () => {
    expect(editLoadState('entry-1', loading)).toBe('loading');
  });

  it('is failed when the read failed', () => {
    expect(editLoadState('entry-1', failed)).toBe('failed');
  });

  // Deleted here, or deleted on another device and pulled since. Not an error, and not editable.
  it('is missing when the read succeeded and the entry is not there', () => {
    expect(editLoadState('entry-1', absent)).toBe('missing');
  });

  it('is ready once the entry has arrived', () => {
    expect(editLoadState('entry-1', loaded)).toBe('ready');
  });

  it('reports a failure rather than a pending read when a query claims both', () => {
    expect(editLoadState('entry-1', { isPending: true, isError: true, data: undefined })).toBe(
      'failed'
    );
  });
});

describe('what may be rendered', () => {
  /**
   * The whole point, stated as one assertion: the only states that may show a form are the two
   * where saving cannot destroy an existing entry.
   */
  it.each([
    ['new', true],
    ['ready', true],
    ['loading', false],
    ['failed', false],
    ['missing', false],
  ] as const)('%s → form shown: %s', (state, expected) => {
    expect(canShowForm(state as EditLoadState)).toBe(expected);
  });

  it('never shows a form for an edit whose entry has not arrived', () => {
    for (const query of [loading, failed, absent]) {
      expect(canShowForm(editLoadState('entry-1', query))).toBe(false);
    }
  });
});
