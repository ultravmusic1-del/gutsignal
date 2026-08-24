import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { sendEmailCode, verifyEmailCode } from '@/services/auth/authService';
import { useTheme } from '@/theme';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * One-time code entry (spec §11).
 *
 * On success nothing navigates from here: the session change propagates through AuthProvider
 * and the root boot gate routes once. Navigating here as well would race the redirect and
 * produce the auth flicker the spec explicitly calls out (§20).
 */
export default function VerifyScreen() {
  const theme = useTheme();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = async (value: string) => {
    if (!email) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await verifyEmailCode(email, value);

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      setCode('');
    }
  };

  const resend = async () => {
    if (!email || cooldown > 0) return;

    setBusy(true);
    setError(null);

    const result = await sendEmailCode(email);

    setBusy(false);
    setCooldown(RESEND_COOLDOWN_SECONDS);

    if (result.ok) {
      setNotice('A new code is on its way.');
    } else {
      setError(result.message);
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xxl }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="title">Check your email</Text>
          <Text variant="body" color="secondary">
            We sent a {CODE_LENGTH}-digit code to {email ?? 'your email address'}.
          </Text>
        </View>

        {error ? (
          <Card>
            <Text variant="body" color="danger" accessibilityRole="alert">
              {error}
            </Text>
          </Card>
        ) : null}

        {notice ? (
          <Text variant="caption" color="positive" accessibilityRole="alert">
            {notice}
          </Text>
        ) : null}

        <TextField
          label="Verification code"
          value={code}
          onChangeText={(value) => {
            const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
            setCode(digits);
            // Submit as soon as the code is complete — nobody should have to find a button
            // after typing six digits.
            if (digits.length === CODE_LENGTH) void submit(digits);
          }}
          placeholder="123456"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          editable={!busy}
          hint="The code expires after a few minutes."
        />

        <Button
          label="Verify"
          loading={busy}
          disabled={code.length !== CODE_LENGTH}
          onPress={() => void submit(code)}
        />

        <Button
          label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          variant="ghost"
          disabled={cooldown > 0 || busy}
          onPress={() => void resend()}
        />
      </View>
    </Screen>
  );
}
