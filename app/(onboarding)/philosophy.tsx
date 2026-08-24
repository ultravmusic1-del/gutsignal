import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Card, SelectCard, Text } from '@/components/ui';
import { OnboardingStep } from '@/features/onboarding/OnboardingStep';
import { useOnboardingDraft } from '@/features/onboarding/draftStore';
import { useTheme } from '@/theme';

/**
 * How GutSignal works, and what it will not do (spec §29).
 *
 * The non-diagnostic statement is required, and the user has to acknowledge it — but it is one
 * clear sentence they can actually read, not a wall of legal text they will scroll past.
 */
export default function PhilosophyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const acknowledged = useOnboardingDraft((state) => state.acknowledgedNonDiagnostic);
  const acknowledge = useOnboardingDraft((state) => state.acknowledge);

  return (
    <OnboardingStep
      step="philosophy"
      title="How GutSignal works"
      onPrimary={() => router.push('/(onboarding)/account')}
      primaryDisabled={!acknowledged}
    >
      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text variant="cardTitle">Log normally</Text>
            <Text variant="body" color="secondary">
              Food, symptoms and bowel patterns — including the days you feel fine.
            </Text>
          </View>

          <View style={{ gap: 2 }}>
            <Text variant="cardTitle">Find repeating signals</Text>
            <Text variant="body" color="secondary">
              GutSignal compares what you record over time and looks for associations that recur.
            </Text>
          </View>

          <View style={{ gap: 2 }}>
            <Text variant="cardTitle">Test assumptions</Text>
            <Text variant="body" color="secondary">
              Explore the factors you suspect, without jumping to conclusions.
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text variant="body">
          GutSignal identifies associations in your data. It does not diagnose conditions or prove
          that one factor caused a symptom.
        </Text>
      </Card>

      <SelectCard
        label="I understand"
        mode="checkbox"
        selected={acknowledged}
        onPress={acknowledge}
      />
    </OnboardingStep>
  );
}
