import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { isAppleSignInAvailable, signInWithApple } from '@/services/auth/authService';
import { useTheme } from '@/theme';

/**
 * Sign in (spec §30).
 *
 * Apple is primary on iOS and uses Apple's own button component, because the styling,
 * wording and corner radius are a platform requirement rather than a design choice.
 *
 * The Apple button renders only when the OS reports it as available, so a device or build
 * without the capability sees email sign-in rather than a control that fails when tapped.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();

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

  const handleApple = async () => {
    setBusy(true);
    setError(null);

    const result = await signInWithApple();

    setBusy(false);

    if (!result.ok) {
      // A cancelled sign-in is a decision, not a failure — say nothing.
      if (result.code !== 'cancelled') setError(result.message);
      return;
    }

    // The root boot gate observes the new session and routes; no navigation needed here.
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xxl }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="title">Sign in</Text>
          <Text variant="body" color="secondary">
            GutSignal doesn&apos;t use passwords. Choose Apple, or we&apos;ll email you a code.
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
