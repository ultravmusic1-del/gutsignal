import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, Screen, Text } from '@/components/ui';
import {
  REPORT_PERIOD_DAYS,
  useCreateReport,
  type ReportPeriodDays,
} from '@/features/reports/useCreateReport';
import { useTheme } from '@/theme';

/**
 * Privacy & Data (spec §97).
 *
 * The home for everything a person does with their own record rather than to it: reports today,
 * file export and account deletion when they exist. Reached from You.
 *
 * Only the report is here. File export needs `expo-file-system` and `expo-sharing`, and account
 * deletion needs a server function that cannot be written while the database is paused — and a row
 * that leads nowhere is the dead control `CLAUDE.md` §57 forbids, so neither is listed until it
 * works. What the app cannot do yet is said in words instead.
 */
export default function PrivacyAndDataScreen() {
  const theme = useTheme();
  const [days, setDays] = useState<ReportPeriodDays>(30);
  const createReport = useCreateReport();

  const failed = createReport.isError;

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
              Downloading your full diary as a file, and deleting your account from inside the app,
              are both being built. Until they are, they are not listed here rather than shown as
              buttons that would not work.
            </Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
