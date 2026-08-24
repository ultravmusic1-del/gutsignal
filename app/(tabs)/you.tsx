import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Divider, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { signOut } from '@/services/auth/authService';
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
  const { session } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'Your entries stay on this device and in your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void signOut().then((result) => {
            setSigningOut(false);
            if (!result.ok) Alert.alert('Sign out failed', result.message);
            // On success the session change routes the app back to welcome.
          });
        },
      },
    ]);
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
