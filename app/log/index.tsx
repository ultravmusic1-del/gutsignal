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
  /** Wired up in Milestone 5. Until then the row is honestly disabled, not silently dead. */
  available: boolean;
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
    available: false,
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
            Entry types are in place. Logging itself is being built next — nothing here saves
            anything yet.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          {PRIMARY.map((action) => (
            <LogActionRow key={action.key} action={action} />
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

function LogActionRow({ action, compact = false }: { action: LogAction; compact?: boolean }) {
  const theme = useTheme();

  return (
    <Card
      elevation={action.available ? 'card' : 'flat'}
      padding={compact ? 'md' : 'lg'}
      accessible
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={action.description}
      accessibilityState={{ disabled: !action.available }}
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
}
