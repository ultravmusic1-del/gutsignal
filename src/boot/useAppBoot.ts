import { useEffect, useState } from 'react';

import { envResult } from '@/config/env';
import { openDatabase } from '@/services/db/database';

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

export type BootResult = {
  state: AppBootState;
  steps: BootStep[];
  /** Operator-facing problems (misconfiguration). Never contains user data. */
  problems: string[];
};

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
        });
        return;
      }

      // 2. Local database (must succeed — it is the write target for every log)
      try {
        await openDatabase();
      } catch (error) {
        if (cancelled) return;
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
          problems: ['The local database could not be opened.'],
        });
        return;
      }

      if (cancelled) return;

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
