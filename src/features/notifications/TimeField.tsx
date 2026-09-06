import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import type { TimeOfDay } from '@/domain/notifications/preferences';
import { useTheme } from '@/theme';

/**
 * Formats a time for display and for VoiceOver.
 *
 * 24-hour, zero-padded, because the app is not localised yet and a fake 12-hour clock with an
 * English "am" would be a worse guess than the unambiguous form.
 */
export function formatTimeOfDay(time: TimeOfDay): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/** Wraps rather than clamps: stepping back from 00:00 lands on 23:00, which is what a clock does. */
export function stepTime(time: TimeOfDay, field: 'hour' | 'minute', by: number): TimeOfDay {
  if (field === 'hour') {
    return { ...time, hour: (time.hour + by + 24) % 24 };
  }

  return { ...time, minute: (time.minute + by + 60) % 60 };
}

/** Minutes move in quarters. A reminder at 09:07 is a setting nobody wanted and had to tap for. */
export const MINUTE_STEP = 15;

type StepButtonProps = {
  label: string;
  glyph: string;
  onPress: () => void;
};

function StepButton({ label, glyph, onPress }: StepButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      // 44pt, per §36. A stepper is the control most likely to be tapped repeatedly and in a
      // hurry, so it is the one where a small target is felt most.
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surface.card,
        borderWidth: 1,
        borderColor: theme.colors.border.strong,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="body">{glyph}</Text>
    </Pressable>
  );
}

export type TimeFieldProps = {
  /** What time this is, for VoiceOver: "Morning check-in time". */
  label: string;
  value: TimeOfDay;
  onChange: (next: TimeOfDay) => void;
};

/**
 * A time, adjusted by stepping.
 *
 * ## Why a stepper rather than a wheel
 *
 * The platform time picker lives in `@react-native-community/datetimepicker`, a dependency this
 * screen would be the only user of. §38 asks whether a small local component would do instead, and
 * here it plainly does: there are three times in the whole app, all of them coarse.
 *
 * The stepper is also the more accessible of the two. A picker wheel is awkward under VoiceOver
 * and unusable under Switch Control; four labelled buttons are neither. If a fourth screen ever
 * needs a real picker the trade changes, and this is small enough to delete.
 */
export function TimeField({ label, value, onChange }: TimeFieldProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        minHeight: 44,
      }}
    >
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>

      <StepButton
        label={`${label}: one hour earlier`}
        glyph="−"
        onPress={() => onChange(stepTime(value, 'hour', -1))}
      />

      {/*
        One live-updating readout for both steppers. Marked as a status so VoiceOver announces the
        new time after a step, rather than leaving the user to go and find it.
      */}
      <Text
        variant="cardTitle"
        accessibilityRole="text"
        accessibilityLabel={`${label} is ${formatTimeOfDay(value)}`}
        accessibilityLiveRegion="polite"
        style={{ minWidth: 68, textAlign: 'center' }}
      >
        {formatTimeOfDay(value)}
      </Text>

      <StepButton
        label={`${label}: one hour later`}
        glyph="+"
        onPress={() => onChange(stepTime(value, 'hour', 1))}
      />

      <StepButton
        label={`${label}: fifteen minutes later`}
        glyph="⋯"
        onPress={() => onChange(stepTime(value, 'minute', MINUTE_STEP))}
      />
    </View>
  );
}
