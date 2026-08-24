import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { sendEmailCode } from '@/services/auth/authService';
import { useTheme } from '@/theme';
import { z } from 'zod';

/**
 * Email entry for passwordless sign-in (spec §11).
 *
 * Validation runs on the client for a fast, kind error message — and the server validates
 * again regardless. Client-side checks are a courtesy, never a control (CLAUDE.md §43).
 */
const schema = z.object({
  email: z
    .string()
    .min(1, 'Enter your email address')
    .email("That doesn't look like an email address"),
});

type FormValues = z.infer<typeof schema>;

export default function EmailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
    mode: 'onSubmit',
  });

  const onSubmit = async ({ email }: FormValues) => {
    setSubmitError(null);

    const result = await sendEmailCode(email);

    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }

    router.push({ pathname: '/(auth)/verify', params: { email: email.trim() } });
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xxl }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="title">What&apos;s your email?</Text>
          <Text variant="body" color="secondary">
            We&apos;ll send a six-digit code. No password to remember.
          </Text>
        </View>

        {submitError ? (
          <Card>
            <Text variant="body" color="danger" accessibilityRole="alert">
              {submitError}
            </Text>
          </Card>
        ) : null}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email address"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={formState.errors.email?.message}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => void handleSubmit(onSubmit)()}
              editable={!formState.isSubmitting}
            />
          )}
        />

        <Button
          label="Send code"
          loading={formState.isSubmitting}
          onPress={() => void handleSubmit(onSubmit)()}
        />
      </View>
    </Screen>
  );
}
