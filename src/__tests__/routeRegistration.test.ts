import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every route file is registered in the root navigator.
 *
 * This exists because of a real defect. In Milestone 6, `app/log/meal.tsx` was created but never
 * added to the root `<Stack>`, so meal logging opened as a full-screen push instead of a form
 * sheet — and **typecheck, lint, 292 tests and a full iOS bundle all passed while it was broken.**
 * Expo Router discovers routes from the filesystem, so an unregistered route still works; it just
 * silently ignores the presentation, header and detent options meant for it.
 *
 * Nothing else in the suite can catch that, because nothing else in the suite renders a navigator.
 * A string check on the layout file is crude, but it is the only thing standing between the next
 * screen and the same silent failure.
 */

const APP_DIR = join(process.cwd(), 'app');
const ROOT_LAYOUT = join(APP_DIR, '_layout.tsx');

const isRouteFile = (name: string) =>
  (name.endsWith('.tsx') || name.endsWith('.ts')) && !name.startsWith('_');

const routeName = (file: string) => file.replace(/\.(tsx|ts)$/, '');

/**
 * The names the root layout is expected to declare.
 *
 * A parenthesised directory is a route group and is registered under its own name — the layout
 * inside it owns its children. A plain directory has no layout of its own, so each of its files
 * is a route the root navigator must know about individually.
 */
function expectedRouteNames(): string[] {
  const names: string[] = [];

  for (const entry of readdirSync(APP_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('(')) {
        names.push(entry.name);
        continue;
      }

      for (const child of readdirSync(join(APP_DIR, entry.name))) {
        if (isRouteFile(child)) names.push(`${entry.name}/${routeName(child)}`);
      }
      continue;
    }

    if (isRouteFile(entry.name)) names.push(routeName(entry.name));
  }

  return names.sort();
}

describe('root navigator registration', () => {
  const layout = readFileSync(ROOT_LAYOUT, 'utf8');
  const declared = [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map(
    (match) => match[1] as string
  );

  it.each(expectedRouteNames())('declares %s', (name) => {
    expect(declared).toContain(name);
  });

  // A duplicate is how the Milestone 6 fix could have gone wrong in the other direction: two
  // entries for one route, with the second silently winning.
  it('declares each route exactly once', () => {
    expect(declared).toHaveLength(new Set(declared).size);
  });

  // A name that matches no file is a route that will never render — usually a rename that
  // updated the file and not the layout.
  it('declares nothing that does not exist', () => {
    const expected = expectedRouteNames();

    for (const name of declared) {
      expect(expected).toContain(name);
    }
  });
});
