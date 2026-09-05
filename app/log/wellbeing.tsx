import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Chip, Screen, Text, TextField } from '@/components/ui';
import { wellbeingDraftSchema, type WellbeingDraft } from '@/domain/logs/wellbeing';
import { useUpdateWellbeingLog, useWellbeingLogForEdit } from '@/features/logs/useEditLog';
import { useLogWellbeing } from '@/features/logs/useSimpleLogs';
import { useTheme } from '@/theme';

/**
 * Wellbeing — recording that a moment was fine (spec §44).
 *
 * Recording one normally takes a single tap from the log sheet and never opens this screen.
 * This exists for the two cases a tap cannot cover: correcting an entry from the timeline, and
 * adding a note to say what "good" looked like.
 *
 * There is still no rating here. Grading a good day would turn the control group into another
 * severity scale, and the engine needs it to mean exactly one thing: the user said this was
 * fine.
 */

const WHEN_OPTIONS = [
  { key: 'now', label: 'Just now', minutesAgo: 0 },
  { key: '3h', label: '3 hours ago', minutesAgo: 180 },
  { key: 'morning', label: 'This morning', minutesAgo: 360 },
  { key: 'lastnight', label: 'Last night', minutesAgo: 720 },
] as const;

function occurrenceFrom(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60_000);
}

export default function LogWellbeingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const logWellbeing = useLogWellbeing();

  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const existing = useWellbeingLogForEdit(id);
  const saveEdit = useUpdateWellbeingLog();

  const [note, setNote] = useState('');
  // null means "leave the time as it is": now for a new entry, the original for an edit.
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);

  // Adjusting state during render rather than in an effect: React applies it before anything
  // is painted, so the form never flashes its defaults before the loaded entry appears. The
  // id guard makes it run once per entry loaded, not on every render.
  if (existing.data && prefilledFrom !== existing.data.id) {
    setPrefilledFrom(existing.data.id);
    setNote(existing.data.note ?? '');
  }

  const onSubmit = async () => {
    setSubmitError(null);
    setSaving(true);

    const draft: WellbeingDraft = {
      occurredAt:
        minutesAgo === null && existing.data
          ? new Date(existing.data.occurredAt)
          : occurrenceFrom(minutesAgo ?? 0),
      note: note.trim() === '' ? undefined : note.trim(),
    };

    const parsed = wellbeingDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setSaving(false);
      setSubmitError('That time has not happened yet. Please pick another.');
      return;
    }

    try {
      if (id) await saveEdit.mutateAsync({ id, draft: parsed.data });
      else await logWellbeing.mutateAsync(parsed.data);

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
          <Text variant="section">{isEditing ? 'Edit this entry' : 'Feeling good'}</Text>
          <Text variant="caption" color="secondary">
            Recording the good stretches is what lets GutSignal compare them with the difficult ones
            later.
          </Text>
        </View>

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
          label="What did good look like?"
          hint="Optional"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
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
            label={isEditing ? 'Save changes' : 'Save'}
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
