import { View } from 'react-native';

import { Card, StatusPill, Text, type StatusTone } from '@/components/ui';
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

  return (
    <Card elevation="flat">
      {/* One element, so VoiceOver reads the state and its explanation together rather than as two
          unrelated fragments. */}
      <View accessible accessibilityLabel={`${status.title}. ${status.detail}`}>
        {/* The state as a pill rather than a card title.

            A title styled in the caution colour was the app raising its voice for something that
            is usually not a problem at all — entries waiting to upload is the offline design
            working. A pill is the right size for a state: present, scannable, and not competing
            with the screen's actual headings. */}
        <StatusPill label={status.title} tone={TONE[status.tone]} />
        <View style={{ height: theme.spacing.xs }} />
        <Text variant="caption" color="secondary">
          {status.detail}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Sync tone → pill tone.
 *
 * `working` is neutral, not caution. The distinction the domain already draws is that only
 * `attention` is the user's to act on, and colouring "still uploading" as a warning would teach
 * people that the warning means nothing — which is the whole reason `syncStatus` separates them.
 */
const TONE: Record<ReturnType<typeof syncStatus>['tone'], StatusTone> = {
  settled: 'positive',
  working: 'neutral',
  attention: 'caution',
};
