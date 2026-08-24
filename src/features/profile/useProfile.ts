import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { fetchProfile, type ProfileResult } from '@/services/profile/profileService';

export const profileQueryKey = (userId: string) => ['profile', userId] as const;

/**
 * The signed-in user's profile. Server state, so it belongs to TanStack Query rather than a
 * context (CLAUDE.md §10).
 *
 * `retry: false` on purpose: the boot gate waits on this, and a retry storm on a bad
 * connection would hold the user on a blank screen. One attempt, then decide.
 */
export function useProfile() {
  const { userId } = useAuth();

  return useQuery<ProfileResult>({
    queryKey: userId ? profileQueryKey(userId) : ['profile', 'anonymous'],
    queryFn: () => fetchProfile(userId as string),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
