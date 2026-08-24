import Constants from 'expo-constants';
import { View } from 'react-native';

import { useAppBoot } from '@/boot/useAppBoot';
import { Card, Divider, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Milestone 1 foundation screen.
 *
 * This is not the product's home screen — Today/Timeline/Insights/You arrive with the
 * navigation shells in Milestone 2. Its job is to prove, on a physical iPhone, that the
 * development build boots: design tokens render, safe areas and Dynamic Type behave, and the
 * boot sequence reports honestly.
 *
 * Deliberately no buttons: there is nothing here to do yet, and a dead control would violate
 * the "no placeholder actions" rule (CLAUDE.md §57).
 */
export default function FoundationScreen() {
  const theme = useTheme();
  const boot = useAppBoot();

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingVertical: theme.spacing.xxl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="overline" color="accent">
            GUTSIGNAL
          </Text>
          <Text variant="display">Foundation</Text>
          <Text variant="body" color="secondary">
            Understand your gut. Stop guessing.
          </Text>
        </View>

        <Card>
          <Text variant="cardTitle">Boot sequence</Text>
          <View style={{ height: theme.spacing.sm }} />

          {boot.steps.map((step, index) => (
            <View key={step.id}>
              {index > 0 ? (
                <View style={{ paddingVertical: theme.spacing.sm }}>
                  <Divider />
                </View>
              ) : null}

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                }}
              >
                <Text variant="body">{step.label}</Text>

                {/* Status is carried by the WORD, not by colour alone (CLAUDE.md §36). */}
                <Text
                  variant="caption"
                  color={
                    step.status === 'ok'
                      ? 'positive'
                      : step.status === 'failed'
                        ? 'danger'
                        : 'secondary'
                  }
                  accessibilityLabel={`${step.label}: ${statusLabel(step.status)}`}
                >
                  {statusLabel(step.status)}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        {boot.problems.length > 0 ? (
          <Card>
            <Text variant="cardTitle" color="danger">
              Configuration needs attention
            </Text>
            <View style={{ height: theme.spacing.xs }} />
            {boot.problems.map((problem) => (
              <Text key={problem} variant="caption" color="secondary">
                • {problem}
              </Text>
            ))}
            <View style={{ height: theme.spacing.sm }} />
            <Text variant="caption" color="tertiary">
              Set these in .env — see .env.example.
            </Text>
          </Card>
        ) : null}

        <Card elevation="flat">
          <Text variant="caption" color="secondary">
            Boot state
          </Text>
          <Text variant="bodyStrong">{boot.state}</Text>
          <View style={{ height: theme.spacing.sm }} />
          <Text variant="caption" color="secondary">
            Version
          </Text>
          <Text variant="bodyStrong">
            {Constants.expoConfig?.version ?? 'unknown'} · {theme.scheme} appearance
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

function statusLabel(status: 'pending' | 'ok' | 'failed'): string {
  switch (status) {
    case 'ok':
      return 'Ready';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Checking…';
  }
}
