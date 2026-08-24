import Constants from 'expo-constants';
import { View } from 'react-native';

import { Card, Divider, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * You — profile, settings, reports, subscription, privacy (spec §18).
 *
 * Milestone 2 delivers the shell. Every row here is INFORMATION, not a control: sign-in
 * arrives in M3, settings screens later, subscription in M12. A tappable row that led
 * nowhere would be the dead button the spec forbids, so those rows simply do not exist yet.
 */
export default function YouScreen() {
  const theme = useTheme();

  return (
    <Screen scroll floatingNav>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
        <Text variant="title">You</Text>

        <Card>
          <Text variant="overline" color="secondary">
            ACCOUNT
          </Text>
          <View style={{ height: theme.spacing.xs }} />
          <Text variant="cardTitle">Not signed in</Text>
          <View style={{ height: 2 }} />
          <Text variant="body" color="secondary">
            Entries you make are stored on this device. Signing in will back them up and sync them
            across your devices.
          </Text>
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
