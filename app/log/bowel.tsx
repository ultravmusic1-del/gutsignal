import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { Button, Card, Chip, Screen, Text, TextField } from '@/components/ui';
import {
  BRISTOL_TYPES,
  DIFFICULTY_LEVELS,
  URGENCY_LEVELS,
  bowelDraftSchema,
  bristolDescription,
  difficultyLabel,
  urgencyLabel,
  type BowelDraft,
} from '@/domain/logs/bowel';
import { useLogBowel } from '@/features/logs/useSimpleLogs';
import { useTheme } from '@/theme';

/**
 * Bowel movement logging (spec §45).
 *
 * The Bristol scale is presented as its own descriptions rather than the usual illustrations —
 * the spec asks for original representations, and a short physical description is clearer on a
 * phone than a small drawing anyway.
 *
 * Nothing here interprets the entry. "Type 6" describes one observation; it is never a statement
 * about the person (CLAUDE.md §17).
 */

const WHEN_OPTIONS = [
  { key: 'now', label: 'Just now', minutesAgo: 0 },
  { key: '1h', label: '1 hour ago', minutesAgo: 60 },
  { key: '3h', label: '3 hours ago', minutesAgo: 180 },
  { key: 'morning', label: 'This morning', minutesAgo: 360 },
] as const;

const formSchema = bowelDraftSchema.omit({ occurredAt: true });
type BowelFormValues = z.infer<typeof formSchema>;

/** Module scope: reading the clock is impure and does not belong in a render. */
function occurrenceFrom(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60_000);
}

export default function LogBowelScreen() {
  const theme = useTheme();
  const router = useRouter();
  const logBowel = useLogBowel();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [minutesAgo, setMinutesAgo] = useState<number>(0);

  const { control, handleSubmit, formState } = useForm<BowelFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bristolType: 4,
      urgency: 'low',
      difficulty: 'easy',
      incomplete: false,
      note: undefined,
    },
    mode: 'onSubmit',
  });

  const bristolType = useWatch({ control, name: 'bristolType' });

  const onSubmit = async (values: BowelFormValues) => {
    setSubmitError(null);

    const draft: BowelDraft = { ...values, occurredAt: occurrenceFrom(minutesAgo) };

    try {
      await logBowel.mutateAsync(bowelDraftSchema.parse(draft));
      router.back();
    } catch {
      setSubmitError('That could not be saved on this device. Please try again.');
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="section">Bowel movement</Text>
          <Text variant="caption" color="secondary">
            Saved on this device straight away, and synced when you have a connection.
          </Text>
        </View>

        {/* --- Bristol type --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="overline" color="secondary">
              TYPE
            </Text>
            {/* The description names the selection, so the number never stands alone (§36). */}
            <Text variant="caption" color="secondary">
              {bristolDescription(bristolType)}
            </Text>
          </View>

          <Controller
            control={control}
            name="bristolType"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', gap: theme.spacing.xxs }}>
                {BRISTOL_TYPES.map((type) => {
                  const isSelected = field.value === type;

                  return (
                    <Pressable
                      key={type}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Type ${type}, ${bristolDescription(type)}`}
                      onPress={() => field.onChange(type)}
                      style={({ pressed }) => ({
                        flex: 1,
                        height: 52,
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
                        {type}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        </View>

        {/* --- Urgency --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            URGENCY
          </Text>
          <Controller
            control={control}
            name="urgency"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {URGENCY_LEVELS.map((level) => (
                  <Chip
                    key={level}
                    label={urgencyLabel(level)}
                    selected={field.value === level}
                    onPress={() => field.onChange(level)}
                  />
                ))}
              </View>
            )}
          />
        </View>

        {/* --- Difficulty --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            HOW IT WENT
          </Text>
          <Controller
            control={control}
            name="difficulty"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {DIFFICULTY_LEVELS.map((level) => (
                  <Chip
                    key={level}
                    label={difficultyLabel(level)}
                    selected={field.value === level}
                    onPress={() => field.onChange(level)}
                  />
                ))}
              </View>
            )}
          />

          <Controller
            control={control}
            name="incomplete"
            render={({ field }) => (
              <Chip
                label="Felt unfinished"
                selected={field.value}
                onPress={() => field.onChange(!field.value)}
              />
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
              numberOfLines={2}
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

        <Text variant="caption" color="tertiary" align="center">
          GutSignal records what you observed. It does not interpret or diagnose it.
        </Text>
      </View>
    </Screen>
  );
}
