import * as SecureStore from 'expo-secure-store';

/**
 * Session storage for Supabase Auth, backed by the iOS Keychain / Android Keystore.
 *
 * Why this is not a two-line wrapper: SecureStore warns above ~2048 bytes per value, and a
 * Supabase session (access token + refresh token + user object) routinely exceeds that. So
 * values are split into fixed-size chunks with an index record, and reassembled on read.
 *
 * The chunking is pure string manipulation and is unit-tested against an in-memory store —
 * losing a session silently would log the user out and, worse, could look like data loss.
 */

const CHUNK_SIZE = 1536;
const INDEX_SUFFIX = '__chunks';

/** Minimal surface we need from SecureStore, so tests can supply an in-memory double. */
export type SecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export function createChunkedStorage(store: SecureStoreLike) {
  const indexKey = (key: string) => `${key}${INDEX_SUFFIX}`;
  const chunkKey = (key: string, i: number) => `${key}.${i}`;

  const readChunkCount = async (key: string): Promise<number> => {
    const raw = await store.getItemAsync(indexKey(key));
    if (raw === null) return 0;
    const count = Number.parseInt(raw, 10);
    return Number.isInteger(count) && count > 0 ? count : 0;
  };

  const clearChunks = async (key: string, count: number): Promise<void> => {
    await Promise.all(
      Array.from({ length: count }, (_, i) => store.deleteItemAsync(chunkKey(key, i)))
    );
    await store.deleteItemAsync(indexKey(key));
  };

  return {
    async getItem(key: string): Promise<string | null> {
      const count = await readChunkCount(key);
      if (count === 0) return null;

      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) => store.getItemAsync(chunkKey(key, i)))
      );

      // A missing chunk means a partially-written or partially-wiped value. Treat the whole
      // record as absent rather than handing Supabase a truncated session.
      if (parts.some((part) => part === null)) {
        await clearChunks(key, count);
        return null;
      }

      return parts.join('');
    },

    async setItem(key: string, value: string): Promise<void> {
      const previousCount = await readChunkCount(key);

      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      if (chunks.length === 0) chunks.push('');

      await Promise.all(chunks.map((chunk, i) => store.setItemAsync(chunkKey(key, i), chunk)));
      await store.setItemAsync(indexKey(key), String(chunks.length));

      // Remove chunks left over from a longer previous value.
      if (previousCount > chunks.length) {
        await Promise.all(
          Array.from({ length: previousCount - chunks.length }, (_, i) =>
            store.deleteItemAsync(chunkKey(key, chunks.length + i))
          )
        );
      }
    },

    async removeItem(key: string): Promise<void> {
      const count = await readChunkCount(key);
      await clearChunks(key, count);
    },
  };
}

export const secureStorageAdapter = createChunkedStorage({
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: SecureStore.deleteItemAsync,
});
