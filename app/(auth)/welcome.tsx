import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Welcome / hero (spec §22).
 *
 * The one deliberately dark screen in the app, following the reference's charcoal onboarding:
 * a calm, confident entry point before the light interior. No pricing here — nobody is asked
 * to pay before they understand what this is (spec §104).
 *
 * Both calls to action lead to the same place. GutSignal is passwordless, so "get started"
 * and "I already have an account" are the same flow — the sign-in screen creates an account
 * if there isn't one. Keeping both labels means a returning user never has to wonder whether
 * "Get started" will overwrite something.
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen inverse>
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: theme.spacing.xxl }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text variant="overline" color="accentOnInverse">
            GUTSIGNAL
          </Text>
        </View>

        <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.xxl }}>
          <Text variant="display" color="onInverse">
            Understand your gut.{'\n'}Stop guessing.
          </Text>
          <Text variant="body" color="onInverseSecondary">
            Track what you eat, how you feel and what changes over time.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Button label="Get started" onPress={() => router.push('/(auth)/sign-in')} />
          <Button
            label="I already have an account"
            variant="ghostOnInverse"
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </View>
      </View>
    </Screen>
  );
}
