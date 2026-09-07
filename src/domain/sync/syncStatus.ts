/**
 * Telling a user what has and has not reached the server, in words.
 *
 * ## Why this is a product feature rather than a debug readout
 *
 * The whole promise is that logs are not lost (`CLAUDE.md` §61). A diary that quietly stops
 * syncing looks exactly like one that is syncing perfectly: entries save, the timeline fills,
 * nothing goes red. The user finds out when they reinstall.
 *
 * ## The tone rules
 *
 * **Pending is not an error.** An entry waiting to upload is the offline design working, and
 * dressing it as a warning teaches people that the warning means nothing. Only a *failure* is a
 * failure, and only some failures are the user's to act on.
 *
 * **Offline is not a failure either.** A journey through a tunnel is not a broken sync. The engine
 * already declines to report those to analytics for the same reason.
 *
 * **Never claim more than is known.** "Everything is backed up" is a promise about a server this
 * function cannot see. It says what was last confirmed and when.
 */

export type SyncFailureReason = 'network' | 'auth' | 'conflict' | 'unknown';

export type SyncStatusInput = {
  /** Records written on this device the server has not confirmed. */
  pendingCount: number;
  /** When a run last completed without a failure, or null if none has. */
  lastSyncedAt: string | null;
  /** Why the most recent run failed, or null if it did not. */
  lastFailure: SyncFailureReason | null;
  now: Date;
};

export type SyncStatusTone = 'settled' | 'working' | 'attention';

export type SyncStatus = {
  tone: SyncStatusTone;
  title: string;
  detail: string;
  /** True only where the user can actually do something. */
  actionable: boolean;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "2 hours ago", "3 days ago".
 *
 * Coarse on purpose. A diary does not need seconds, and a precise-looking timestamp invites the
 * user to reason about a number that is only as accurate as the last app launch.
 */
export function describeAge(lastSyncedAt: string | null, now: Date): string {
  if (lastSyncedAt === null) return 'not yet';

  const age = now.getTime() - Date.parse(lastSyncedAt);
  if (Number.isNaN(age) || age < 0) return 'just now';

  if (age < 2 * MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} minutes ago`;
  if (age < DAY) {
    const hours = Math.floor(age / HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  const days = Math.floor(age / DAY);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * What a failure means for the person, not for the engine.
 *
 * `network` is deliberately not actionable: there is nothing to do about a tunnel, and asking
 * someone to check their connection while they are on a train is the kind of advice that makes an
 * app feel stupid. `auth` is the one that genuinely needs them.
 */
const FAILURE: Record<SyncFailureReason, { title: string; detail: string; actionable: boolean }> = {
  network: {
    title: 'Waiting for a connection',
    detail: 'Your entries are saved on this device and will upload when you are back online.',
    actionable: false,
  },
  auth: {
    title: 'Sign in again to keep syncing',
    detail:
      'Your entries are safe on this device, but GutSignal cannot reach your account until you sign in again.',
    actionable: true,
  },
  conflict: {
    title: 'Sorting out a difference between devices',
    // The reassurance is not boilerplate: "changed in two places" is the one failure that sounds
    // like something might be overwritten, so it is the one that most needs saying.
    detail:
      'The same entry was changed in two places. Both versions are saved on this device, and GutSignal will retry on its own.',
    actionable: false,
  },
  unknown: {
    title: 'Syncing is not working',
    detail:
      'Your entries are safe on this device. GutSignal will keep retrying — if this lasts more than a day, it is worth reporting.',
    actionable: false,
  },
};

export function syncStatus({
  pendingCount,
  lastSyncedAt,
  lastFailure,
  now,
}: SyncStatusInput): SyncStatus {
  const age = describeAge(lastSyncedAt, now);

  // A failure outranks a count. Someone with four pending entries and an expired session needs to
  // hear about the session; the four are a symptom of it.
  if (lastFailure !== null) {
    const copy = FAILURE[lastFailure];
    return {
      tone: copy.actionable ? 'attention' : 'working',
      title: copy.title,
      detail: `${copy.detail} Last confirmed ${age}.`,
      actionable: copy.actionable,
    };
  }

  if (pendingCount > 0) {
    return {
      tone: 'working',
      title: `${pendingCount} ${pendingCount === 1 ? 'entry' : 'entries'} still uploading`,
      detail: `Saved on this device. Last confirmed ${age}.`,
      actionable: false,
    };
  }

  if (lastSyncedAt === null) {
    return {
      tone: 'working',
      title: 'Nothing to upload yet',
      detail: 'Entries you make are saved on this device first, then sent when there is a signal.',
      actionable: false,
    };
  }

  return {
    tone: 'settled',
    // What is known, not what is hoped: this says everything written here has been confirmed, and
    // says nothing about what a server has done with it since.
    title: 'Everything on this device has been sent',
    detail: `Last confirmed ${age}.`,
    actionable: false,
  };
}
