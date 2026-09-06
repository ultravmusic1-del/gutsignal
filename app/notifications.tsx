import { Linking, View } from 'react-native';

import { Button, Card, Screen, Text, ToggleRow } from '@/components/ui';
import type { ReminderKind } from '@/domain/notifications/preferences';
import { TimeField } from '@/features/notifications/TimeField';
import { useNotificationSettings } from '@/features/notifications/useNotificationSettings';
import { useTheme } from '@/theme';

/**
 * Notification settings (spec §75).
 *
 * ## The permission is asked for here, and nowhere else
 *
 * iOS gives an app one prompt per install. Spending it at launch, before anyone knows what
 * GutSignal does, converts a permission the user might have granted into one they can only restore
 * by going to Settings. So the OS sheet opens from a button on this screen and only after the card
 * above it has said what the reminders are (spec §74).
 *
 * ## Why a suppressed reminder is called out
 *
 * A reminder inside quiet hours never fires. The toggle stays where the user put it — overruling
 * their switch would be worse — but the row says the reminder will not arrive. An enabled control
 * that silently does nothing is the failure §75 is written against.
 */

const SUPPRESSED_NOTE = 'This falls inside your quiet hours, so it will not be sent.';

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const settings = useNotificationSettings();

  const suppressed = new Set<ReminderKind>(settings.plan.suppressed.map((entry) => entry.kind));
  const noteFor = (kind: ReminderKind) => (suppressed.has(kind) ? SUPPRESSED_NOTE : undefined);

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="title">Reminders</Text>
          <Text variant="body" color="secondary">
            A diary is only useful if it gets written. Reminders are optional, and you control every
            one of them.
          </Text>
        </View>

        {settings.isPermissionLoading ? null : settings.permission === 'granted' ? null : (
          <PermissionCard
            permission={settings.permission}
            onRequest={() => settings.requestPermission()}
            isRequesting={settings.isRequestingPermission}
          />
        )}

        <Card>
          <Text variant="cardTitle">Daily</Text>
          <View style={{ height: theme.spacing.sm }} />

          <ToggleRow
            label="Morning check-in"
            description="Quick gut check-in?"
            warning={noteFor('morning_check_in')}
            value={settings.preferences.morningCheckIn}
            onValueChange={(morningCheckIn) => settings.update({ morningCheckIn })}
          />

          {settings.preferences.morningCheckIn ? (
            <TimeField
              label="Morning check-in time"
              value={settings.preferences.morningAt}
              onChange={(morningAt) => settings.update({ morningAt })}
            />
          ) : null}

          <View style={{ height: theme.spacing.sm }} />

          <ToggleRow
            label="Evening check-in"
            description="Anything worth logging today?"
            warning={noteFor('evening_check_in')}
            value={settings.preferences.eveningCheckIn}
            onValueChange={(eveningCheckIn) => settings.update({ eveningCheckIn })}
          />

          {settings.preferences.eveningCheckIn ? (
            <TimeField
              label="Evening check-in time"
              value={settings.preferences.eveningAt}
              onChange={(eveningAt) => settings.update({ eveningAt })}
            />
          ) : null}
        </Card>

        <Card>
          <Text variant="cardTitle">Weekly</Text>
          <View style={{ height: theme.spacing.sm }} />

          <ToggleRow
            label="Weekly review"
            description="A look back at your week."
            warning={noteFor('weekly_review')}
            value={settings.preferences.weeklyReview}
            onValueChange={(weeklyReview) => settings.update({ weeklyReview })}
          />

          {settings.preferences.weeklyReview ? (
            <TimeField
              label="Weekly review time"
              value={settings.preferences.weeklyReviewAt}
              onChange={(weeklyReviewAt) => settings.update({ weeklyReviewAt })}
            />
          ) : null}
        </Card>

        <Card>
          <Text variant="cardTitle">Quiet hours</Text>
          <View style={{ height: theme.spacing.sm }} />

          <ToggleRow
            label="Quiet hours"
            description="Nothing is delivered inside this window."
            value={settings.preferences.quietHours.enabled}
            onValueChange={(enabled) =>
              settings.update({ quietHours: { ...settings.preferences.quietHours, enabled } })
            }
          />

          {settings.preferences.quietHours.enabled ? (
            <>
              <TimeField
                label="Quiet from"
                value={settings.preferences.quietHours.from}
                onChange={(from) =>
                  settings.update({ quietHours: { ...settings.preferences.quietHours, from } })
                }
              />
              <TimeField
                label="Quiet until"
                value={settings.preferences.quietHours.until}
                onChange={(until) =>
                  settings.update({ quietHours: { ...settings.preferences.quietHours, until } })
                }
              />
            </>
          ) : null}
        </Card>

        {settings.saveFailed ? (
          <Text variant="caption" color="danger">
            That change could not be saved. Your existing reminders are unchanged.
          </Text>
        ) : null}

        <Text variant="caption" color="tertiary">
          Reminders are scheduled on this device and never leave it. They contain no information
          about your entries — nothing on a lock screen names a symptom, a food or a finding.
        </Text>
      </View>
    </Screen>
  );
}

/**
 * The explanation before the OS sheet, and the way back if the answer was no.
 *
 * `denied` is a different screen from `undetermined`, because asking again does nothing: iOS will
 * not show the sheet twice. Offering a button that silently fails would be worse than sending the
 * user to Settings, so that is what it does.
 */
function PermissionCard({
  permission,
  onRequest,
  isRequesting,
}: {
  permission: 'denied' | 'undetermined';
  onRequest: () => void;
  isRequesting: boolean;
}) {
  const theme = useTheme();

  if (permission === 'denied') {
    return (
      <Card>
        <Text variant="cardTitle">Notifications are off for GutSignal</Text>
        <View style={{ height: theme.spacing.xs }} />
        <Text variant="body" color="secondary">
          iOS is blocking reminders. Your settings below are saved and will start working as soon as
          you allow notifications.
        </Text>
        <View style={{ height: theme.spacing.md }} />
        <Button
          label="Open iOS Settings"
          variant="secondary"
          onPress={() => void Linking.openSettings()}
        />
      </Card>
    );
  }

  return (
    <Card>
      <Text variant="cardTitle">Turn on reminders</Text>
      <View style={{ height: theme.spacing.xs }} />
      <Text variant="body" color="secondary">
        GutSignal can nudge you to log at times you choose. Reminders are scheduled on this device,
        say nothing about your entries, and you can change or switch them off at any time.
      </Text>
      <View style={{ height: theme.spacing.md }} />
      <Button label="Allow notifications" loading={isRequesting} onPress={onRequest} />
    </Card>
  );
}
