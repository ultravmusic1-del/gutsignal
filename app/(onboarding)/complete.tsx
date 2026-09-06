import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { track } from '@/services/analytics/analytics';
import { useAuth } from '@/features/auth/AuthProvider';
import { draftSnapshot, useOnboardingDraft } from '@/features/onboarding/draftStore';
import { profileQueryKey } from '@/features/profile/useProfile';
import { saveOnboarding, type SaveOnboardingResult } from '@/services/profile/profileService';
import { useTheme } from '@/theme';

/**
 * Completion (spec §32).
 *
 * This is where the draft finally reaches the database. `onboarding_completed_at` is written
 * last, so a partial failure leaves the user flagged as needing onboarding rather than
 * dropping them into an app whose personalization silently never saved.
 *
 * The save is a mutation rather than an effect with local state: retry, in-flight status and
 * failure all come from one place, and the draft is snapshotted at call time so it cannot
 * drift mid-write.
 *
 * The copy promises consistency, not results — the spec is explicit that GutSignal must not
 * promise an insight will appear after N days (§32).
 */
export default function CompleteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  const draft = useOnboardingDraft();
  const reset = useOnboardingDraft((state) => state.reset);

  const save = useMutation<SaveOnboardingResult>({
    mutationFn: () => {
      if (!userId) throw new Error('No session');
      return saveOnboarding(userId, draftSnapshot(draft));
    },
    onSuccess: async (result) => {
      if (result.ok && userId) {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
      }
    },
  });

  const { mutate } = save;

  useEffect(() => {
    if (userId) mutate();
  }, [userId, mutate]);

  const failed = save.isError || (save.data !== undefined && !save.data.ok);
  const saved = save.data?.ok === true;
  const message = save.data && !save.data.ok ? save.data.message : null;

  const finish = () => {
    // On the way out, not on arrival: reaching this screen is not finishing onboarding — the save
    // can still fail, and someone can still close the app here.
    track('onboarding_completed');
    reset();
    // Back to the boot gate, which re-reads the profile and routes into the app.
    router.replace('/');
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xxl }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="overline" color="accent">
            {saved ? 'ALL SET' : 'ALMOST THERE'}
          </Text>
          <Text variant="display">{failed ? "We couldn't save that" : "You're ready."}</Text>
          <Text variant="body" color="secondary">
            {failed
              ? 'Your answers are still here. Try again when you have a connection.'
              : 'The more consistently you log, the more useful your personal patterns can become.'}
          </Text>
        </View>

        {failed ? (
          <Card>
            <Text variant="body" color="danger" accessibilityRole="alert">
              {message ?? 'Your answers could not be saved.'}
            </Text>
          </Card>
        ) : null}

        {failed ? (
          <Button label="Try again" onPress={() => save.mutate()} loading={save.isPending} />
        ) : (
          <Button label="Log my first entry" loading={save.isPending} onPress={finish} />
        )}

        {saved ? (
          <Button label="Explore GutSignal" variant="ghost" onPress={finish} haptic={false} />
        ) : null}
      </View>
    </Screen>
  );
}
