import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

type LogAction = {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  /** A row is only enabled once it actually saves something. No fake buttons (CLAUDE.md §57). */
  available: boolean;
  /** Where it goes. Present only for available rows. */
  route?: '/log/symptom';
};

/**
 * The log action sheet (spec §35), opened by the floating + control.
 *
 * Presented as a native form sheet so it keeps the platform's drag-to-dismiss and detent
 * behaviour rather than a hand-rolled modal — this is the "modal/sheet architecture" the
 * milestone asks for, and every later logging flow enters through it.
 */
const PRIMARY: LogAction[] = [
  {
    key: 'meal',
    label: 'Meal',
    description: 'Photo, description, voice or repeat a previous meal',
    icon: 'plus',
    available: false,
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
    available: false,
  },
  {
    key: 'wellbeing',
    label: 'Feeling good',
    description: 'One tap — and it counts for comparison later',
    icon: 'check',
    available: false,
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
    available: false,
  },
];

export default function LogSheet() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="section">Add an entry</Text>
          <Text variant="caption" color="secondary">
            Symptom logging works offline — entries save to this device immediately. The remaining
            types are still being built.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          {PRIMARY.map((action) => (
            <LogActionRow
              key={action.key}
              action={action}
              onPress={action.route ? () => router.push(action.route as '/log/symptom') : undefined}
            />
          ))}
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="overline" color="secondary">
            MORE
          </Text>
          {SECONDARY.map((action) => (
            <LogActionRow key={action.key} action={action} compact />
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
          <Icon name="chevronRight" size={20} color={theme.colors.text.tertiary} />
        )}
      </View>
    </Card>
  );

  // A row that does nothing is announced as a disabled button rather than being silently
  // inert — the user is told it exists and is not ready, not left tapping at nothing.
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
