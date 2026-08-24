import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { isAppleSignInAvailable, signInWithApple } from '@/services/auth/authService';
import { useTheme } from '@/theme';

/**
 * Account creation (spec §30) — the last step before finishing.
 *
 * Deliberately placed AFTER the questions, per the spec's own ordering: the user invests a
 * minute in describing their situation before being asked to create anything. Their answers
 * live in the in-memory draft until the final step writes them.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable().then((available) => {
      if (active) setAppleAvailable(available);
    });
    return () => {
      active = false;
    };
  }, []);

  // Once a session exists — by either route — continue to the final step, which saves the
  // draft. `replace` so the back gesture cannot land on a sign-in screen for a signed-in user.
  useEffect(() => {
    if (session) router.replace('/(onboarding)/complete');
  }, [session, router]);

  const handleApple = async () => {
    setBusy(true);
    setError(null);

    const result = await signInWithApple();

    setBusy(false);
    if (!result.ok && result.code !== 'cancelled') setError(result.message);
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xxl }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="title">Save your answers</Text>
          <Text variant="body" color="secondary">
            Create an account so your logs are backed up and stay with you across devices. GutSignal
            doesn&apos;t use passwords.
          </Text>
        </View>

        {error ? (
          <Card>
            <Text variant="body" color="danger" accessibilityRole="alert">
              {error}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          {appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                theme.scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={theme.radius.pill}
              style={{ height: 56 }}
              onPress={() => void handleApple()}
            />
          ) : null}

          <Button
            label="Continue with email"
            variant={appleAvailable ? 'secondary' : 'primary'}
            disabled={busy}
            onPress={() => router.push('/(auth)/email')}
          />
        </View>

        <Text variant="caption" color="tertiary">
          Your logs are private to your account. GutSignal never uses health information for
          advertising.
        </Text>
      </View>
    </Screen>
  );
}
