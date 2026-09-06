import { useEffect, useState } from 'react';

import { envResult } from '@/config/env';
import { track } from '@/services/analytics/analytics';
import { openDatabase } from '@/services/db/database';
import { captureError } from '@/services/monitoring/monitoring';
import { withTimeout } from '@/utils/promise';

/**
 * Deterministic application boot (spec §20).
 *
 * The full sequence is: validate environment → init local database → restore session →
 * init RevenueCat → identify user → load profile → evaluate onboarding → hydrate cache →
 * start sync → init analytics → route once.
 *
 * Milestone 1 implements the first two steps. Later steps are added at their milestones —
 * this hook is the single place that ordering lives, so boot never becomes a race between
 * providers, and the app routes exactly once (no auth/navigation flicker).
 */
export type AppBootState =
  'booting' | 'unauthenticated' | 'onboarding' | 'ready' | 'configuration_error' | 'maintenance';

export type BootStep = {
  id: string;
  label: string;
  status: 'pending' | 'ok' | 'failed';
  detail?: string;
};

/**
 * Why boot failed. The two causes need different explanations: a missing environment
 * variable is a build problem the developer fixes, while a local database that will not open
 * is a device problem the user might resolve by restarting or freeing space.
 */
export type BootFailureKind = 'environment' | 'storage';

export type BootResult = {
  state: AppBootState;
  steps: BootStep[];
  /** Operator-facing problems. Never contains user data. */
  problems: string[];
  failureKind?: BootFailureKind;
};

/** Generous enough for a cold start on an old device, short enough to fail visibly. */
const DATABASE_OPEN_TIMEOUT_MS = 10_000;

export function useAppBoot(): BootResult {
  const [result, setResult] = useState<BootResult>({
    state: 'booting',
    steps: [
      { id: 'env', label: 'Configuration', status: 'pending' },
      { id: 'db', label: 'Local database', status: 'pending' },
    ],
    problems: [],
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // 1. Environment
      if (!envResult.ok) {
        if (cancelled) return;
        setResult({
          state: 'configuration_error',
          steps: [
            { id: 'env', label: 'Configuration', status: 'failed' },
            { id: 'db', label: 'Local database', status: 'pending' },
          ],
          problems: envResult.problems,
          failureKind: 'environment',
        });
        return;
      }

      // 2. Local database (must succeed — it is the write target for every log).
      // Bounded: a dependency that hangs rather than fails would leave the user on a blank
      // screen with nothing to act on.
      try {
        await withTimeout(openDatabase(), DATABASE_OPEN_TIMEOUT_MS, 'Local database');
      } catch (error) {
        if (cancelled) return;

        // A device where the local database will not open cannot log anything at all, which makes
        // it the failure most worth hearing about and the one a user is least able to report.
        captureError('app_boot', error);

        setResult({
          state: 'configuration_error',
          steps: [
            { id: 'env', label: 'Configuration', status: 'ok' },
            {
              id: 'db',
              label: 'Local database',
              status: 'failed',
              detail: error instanceof Error ? error.message : 'Unknown error',
            },
          ],
          problems: ['The local database could not be opened on this device.'],
          failureKind: 'storage',
        });
        return;
      }

      if (cancelled) return;

      // Reported here rather than on mount: an app whose database will not open did not open
      // either, and counting it as a launch would hide exactly the failure worth measuring.
      track('app_opened');

      // Auth lands at Milestone 3; until then a booted app has no session to restore, so it
      // reports `unauthenticated` rather than pretending to be `ready`.
      setResult({
        state: 'unauthenticated',
        steps: [
          { id: 'env', label: 'Configuration', status: 'ok' },
          { id: 'db', label: 'Local database', status: 'ok' },
        ],
        problems: [],
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
