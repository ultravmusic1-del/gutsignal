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
      <View style={{ flex: 1, paddingBottom: theme.spacing.xxl }}>
        {/* The wordmark sits at the top, where a reader starts, rather than centred in the upper
            half. Centred, it produced a void above it *and* below it, so neither the brand nor the
            headline anchored anything and the screen read as unfinished rather than as spare. */}
        <View style={{ paddingTop: theme.spacing.sm }}>
          <Text variant="overline" color="accentOnInverse">
            GUTSIGNAL
          </Text>
        </View>

        {/* One deliberate void, between the mark and the message. */}
        <View style={{ flex: 1 }} />

        <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.xxl }}>
          <Text variant="display" color="onInverse">
            Understand your gut.{'\n'}Stop guessing.
          </Text>

          {/* A hairline between the claim and what backs it.

              Borrowed from the reference boards, where a rule under a heading does the work that
              would otherwise need more whitespace than a phone screen has. It is short rather than
              full-bleed: a line to the edge divides a screen, and this one is meant to connect two
              things. */}
          <View
            style={{
              width: 48,
              height: 1,
              backgroundColor: theme.colors.accent.onInverse,
              opacity: 0.5,
            }}
          />

          <Text variant="body" color="onInverseSecondary">
            Track what you eat, how you feel and what changes over time.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Button label="Get started" onPress={() => router.push('/(onboarding)')} />
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
