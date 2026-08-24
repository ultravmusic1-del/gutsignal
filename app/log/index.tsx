import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Screen, Text } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useLogWellbeing } from '@/features/logs/useSimpleLogs';
import { useTheme } from '@/theme';

type LogRoute = '/log/symptom' | '/log/meal' | '/log/bowel' | '/log/context';

type LogAction = {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  /** A row is only enabled once it actually saves something. No fake buttons (CLAUDE.md §57). */
  available: boolean;
  /** Where it goes, for rows that open a screen. */
  route?: LogRoute;
  /** Rows that save immediately instead of opening anything. */
  immediate?: boolean;
};

/**
 * The log action sheet (spec §35), opened by the floating + control.
 *
 * Presented as a native form sheet so it keeps the platform's drag-to-dismiss and detent
 * behaviour rather than a hand-rolled modal — every logging flow enters through it.
 *
 * "Feeling good" is the exception that proves the rule: spec §44 asks for one tap, so it saves
 * from here and closes rather than opening a screen. It is the pattern engine's control group,
 * and every extra step would shrink it.
 */
const PRIMARY: LogAction[] = [
  {
    key: 'meal',
    label: 'Meal',
    description: 'What you ate, or repeat a previous meal',
    icon: 'plus',
    available: true,
    route: '/log/meal',
  },
  {
    key: 'symptoms',
    label: 'Symptoms',
    description: 'How you are feeling, and how strongly',
    icon: 'plus',
    available: true,
    route: '/log/symptom',
  },
  {
    key: 'bowel',
    label: 'Bowel movement',
    description: 'Type, urgency and how it felt',
    icon: 'plus',
    available: true,
    route: '/log/bowel',
  },
  {
    key: 'wellbeing',
    label: 'Feeling good',
    description: 'One tap — and it counts for comparison later',
    icon: 'check',
    available: true,
    immediate: true,
  },
];

const SECONDARY: LogAction[] = [
  {
    key: 'journal',
    label: 'Quick journal',
    description: 'Write or speak, and confirm what GutSignal picks up',
    icon: 'plus',
    available: false,
  },
  {
    key: 'context',
    label: 'Stress and context',
    description: 'Sleep, stress and other context',
    icon: 'plus',
    available: true,
    route: '/log/context',
  },
];

export default function LogSheet() {
  const theme = useTheme();
  const router = useRouter();
  const logWellbeing = useLogWellbeing();
  const [error, setError] = useState<string | null>(null);

  const recordFeelingGood = async () => {
    setError(null);

    try {
      await logWellbeing.mutateAsync({ occurredAt: new Date(), note: undefined });
      router.back();
    } catch {
      setError('That could not be saved on this device. Please try again.');
    }
  };

  const handlerFor = (action: LogAction): (() => void) | undefined => {
    if (action.immediate) return () => void recordFeelingGood();
    if (action.route) {
      const route = action.route;
      return () => router.push(route);
    }
    return undefined;
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="section">Add an entry</Text>
          <Text variant="caption" color="secondary">
            Everything here works offline — entries save to this device immediately and sync when
            you have a connection.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          {PRIMARY.map((action) => (
            <LogActionRow key={action.key} action={action} onPress={handlerFor(action)} />
          ))}
        </View>

        {error ? (
          <Card padding="md">
            <Text variant="caption" color="danger">
              {error}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="overline" color="secondary">
            MORE
          </Text>
          {SECONDARY.map((action) => (
            <LogActionRow key={action.key} action={action} compact onPress={handlerFor(action)} />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={({ pressed }) => ({
            alignSelf: 'center',
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text variant="button" color="accent">
            Close
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function LogActionRow({
  action,
  compact = false,
  onPress,
}: {
  action: LogAction;
  compact?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();

  const card = (
    <Card
      elevation={action.available ? 'card' : 'flat'}
      padding={compact ? 'md' : 'lg'}
      style={{ opacity: action.available ? 1 : 0.55 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent.subtle,
          }}
        >
          <Icon name={action.icon} size={20} color={theme.colors.accent.text} />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="cardTitle">{action.label}</Text>
          <Text variant="caption" color="secondary">
            {action.description}
          </Text>
        </View>

        {!action.available ? (
          <Text variant="caption" color="tertiary">
            Soon
          </Text>
        ) : (
          <Icon
            name={action.immediate ? 'check' : 'chevronRight'}
            size={20}
            color={theme.colors.text.tertiary}
          />
        )}
      </View>
    </Card>
  );

  // A row that does nothing is announced as a disabled button rather than being silently inert —
  // the user is told it exists and is not ready, not left tapping at nothing.
  if (onPress === undefined) {
    return (
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityHint={action.description}
        accessibilityState={{ disabled: true }}
      >
        {card}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={action.description}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {card}
    </Pressable>
  );
}
