import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Chip, Screen, Text, TextField } from '@/components/ui';
import {
  CONTEXT_TYPES,
  EXERCISE_LEVELS,
  SCALE_LABELS,
  SCALE_MAX,
  SCALE_MIN,
  contextDraftSchema,
  contextTypeLabel,
  exerciseLabel,
  type ContextDraft,
  type ContextType,
  type ExerciseLevel,
} from '@/domain/logs/context';
import { useContextLogForEdit, useUpdateContextLog } from '@/features/logs/useEditLog';
import { useLogContext } from '@/features/logs/useSimpleLogs';
import { useTheme } from '@/theme';

/**
 * Context logging (spec §47).
 *
 * Stress, sleep and exercise — nothing more. The spec warns in the same breath against building
 * an overwhelming universal health diary, so travel and cycle context are deliberately absent.
 *
 * Hand-rolled rather than React Hook Form: the value field changes shape with the type (a 1–5
 * scale for stress and sleep, a level for exercise), and driving that through a resolver adds
 * ceremony without adding safety. The draft is validated against the same Zod schema on save.
 */

const WHEN_OPTIONS = [
  { key: 'now', label: 'Just now', minutesAgo: 0 },
  { key: '3h', label: '3 hours ago', minutesAgo: 180 },
  { key: 'morning', label: 'This morning', minutesAgo: 360 },
  { key: 'lastnight', label: 'Last night', minutesAgo: 720 },
] as const;

const SCALE = Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => SCALE_MIN + i);

function occurrenceFrom(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60_000);
}

export default function LogContextScreen() {
  const theme = useTheme();
  const router = useRouter();
  const logContext = useLogContext();

  const [contextType, setContextType] = useState<ContextType>('stress');
  const [level, setLevel] = useState<number>(3);
  const [exercise, setExercise] = useState<ExerciseLevel>('moderate');
  const [note, setNote] = useState<string>('');
  // null means "leave the time as it is": now for a new entry, the original for an edit.
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // --- Editing an existing entry (spec §48) ---
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const existing = useContextLogForEdit(id);
  const saveEdit = useUpdateContextLog();

  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);

  // Adjusting state during render rather than in an effect: React applies it before anything
  // is painted, so the form never flashes its defaults before the loaded entry appears. The
  // id guard makes it run once per entry loaded, not on every render.
  if (existing.data && prefilledFrom !== existing.data.id) {
    setPrefilledFrom(existing.data.id);
    setContextType(existing.data.contextType);
    if (existing.data.valueNumeric !== null) setLevel(existing.data.valueNumeric);
    if (existing.data.valueText !== null) setExercise(existing.data.valueText as ExerciseLevel);
    setNote(existing.data.note ?? '');
  }

  const isExercise = contextType === 'exercise';
  const scaleEnds = isExercise ? null : SCALE_LABELS[contextType];

  const onSubmit = async () => {
    setSubmitError(null);
    setSaving(true);

    const draft: ContextDraft = {
      contextType,
      valueNumeric: isExercise ? null : level,
      valueText: isExercise ? exercise : null,
      // An untouched time on an edit keeps the original instant.
      occurredAt:
        minutesAgo === null && existing.data
          ? new Date(existing.data.occurredAt)
          : occurrenceFrom(minutesAgo ?? 0),
      note: note.trim() === '' ? undefined : note.trim(),
    };

    const parsed = contextDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setSaving(false);
      setSubmitError('That entry is incomplete. Please check the value and try again.');
      return;
    }

    try {
      if (id) await saveEdit.mutateAsync({ id, draft: parsed.data });
      else await logContext.mutateAsync(parsed.data);

      router.back();
    } catch {
      setSubmitError('That could not be saved on this device. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="section">{isEditing ? 'Edit this entry' : 'Stress and context'}</Text>
          <Text variant="caption" color="secondary">
            These help GutSignal tell apart things that tend to happen together.
          </Text>
        </View>

        {/* --- Type --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="secondary">
            WHAT ARE YOU RECORDING
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {CONTEXT_TYPES.map((type) => (
              <Chip
                key={type}
                label={contextTypeLabel(type)}
                selected={contextType === type}
                onPress={() => setContextType(type)}
              />
            ))}
          </View>
        </View>

        {/* --- Value: a scale, or a level --- */}
        {isExercise ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="overline" color="secondary">
              HOW MUCH
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              {EXERCISE_LEVELS.map((option) => (
                <Chip
                  key={option}
                  label={exerciseLabel(option)}
                  selected={exercise === option}
                  onPress={() => setExercise(option)}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="overline" color="secondary">
              HOW WOULD YOU RATE IT
            </Text>

            <View style={{ flexDirection: 'row', gap: theme.spacing.xxs }}>
              {SCALE.map((value) => {
                const isSelected = level === value;

                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${value} of ${SCALE_MAX}`}
                    onPress={() => setLevel(value)}
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
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Both ends named, so the scale is never a bare number (CLAUDE.md §36). */}
            {scaleEnds ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" color="tertiary">
                  {scaleEnds[0]}
                </Text>
                <Text variant="caption" color="tertiary">
                  {scaleEnds[1]}
                </Text>
              </View>
            ) : null}
          </View>
        )}

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
                selected={(minutesAgo ?? (isEditing ? null : 0)) === option.minutesAgo}
                onPress={() => setMinutesAgo(option.minutesAgo)}
              />
            ))}
          </View>
        </View>

        <TextField
          label="Anything worth remembering?"
          hint="Optional"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
          autoCapitalize="sentences"
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
            onPress={() => void onSubmit()}
            loading={saving}
            disabled={saving}
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
      </View>
    </Screen>
  );
}
