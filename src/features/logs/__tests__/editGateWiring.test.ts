import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every log sheet that can edit an entry gates its form on that entry having loaded.
 *
 * The decision itself is unit-tested in `editLoadState.test.ts`. This checks the wiring, which is
 * the half that was actually broken: five screens each loaded an entry for editing and none of
 * them looked at whether the load had finished, so an edit opened over a slow or failed read
 * rendered the form with its defaults and the real entry's id. Saving wrote the defaults over the
 * entry.
 *
 * A string check is crude. It is also the only thing that will notice the sixth log sheet, which
 * will be written by copying one of these five and can just as easily copy the version that was
 * wrong. The failure mode is silent data loss, so a crude guard is worth having.
 */

const LOG_DIR = join(process.cwd(), 'app', 'log');

const sheets = readdirSync(LOG_DIR).filter((name) => name.endsWith('.tsx'));

/** A sheet that loads an entry to edit. `index.tsx` is the action list and loads nothing. */
const editable = sheets.filter((name) =>
  readFileSync(join(LOG_DIR, name), 'utf8').includes('ForEdit(')
);

describe('log sheets that edit an existing entry', () => {
  // A discovery list that silently comes back empty would make every assertion below vacuous.
  it('finds all five', () => {
    expect(editable.sort()).toEqual([
      'bowel.tsx',
      'context.tsx',
      'meal.tsx',
      'symptom.tsx',
      'wellbeing.tsx',
    ]);
  });

  it.each(editable)('%s refuses to render its form until the entry has loaded', (name) => {
    const source = readFileSync(join(LOG_DIR, name), 'utf8');

    expect(source).toContain('editLoadState(id, existing)');
    expect(source).toContain('canShowForm(');
    expect(source).toContain('<EditLoadGate');
  });

  /**
   * The gate has to come before the form, not after it.
   *
   * Placed below the `return (` it would be unreachable, which is a mistake that reads as correct
   * in review and compiles cleanly.
   */
  it.each(editable)('%s gates before it returns the form', (name) => {
    const source = readFileSync(join(LOG_DIR, name), 'utf8');

    expect(source.indexOf('canShowForm(')).toBeLessThan(source.indexOf('\n  return ('));
  });
});
