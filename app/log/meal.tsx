import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { Button, Card, Chip, Divider, Screen, Text, TextField } from '@/components/ui';
import {
  MEAL_SIZES,
  MEAL_TAGS,
  mealDraftSchema,
  mealSizeLabel,
  mealSummary,
  mealTagLabel,
  parseItemList,
  type MealDraft,
} from '@/domain/logs/meal';
import { formatLocalTime } from '@/domain/time/occurrence';
import { useLogMeal, useRecentMeals, useRepeatMeal } from '@/features/logs/useMealLogs';
import { useTheme } from '@/theme';

/**
 * Meal logging — manual entry and repeat (spec §36, §40, §41).
 *
 * The spec's other three modes (photo, describe, speak) are AI-driven and arrive with the AI
 * architecture at Milestone 7. Repeat is deterministic, so it lands here, where §40 expects it
 * to carry real day-to-day usage.
 *
 * As with symptoms, the write goes to local storage and the sheet closes as soon as it commits.
 * No network is involved in saving.
 */

/** Quick offsets, shared by both repeating and manual entry. */
const WHEN_OPTIONS = [
  { key: 'now', label: 'Just now', minutesAgo: 0 },
  { key: '1h', label: '1 hour ago', minutesAgo: 60 },
  { key: '3h', label: '3 hours ago', minutesAgo: 180 },
  { key: '6h', label: '6 hours ago', minutesAgo: 360 },
] as const;

/** The form's own shape: the occurrence instant is resolved at submit, not held in state. */
const formSchema = mealDraftSchema.omit({ occurredAt: true, items: true }).extend({
  /** Typed as one field and split on save, because that is how people write a meal down. */
  itemText: z.string(),
});

type MealFormValues = z.infer<typeof formSchema>;

/** Module scope: reading the clock is impure and has no business happening during a render. */
function occurrenceFrom(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60_000);
}

export default function LogMealScreen() {
  const theme = useTheme();
  const router = useRouter();
  const logMeal = useLogMeal();
  const repeat = useRepeatMeal();
  const recent = useRecentMeals();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [minutesAgo, setMinutesAgo] = useState<number>(0);

  const { control, handleSubmit, formState } = useForm<MealFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: '', itemText: '', mealSize: 'medium', tags: [], note: undefined },
    mode: 'onSubmit',
  });

  const itemText = useWatch({ control, name: 'itemText' });
  const parsedItems = parseItemList(itemText ?? '');

  const onSubmit = async (values: MealFormValues) => {
    setSubmitError(null);

    const draft: MealDraft = {
      title: values.title,
      items: parseItemList(values.itemText),
      mealSize: values.mealSize,
      tags: values.tags,
      note: values.note,
      occurredAt: occurrenceFrom(minutesAgo),
    };

    try {
      await logMeal.mutateAsync(mealDraftSchema.parse(draft));
      router.back();
    } catch {
      setSubmitError('That could not be saved on this device. Please try again.');
    }
  };

  const onRepeat = async (sourceMealId: string) => {
    setSubmitError(null);

    try {
      await repeat.mutateAsync({ sourceMealId, occurredAt: occurrenceFrom(minutesAgo) });
      router.back();
    } catch {
      setSubmitError('That meal could not be repeated. Please try again.');
    }
  };

  const recentMeals = recent.data ?? [];

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="section">What did you eat?</Text>
          <Text variant="caption" color="secondary">
            Saved on this device straight away, and synced when you have a connection.
          </Text>
        </View>

        {/* --- When: applies to a repeat and to a new meal alike --- */}
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

        {/* --- Repeat (spec §40) --- */}
        {recentMeals.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="overline" color="secondary">
              HAD THIS AGAIN?
            </Text>

            {recentMeals.map((meal) => (
              <Pressable
                key={meal.id}
                accessibilityRole="button"
                accessibilityLabel={`Repeat ${meal.title}`}
                accessibilityHint={mealSummary(meal)}
                disabled={repeat.isPending}
                onPress={() => void onRepeat(meal.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Card elevation="flat" padding="md">
                  <View style={{ gap: 2 }}>
                    <Text variant="cardTitle">{meal.title}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {mealSummary(meal)}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {meal.occurredLocalDate} · {formatLocalTime(meal.occurredAt, meal.occurredTz)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ))}

            <Divider />
            <Text variant="caption" color="tertiary" align="center">
              or record something new
            </Text>
          </View>
        ) : null}

        {/* --- Title --- */}
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => (
            <TextField
              label="What was it?"
              placeholder="Chicken shawarma"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="sentences"
            />
          )}
        />

        {/* --- Items --- */}
        <View style={{ gap: theme.spacing.xs }}>
          <Controller
            control={control}
            name="itemText"
            render={({ field, fieldState }) => (
              <TextField
                label="What was in it?"
                hint="One per line, or separated by commas. Optional."
                placeholder={'chicken\nflatbread\ngarlic sauce'}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                multiline
                numberOfLines={3}
                autoCapitalize="none"
              />
            )}
          />

          {/* Shows exactly what will be recorded, so the split is never a surprise. */}
          {parsedItems.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xxs }}>
              {parsedItems.map((item) => (
                <Chip key={item} label={item} />
              ))}
            </View>
          ) : null}
        </View>

        {/* --- Size --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            HOW MUCH
          </Text>
          <Controller
            control={control}
            name="mealSize"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                {MEAL_SIZES.map((size) => (
                  <Chip
                    key={size}
                    label={mealSizeLabel(size)}
                    selected={field.value === size}
                    onPress={() => field.onChange(size)}
                  />
                ))}
              </View>
            )}
          />
        </View>

        {/* --- Tags --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            ANYTHING ELSE TRUE OF IT
          </Text>
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {MEAL_TAGS.map((tag) => {
                  const selected = field.value.includes(tag);

                  return (
                    <Chip
                      key={tag}
                      label={mealTagLabel(tag)}
                      selected={selected}
                      onPress={() =>
                        field.onChange(
                          selected
                            ? field.value.filter((existing) => existing !== tag)
                            : [...field.value, tag]
                        )
                      }
                    />
                  );
                })}
              </View>
            )}
          />
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
            label="Save meal"
            size="large"
            onPress={handleSubmit(onSubmit)}
            loading={formState.isSubmitting}
            disabled={formState.isSubmitting || repeat.isPending}
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
          GutSignal records what you ate. It does not judge it or count calories.
        </Text>
      </View>
    </Screen>
  );
}
