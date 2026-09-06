import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, Screen, Text, TextField } from '@/components/ui';
import { accountDeletionExplainer, isDeletionConfirmed } from '@/features/account/deleteAccount';
import { useDeleteAccount } from '@/features/account/useDeleteAccount';
import {
  REPORT_PERIOD_DAYS,
  useCreateReport,
  type ReportPeriodDays,
} from '@/features/reports/useCreateReport';
import { useTheme } from '@/theme';

/**
 * Privacy & Data (spec §97).
 *
 * The home for everything a person does with their own record rather than to it. Reports and
 * account deletion are here; file export is not, because it needs `expo-file-system` and
 * `expo-sharing` and a control that leads nowhere is the dead button `CLAUDE.md` §57 forbids.
 * What the app cannot do yet is said in words instead of shown as a button.
 *
 * **Deletion is real, and it is last on the screen for a reason.** It is irreversible and it is
 * the only control here that destroys anything, so it sits below everything a person might have
 * come for, behind a typed confirmation, with what it removes stated before the control appears.
 */
export default function PrivacyAndDataScreen() {
  const theme = useTheme();
  const [days, setDays] = useState<ReportPeriodDays>(30);
  const createReport = useCreateReport();

  const [typed, setTyped] = useState('');
  const deleteAccount = useDeleteAccount();
  const explainer = accountDeletionExplainer();
  const confirmed = isDeletionConfirmed(typed);

  const failed = createReport.isError;

  /**
   * On success the session ends and the app routes back to welcome, so there is no screen left to
   * report on. The one thing worth interrupting for is a server deletion that succeeded while the
   * device could not be cleared: the account is gone either way, but claiming a clean sweep that
   * did not happen would be a false statement about someone's health data.
   */
  const confirmDelete = () => {
    deleteAccount.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok && !result.localDataCleared) {
          Alert.alert(
            'Account deleted',
            'Your account and everything on our servers are gone. A copy on this device could ' +
              'not be removed — reinstalling GutSignal will clear it.'
          );
        }
      },
    });
  };

  const deleteError =
    deleteAccount.data !== undefined && !deleteAccount.data.ok
      ? deleteAccount.data.message
      : deleteAccount.isError
        ? 'Your account could not be deleted just now. Nothing has been removed.'
        : null;

  return (
    <Screen scroll topInset={false}>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="title">Privacy & data</Text>
          <Text variant="caption" color="secondary">
            Your record is yours. Nothing here sends anything anywhere on its own.
          </Text>
        </View>

        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ gap: theme.spacing.xxs }}>
              <Text variant="cardTitle">Report for an appointment</Text>
              <Text variant="body" color="secondary">
                A printable summary of what you have logged: how completely you tracked, your
                symptoms and bowel entries, and anything that showed up alongside them.
              </Text>
            </View>

            {/* Spec §70 asks for 30 and 90 days. A custom range needs a date picker, which is not
                built — offering only what works beats offering a control that does not. */}
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="overline" color="secondary">
                PERIOD
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                {REPORT_PERIOD_DAYS.map((option) => (
                  <Chip
                    key={option}
                    label={`Last ${option} days`}
                    selected={days === option}
                    onPress={() => setDays(option)}
                  />
                ))}
              </View>
            </View>

            <Text variant="caption" color="tertiary">
              The report says what was recorded and how often. It does not diagnose, and it does not
              say that one thing caused another — a clinician reading it needs to know that, so it
              is written on the page.
            </Text>

            <Button
              label="Create report"
              loading={createReport.isPending}
              onPress={() => createReport.mutate(days)}
            />

            {/* Only a failure *before* the print sheet is worth showing. A sheet the user closed is
                not an error, and `useCreateReport` already resolves that as 'dismissed'. */}
            {failed ? (
              <Text variant="caption" color="danger">
                The report could not be built. Your entries are safe on this device — this is a
                problem reading them, and trying again usually clears it.
              </Text>
            ) : null}
          </View>
        </Card>

        <Card elevation="flat">
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="overline" color="secondary">
              NOT HERE YET
            </Text>
            <Text variant="body" color="secondary">
              Downloading your full diary as a file is being built. Until it is, it is not listed
              here rather than shown as a button that would not work.
            </Text>
          </View>
        </Card>

        {/* Deletion, last on the screen and behind a typed word. Everything it removes is stated
            before the control that removes it — including the Apple subscription note §97 asks to
            be made separately, which is the one thing nobody can be told afterwards. */}
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ gap: theme.spacing.xxs }}>
              <Text variant="cardTitle">{explainer.title}</Text>
              <Text variant="body" color="secondary">
                {explainer.body}
              </Text>
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              {explainer.points.map((point) => (
                <Text key={point} variant="caption" color="secondary">
                  {point}
                </Text>
              ))}
            </View>

            <TextField
              label={explainer.confirmLabel}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityHint="Deleting is permanent and cannot be undone"
            />

            {/* Disabled until the word is typed. This is the one place in the app where a disabled
                control is right rather than a placeholder: it is not waiting on a feature that does
                not exist, it is waiting on the person to mean it. */}
            <Button
              label="Delete account"
              variant="secondary"
              disabled={!confirmed || deleteAccount.isPending}
              loading={deleteAccount.isPending}
              onPress={confirmDelete}
            />

            {deleteError !== null ? (
              <Text variant="caption" color="danger">
                {deleteError}
              </Text>
            ) : null}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
