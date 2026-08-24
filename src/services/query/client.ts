import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query owns SERVER state only (CLAUDE.md §10). Local logs are read from SQLite,
 * which is why these defaults are conservative: on a phone with intermittent connectivity we
 * would rather serve slightly stale server data than spin.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 2,
        // React Native has no window focus; refetch is driven by app state and by explicit
        // invalidation from the sync engine instead.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
