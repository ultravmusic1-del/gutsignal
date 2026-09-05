import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Divider, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { planSignOut, signOutPrompt, unknownSignOutPrompt } from '@/features/auth/signOutPlan';
import { useSync } from '@/features/sync/SyncProvider';
import { signOut } from '@/services/auth/authService';
import { openDatabase } from '@/services/db/database';
import { pendingSyncCountFor } from '@/services/db/localAccount';
import { useTheme } from '@/theme';

/**
 * You — profile, settings, reports, subscription, privacy (spec §18).
 *
 * Sign-out is real from Milestone 3. The remaining rows are still INFORMATION rather than
 * controls: settings screens, export and account deletion arrive at their own milestones, and
 * a tappable row that led nowhere would be the dead button the spec forbids.
 */
export default function YouScreen() {
  const theme = useTheme();
  const { session, userId } = useAuth();
  const { flush } = useSync();
  const [signingOut, setSigningOut] = useState(false);

  const completeSignOut = () => {
    void signOut().then((result) => {
      setSigningOut(false);
      if (!result.ok) Alert.alert('Sign out failed', result.message);
      // On success the session change routes the app back to welcome.
    });
  };

  /**
   * Sign-out, with one last chance to keep what has not been sent (`CLAUDE.md` §15).
   *
   * The order matters. Flush first, then count, then ask — warning about entries a final sync is
   * about to deliver would train people to dismiss the warning, and a dismissed warning is worse
   * than none. This is the only place in the app that waits on the network, and it does so because
   * it is the last moment the person whose entries these are is still here to be told.
   */
  const confirmSignOut = () => {
    setSigningOut(true);

    void (async () => {
      await flush();

      let outstanding = 0;
      try {
        if (userId !== null) {
          outstanding = await pendingSyncCountFor(await openDatabase(), userId);
        }
      } catch {
        // Unreadable rather than zero. Treating a failed count as "nothing outstanding" would
        // turn a storage problem into a silent discard, which is the one outcome §15 forbids.
        outstanding = -1;
      }

      const prompt =
        outstanding < 0 ? unknownSignOutPrompt() : signOutPrompt(planSignOut(outstanding));

      Alert.alert(prompt.title, prompt.body, [
        { text: 'Cancel', style: 'cancel', onPress: () => setSigningOut(false) },
        { text: prompt.confirmLabel, style: 'destructive', onPress: completeSignOut },
      ]);
    })();
  };

  return (
    <Screen scroll floatingNav>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
        <Text variant="title">You</Text>

        <Card>
          <Text variant="overline" color="secondary">
            ACCOUNT
          </Text>
          <View style={{ height: theme.spacing.xs }} />
          <Text variant="cardTitle">{session?.user.email ?? 'Signed in'}</Text>
          <View style={{ height: 2 }} />
          <Text variant="body" color="secondary">
            Your entries are stored on this device and backed up to your account.
          </Text>
          <View style={{ height: theme.spacing.md }} />
          <Button
            label="Sign out"
            variant="secondary"
            size="medium"
            loading={signingOut}
            haptic={false}
            onPress={confirmSignOut}
          />
        </Card>

        <Card>
          <Text variant="overline" color="secondary">
            YOUR DATA
          </Text>
          <View style={{ height: theme.spacing.xs }} />
          <Text variant="body" color="secondary">
            Your logs are private by default. GutSignal never uses health information for
            advertising, and symptom, food and journal content is never sent to product analytics.
          </Text>
          <View style={{ paddingVertical: theme.spacing.md }}>
            <Divider />
          </View>
          <Text variant="body" color="secondary">
            You will always be able to export everything you have logged, and to delete your account
            and its data from within the app.
          </Text>
        </Card>

        <Card elevation="flat">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" color="secondary">
              Version
            </Text>
            <Text variant="caption" color="secondary">
              {Constants.expoConfig?.version ?? 'unknown'}
            </Text>
          </View>
          <View style={{ height: theme.spacing.xxs }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" color="secondary">
              Appearance
            </Text>
            <Text variant="caption" color="secondary">
              {theme.scheme === 'dark' ? 'Dark' : 'Light'} (follows system)
            </Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
