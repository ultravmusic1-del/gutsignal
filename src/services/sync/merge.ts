/**
 * Conflict resolution for rows arriving from the server (docs/PROJECT_PLAN.md §6).
 *
 * Policy: last writer wins per record on `updated_at`, except that a local change which has
 * not yet been pushed always outranks the server — the server has not been told about it yet,
 * so its copy is not "older", it is uninformed. Logs are single-owner data, so record-level
 * resolution is sufficient; there is no field-level merge to reason about.
 */

export type MergeDecision = 'apply_remote' | 'keep_local';

type Timestamped = {
  id: string;
  updatedAt: string;
};

export function resolveIncoming({
  remote,
  local,
  hasPendingLocalChange,
}: {
  remote: Timestamped;
  local: Timestamped | null;
  hasPendingLocalChange: boolean;
}): MergeDecision {
  // An unpushed local edit is never overwritten. Its own push will resolve the difference.
  if (hasPendingLocalChange) return 'keep_local';

  // Never seen here before — take it.
  if (local === null) return 'apply_remote';

  const localAt = Date.parse(local.updatedAt);
  const remoteAt = Date.parse(remote.updatedAt);

  // A corrupt local timestamp cannot win; the server's copy is the recoverable one.
  if (Number.isNaN(localAt)) return 'apply_remote';

  // A corrupt remote timestamp must not overwrite good local data.
  if (Number.isNaN(remoteAt)) return 'keep_local';

  // Ties keep local, so a repeated pull cannot churn rows the device already holds.
  return remoteAt > localAt ? 'apply_remote' : 'keep_local';
}
