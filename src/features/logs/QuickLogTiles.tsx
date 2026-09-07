import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import {
  quickActions,
  type LoggedToday,
  type QuickAction,
  type QuickActionKey,
} from '@/domain/logs/quickActions';
import { useLogWellbeing } from '@/features/logs/useSimpleLogs';
import { useTheme } from '@/theme';

/**
 * One tap from Today to the most likely entry (spec §33).
 *
 * The floating + reaches everything in two taps and still does; this removes one tap from the
 * common case. Ordering is decided in `domain/logs/quickActions.ts`, which never filters — a tile
 * that vanished because the app judged it unlikely would be a tile the user has to hunt for.
 *
 * "Feeling good" saves from here without opening anything (§44). It is the pattern engine's
 * control group, it is the entry people are least likely to bother making, and every step between
 * the intention and the record shrinks the group the whole comparison depends on.
 */

const ROUTE: Record<Exclude<QuickActionKey, 'wellbeing'>, string> = {
  meal: '/log/meal',
  symptom: '/log/symptom',
  bowel: '/log/bowel',
  context: '/log/context',
};

export function QuickLogTiles({ loggedToday, hour }: { loggedToday: LoggedToday; hour: number }) {
  const theme = useTheme();
  const router = useRouter();
  const logWellbeing = useLogWellbeing();

  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const actions = quickActions({ hour, loggedToday });

  const onPress = (action: QuickAction) => {
    setError(null);

    if (!action.immediate) {
      router.push(ROUTE[action.key as Exclude<QuickActionKey, 'wellbeing'>] as '/log/meal');
      return;
    }

    logWellbeing.mutate(
      { occurredAt: new Date(), note: undefined },
      {
        onSuccess: () => setJustSaved(true),
        // A one-tap save that silently does nothing is worse than one that opens a form: the user
        // believes the day is recorded and it is not (§15).
        onError: () => setError('That could not be saved. Try again, or use the + button.'),
      }
    );
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={
              action.immediate ? `${action.label} — saves straight away` : action.label
            }
            accessibilityState={{ busy: action.immediate && logWellbeing.isPending }}
            disabled={action.immediate && logWellbeing.isPending}
            onPress={() => onPress(action)}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surface.card,
              borderWidth: 1,
              borderColor: theme.colors.border.strong,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="body">{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {error !== null ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : justSaved ? (
        // Said once, and only after a save that actually succeeded. Announced politely so
        // VoiceOver confirms the tap did something, since the tile itself does not change.
        <Text variant="caption" color="positive" accessibilityLiveRegion="polite">
          Saved — today is recorded as a good day.
        </Text>
      ) : null}
    </View>
  );
}
