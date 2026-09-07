import * as SecureStore from 'expo-secure-store';

import type { SecureStoreLike } from './secureStorageAdapter';

/**
 * The real thing: iOS Keychain, Android Keystore.
 *
 * Split into its own module so the **web** development surface can substitute a different backing
 * store without the session-chunking logic above it knowing or caring. `secureStore.web.ts` is
 * that substitute; this file is what every build of the actual app uses.
 */
export const secureStore: SecureStoreLike = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: SecureStore.deleteItemAsync,
};
