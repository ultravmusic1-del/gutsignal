import type { SecureStoreLike } from './secureStorageAdapter';

/**
 * A stand-in for the Keychain, for the browser only.
 *
 * ## Read this before reusing it for anything
 *
 * **This is not secure storage.** `localStorage` is readable by any script on the origin and
 * survives in plain text on disk. It is here because `expo-secure-store` has no web
 * implementation at all — the module resolves, and every call throws
 * `getValueWithKeyAsync is not a function`, which takes down the auth provider and with it every
 * screen behind it.
 *
 * That is acceptable **only** because of what the web target is: a place to render GutSignal's own
 * UI for inspection during development (`docs/UI_DEVELOPMENT_WORKFLOW.md`). It is never built for
 * production, never handed to a user, and the sessions it holds are development sessions.
 *
 * The rule this file lives under: nothing in the app may start treating web as a real platform
 * without replacing this first. It is named `.web.ts` rather than hidden behind a `Platform.OS`
 * branch precisely so that it cannot be reached by accident from a native build — the bundler
 * simply never includes it.
 */

const unavailable = () => typeof localStorage === 'undefined';

export const secureStore: SecureStoreLike = {
  async getItemAsync(key: string): Promise<string | null> {
    if (unavailable()) return null;
    return localStorage.getItem(key);
  },

  async setItemAsync(key: string, value: string): Promise<void> {
    if (unavailable()) return;
    localStorage.setItem(key, value);
  },

  async deleteItemAsync(key: string): Promise<void> {
    if (unavailable()) return;
    localStorage.removeItem(key);
  },
};
