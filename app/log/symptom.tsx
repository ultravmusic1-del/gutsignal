import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { Button, Card, Chip, Screen, Text, TextField } from '@/components/ui';
import {
  SEVERITY_MAX,
  SEVERITY_MIN,
  severityLabel,
  symptomDraftSchema,
  type SymptomDraft,
} from '@/domain/logs/symptom';
import { SYMPTOMS } from '@/domain/onboarding/options';
import { useLogSymptom } from '@/features/logs/useSymptomLogs';
import { useTheme } from '@/theme';

/**
 * Symptom logging (spec §36).
 *
 * The whole screen is built so saving cannot fail for a reason the user cares about: the write
 * goes to local storage, and the sheet closes as soon as it commits. There is no network in
 * this path and therefore no spinner waiting on one.
 *
 * The full symptom list is shown rather than only the ones chosen during onboarding. Those
 * preferences live on the server and are not mirrored locally yet, so filtering by them would
 * make this screen depend on a connection — which is exactly what logging must never do.
 */

/** Quick offsets, so a symptom felt earlier can be logged honestly without a date picker. */
const WHEN_OPTIONS = [
  { key: 'now', label: 'Just now', minutesAgo: 0 },
  { key: '30m', label: '30 min ago', minutesAgo: 30 },
  { key: '1h', label: '1 hour ago', minutesAgo: 60 },
  { key: '3h', label: '3 hours ago', minutesAgo: 180 },
] as const;

/** The form's own shape: the occurrence instant is resolved at submit, not held in state. */
const formSchema = symptomDraftSchema.omit({ occurredAt: true });
type SymptomFormValues = z.infer<typeof formSchema>;

/**
 * When the entry happened, from the chosen offset.
 *
 * Module scope, not the component body: reading the clock is impure, and it has no business
 * happening during a render.
 */
function occurrenceFrom(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60_000);
}

const SEVERITY_SCALE = Array.from(
  { length: SEVERITY_MAX - SEVERITY_MIN + 1 },
  (_, index) => SEVERITY_MIN + index
);

export default function LogSymptomScreen() {
  const theme = useTheme();
  const router = useRouter();
  const logSymptom = useLogSymptom();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [minutesAgo, setMinutesAgo] = useState<number>(0);

  const { control, handleSubmit, formState } = useForm<SymptomFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { symptomType: 'bloating', severity: 5, note: undefined },
    mode: 'onSubmit',
  });

  // useWatch rather than watch(): the latter cannot be memoized safely across renders.
  const severity = useWatch({ control, name: 'severity' });

  /**
   * The occurrence instant is resolved here, at submit, rather than when the offset is chosen.
   *
   * Two reasons. "30 minutes ago" should mean thirty minutes before the entry is saved, not
   * before the chip was tapped — a user who then spends two minutes writing a note means the
   * former. And reading the clock during render would make this component impure.
   */
  const onSubmit = async (values: SymptomFormValues) => {
    setSubmitError(null);

    const draft: SymptomDraft = { ...values, occurredAt: occurrenceFrom(minutesAgo) };

    try {
      await logSymptom.mutateAsync(symptomDraftSchema.parse(draft));
      router.back();
    } catch {
      // Reaching here means local storage itself refused the write, which is the only failure
      // that can actually lose an entry. It is worth telling the user about plainly.
      setSubmitError('That could not be saved on this device. Please try again.');
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="section">How are you feeling?</Text>
          <Text variant="caption" color="secondary">
            Saved on this device straight away, and synced when you have a connection.
          </Text>
        </View>

        {/* --- What --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            WHAT ARE YOU NOTICING
          </Text>

          <Controller
            control={control}
            name="symptomType"
            render={({ field }) => (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: theme.spacing.xs,
                }}
              >
                {SYMPTOMS.map((symptom) => (
                  <Chip
                    key={symptom.key}
                    label={symptom.label}
                    selected={field.value === symptom.key}
                    onPress={() => field.onChange(symptom.key)}
                  />
                ))}
              </View>
            )}
          />
        </View>

        {/* --- How strongly --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="overline" color="secondary">
              HOW STRONG
            </Text>
            {/* The label is text, not just a colour or a position on a scale (CLAUDE.md §36). */}
            <Text variant="caption" color="secondary">
              {severityLabel(severity)}
            </Text>
          </View>

          <Controller
            control={control}
            name="severity"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', gap: theme.spacing.xxs }}>
                {SEVERITY_SCALE.map((value) => {
                  const isSelected = field.value === value;

                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Severity ${value} of ${SEVERITY_MAX}, ${severityLabel(value)}`}
                      onPress={() => field.onChange(value)}
                      style={({ pressed }) => ({
                        flex: 1,
                        height: 48,
                        borderRadius: theme.radius.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected
                          ? theme.colors.accent.solid
                          : theme.colors.surface.card,
                        borderWidth: 1,
                        borderColor: isSelected
                          ? theme.colors.accent.solid
                          : theme.colors.border.subtle,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text
                        variant="caption"
                        color={isSelected ? 'onAccent' : 'secondary'}
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        </View>

        {/* --- When --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            WHEN
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {WHEN_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                selected={minutesAgo === option.minutesAgo}
                onPress={() => setMinutesAgo(option.minutesAgo)}
              />
            ))}
          </View>
        </View>

        {/* --- Note --- */}
        <Controller
          control={control}
          name="note"
          render={({ field, fieldState }) => (
            <TextField
              label="Anything worth remembering?"
              hint="Optional"
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              multiline
              numberOfLines={3}
              autoCapitalize="sentences"
            />
          )}
        />

        {submitError ? (
          <Card padding="md">
            <Text variant="caption" color="danger">
              {submitError}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label="Save"
            size="large"
            onPress={handleSubmit(onSubmit)}
            loading={formState.isSubmitting}
            disabled={formState.isSubmitting}
            haptic
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={() => router.back()}
            style={({ pressed }) => ({
              alignSelf: 'center',
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.lg,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text variant="button" color="secondary">
              Cancel
            </Text>
          </Pressable>
        </View>

        {/* A quiet reminder that this is a diary, not an assessment (CLAUDE.md §17). */}
        <Text variant="caption" color="tertiary" align="center">
          GutSignal records what you notice. It does not assess or diagnose it.
        </Text>
      </View>
    </Screen>
  );
}
