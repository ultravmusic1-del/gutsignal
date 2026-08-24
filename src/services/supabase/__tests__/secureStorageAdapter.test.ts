import { createChunkedStorage, type SecureStoreLike } from '../secureStorageAdapter';

/**
 * A dropped session means an unexplained logout, which in a health diary reads as data loss.
 * The chunking is therefore tested against an in-memory double, including the awkward cases:
 * shrinking values, and a partially-wiped record.
 */
function inMemoryStore(): SecureStoreLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async getItemAsync(key) {
      return map.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      map.set(key, value);
    },
    async deleteItemAsync(key) {
      map.delete(key);
    },
  };
}

const bigSession = (size: number) => 'x'.repeat(size);

describe('chunked secure storage', () => {
  it('round-trips a value smaller than one chunk', async () => {
    const store = inMemoryStore();
    const storage = createChunkedStorage(store);

    await storage.setItem('session', 'hello');

    await expect(storage.getItem('session')).resolves.toBe('hello');
  });

  it('round-trips a value far larger than the SecureStore limit', async () => {
    const store = inMemoryStore();
    const storage = createChunkedStorage(store);
    const value = bigSession(10_000);

    await storage.setItem('session', value);
    const restored = await storage.getItem('session');

    expect(restored).toBe(value);
    expect(restored).toHaveLength(10_000);
  });

  it('splits into multiple keys rather than one oversized value', async () => {
    const store = inMemoryStore();
    const storage = createChunkedStorage(store);

    await storage.setItem('session', bigSession(5_000));

    const chunkKeys = [...store.map.keys()].filter((k) => /\.\d+$/.test(k));
    expect(chunkKeys.length).toBeGreaterThan(1);
    for (const key of chunkKeys) {
      expect(store.map.get(key)!.length).toBeLessThanOrEqual(1536);
    }
  });

  it('does not leave stale chunks when a value shrinks', async () => {
    const store = inMemoryStore();
    const storage = createChunkedStorage(store);

    await storage.setItem('session', bigSession(9_000));
    await storage.setItem('session', 'small');

    await expect(storage.getItem('session')).resolves.toBe('small');

    const chunkKeys = [...store.map.keys()].filter((k) => k.startsWith('session.'));
    expect(chunkKeys).toHaveLength(1);
  });

  it('returns null (not a truncated session) when a chunk is missing', async () => {
    const store = inMemoryStore();
    const storage = createChunkedStorage(store);

    await storage.setItem('session', bigSession(5_000));
    store.map.delete('session.1');

    await expect(storage.getItem('session')).resolves.toBeNull();
    // The damaged record is cleaned up so the next write starts from a known state.
    expect([...store.map.keys()].filter((k) => k.startsWith('session'))).toHaveLength(0);
  });

  it('removes every chunk on removeItem', async () => {
    const store = inMemoryStore();
    const storage = createChunkedStorage(store);

    await storage.setItem('session', bigSession(7_000));
    await storage.removeItem('session');

    expect(store.map.size).toBe(0);
    await expect(storage.getItem('session')).resolves.toBeNull();
  });

  it('returns null for a key that was never written', async () => {
    const storage = createChunkedStorage(inMemoryStore());
    await expect(storage.getItem('missing')).resolves.toBeNull();
  });
});
