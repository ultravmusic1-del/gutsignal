import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';
import { ONBOARDING_STEPS, type OnboardingStepName } from '@/domain/onboarding/steps';
import { track } from '@/services/analytics/analytics';
import { useTheme } from '@/theme';

// Re-exported so existing imports keep working; the list itself lives in `domain` because the
// analytics allowlist needs it too and must not import a component to get it.
export { ONBOARDING_STEPS };
export type { OnboardingStepName };

export type OnboardingStepProps = {
  step: OnboardingStepName;
  title: string;
  subtitle?: string;
  children: ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * Shared frame for an onboarding question (spec §23).
 *
 * One decision per screen, progress shown discreetly, and the action always in the same place.
 * The progress bar is decorative for screen readers — the step is announced as text instead,
 * because "72 percent" from a progress bar tells a VoiceOver user nothing useful.
 */
export function OnboardingStep({
  step,
  title,
  subtitle,
  children,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
}: OnboardingStepProps) {
  const theme = useTheme();
  const index = ONBOARDING_STEPS.indexOf(step);

  // Reported here rather than in each screen: every step passes through this frame, so the funnel
  // cannot drift as steps are added or reordered. Only the primary action counts — skipping does
  // move a person past a step, but calling that 'completed' would misdescribe it, and a skip
  // deserves its own event rather than being folded into this one.
  const completeStep = () => {
    track('onboarding_step_completed', { step });
    onPrimary();
  };
  const position = index + 1;
  const total = ONBOARDING_STEPS.length;

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.sm }}>
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Step ${position} of ${total}`}
            style={{ flexDirection: 'row', gap: 4 }}
          >
            {ONBOARDING_STEPS.map((name, i) => (
              <View
                key={name}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: theme.radius.pill,
                  backgroundColor:
                    i <= index ? theme.colors.accent.solid : theme.colors.border.subtle,
                }}
              />
            ))}
          </View>

          <View style={{ gap: theme.spacing.xxs, paddingTop: theme.spacing.md }}>
            <Text variant="title">{title}</Text>
            {subtitle ? (
              <Text variant="body" color="secondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {children}

        <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.xs }}>
          <Button label={primaryLabel} onPress={completeStep} disabled={primaryDisabled} />
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} haptic={false} />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
