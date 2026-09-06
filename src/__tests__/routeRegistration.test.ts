import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every route file is registered in the navigator that owns it.
 *
 * This exists because of a real defect. In Milestone 6, `app/log/meal.tsx` was created but never
 * added to the root `<Stack>`, so meal logging opened as a full-screen push instead of a form
 * sheet — and **typecheck, lint, 292 tests and a full iOS bundle all passed while it was broken.**
 * Expo Router discovers routes from the filesystem, so an unregistered route still works; it just
 * silently ignores the presentation, header and detent options meant for it.
 *
 * Nothing else in the suite can catch that, because nothing else in the suite renders a navigator.
 * A string check on the layout files is crude, but it is the only thing standing between the next
 * screen and the same silent failure.
 *
 * The first version of this test checked the root layout alone and assumed a parenthesised
 * directory always owns its children. It does not: a group without a `_layout` is not a navigator,
 * and Expo Router hoists its files into the parent. `(auth)` and `(onboarding)` were in exactly
 * that state — twelve screens registered nowhere, under a root declaration that matched no route,
 * with this test green. So the rule below is derived from where the `_layout` files actually are.
 */

const APP_DIR = join(process.cwd(), 'app');

const isRouteFile = (name: string) =>
  (name.endsWith('.tsx') || name.endsWith('.ts')) && !name.startsWith('_');

const routeName = (file: string) => file.replace(/\.(tsx|ts)$/, '');

const layoutPath = (dir: string) => join(dir, '_layout.tsx');

const isNavigator = (dir: string) => existsSync(layoutPath(dir));

/** Every directory holding a `_layout.tsx`, starting at the app root. */
function navigatorDirs(dir: string = APP_DIR): string[] {
  const found = isNavigator(dir) ? [dir] : [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...navigatorDirs(join(dir, entry.name)));
  }

  return found;
}

/**
 * The names the navigator in `dir` has to declare.
 *
 * A subdirectory with a `_layout` is one screen under its own name — it owns its children. A
 * subdirectory without one contributes each of its files individually, because Expo Router hoists
 * them into this navigator. That is true whether or not the directory name is parenthesised.
 */
function expectedRouteNames(dir: string): string[] {
  const names: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const child = join(dir, entry.name);

      if (isNavigator(child)) {
        names.push(entry.name);
        continue;
      }

      for (const file of readdirSync(child)) {
        if (isRouteFile(file)) names.push(`${entry.name}/${routeName(file)}`);
      }
      continue;
    }

    if (isRouteFile(entry.name)) names.push(routeName(entry.name));
  }

  return names.sort();
}

/**
 * Layout source with its comments removed.
 *
 * The scan below is a regular expression over source text, so a `<Stack.Screen name="…">` written
 * inside a comment counts as a declaration. That is not hypothetical: the doc comments on the two
 * new group layouts quote the root's declaration to explain it, and this test failed on them
 * before it could fail on anything real.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** `<Stack.Screen name="…">` and `<Tabs.Screen name="…">` alike — the check is about the name. */
function declaredRouteNames(dir: string): string[] {
  const layout = withoutComments(readFileSync(layoutPath(dir), 'utf8'));

  return [...layout.matchAll(/<(?:Stack|Tabs)\.Screen\s+name="([^"]+)"/g)].map(
    (match) => match[1] as string
  );
}

const label = (dir: string) => relative(APP_DIR, dir) || '(root)';

describe.each(navigatorDirs().map((dir) => [label(dir), dir] as const))(
  '%s navigator',
  (_name, dir) => {
    const declared = declaredRouteNames(dir);

    it.each(expectedRouteNames(dir))('declares %s', (name) => {
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
      const expected = expectedRouteNames(dir);

      for (const name of declared) {
        expect(expected).toContain(name);
      }
    });
  }
);

/**
 * Every navigator the app has, named.
 *
 * `describe.each` over a discovered list silently tests nothing if the discovery breaks, and a
 * suite that passes because it ran zero cases is worse than no suite. This is the tripwire.
 */
it('finds every navigator in the app', () => {
  expect(navigatorDirs().map(label).sort()).toEqual(['(auth)', '(onboarding)', '(root)', '(tabs)']);
});
