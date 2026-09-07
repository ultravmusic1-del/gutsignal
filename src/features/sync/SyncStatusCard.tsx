import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { syncStatus } from '@/domain/sync/syncStatus';
import { useSync } from '@/features/sync/SyncProvider';
import { useTheme } from '@/theme';

/**
 * Whether this diary has left the device, in words (spec §61).
 *
 * On You rather than Today: it sits beside sign-out, which is the one place the app already
 * reasons out loud about unsent entries, and it is not something anyone should have to read
 * before logging a symptom.
 *
 * The tone is decided in `domain/sync/syncStatus.ts`, and the rule the colour here follows from is
 * that **pending is not an error**. An entry waiting to upload is the offline design working; only
 * an expired session is the user's to act on. Colour never carries that alone — the title says
 * which state this is, and the tone only tints it (§36).
 */
export function SyncStatusCard() {
  const theme = useTheme();
  const { pendingCount, lastSyncedAt, lastFailure } = useSync();

  const status = syncStatus({ pendingCount, lastSyncedAt, lastFailure, now: new Date() });

  const titleColor = status.tone === 'attention' ? 'caution' : 'primary';

  return (
    <Card elevation="flat">
      {/* One element, so VoiceOver reads the state and its explanation together rather than as two
          unrelated fragments. */}
      <View accessible accessibilityLabel={`${status.title}. ${status.detail}`}>
        <Text variant="cardTitle" color={titleColor}>
          {status.title}
        </Text>
        <View style={{ height: theme.spacing.xxs }} />
        <Text variant="caption" color="secondary">
          {status.detail}
        </Text>
      </View>
    </Card>
  );
}
