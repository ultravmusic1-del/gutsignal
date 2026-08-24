/**
 * Record identifiers.
 *
 * Every log's primary key is generated **on the device**, before anything touches the network.
 * That is what makes the sync upsert idempotent: a retry after an ambiguous timeout writes the
 * same id, so it updates rather than creating a duplicate log (docs/PROJECT_PLAN.md §4.1, §6).
 */

import { randomUUID } from 'expo-crypto';

/** A new UUID v4, from the platform CSPRNG. */
export function newId(): string {
  return randomUUID();
}

/** Function shape for injecting a deterministic id generator in tests. */
export type IdGenerator = () => string;
