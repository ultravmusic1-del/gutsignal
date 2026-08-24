import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { SelectCard } from '@/components/ui';
import { GOALS } from '@/domain/onboarding/options';
import { OnboardingStep } from '@/features/onboarding/OnboardingStep';
import { useOnboardingDraft } from '@/features/onboarding/draftStore';
import { useTheme } from '@/theme';

/**
 * Primary goal (spec §24). Multi-select, and answering nothing is allowed — the point is to
 * personalize, not to gate entry.
 */
export default function GoalsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const goals = useOnboardingDraft((state) => state.goals);
  const toggleGoal = useOnboardingDraft((state) => state.toggleGoal);

  return (
    <OnboardingStep
      step="goals"
      title="What would you like to understand better?"
      subtitle="Choose as many as you like. This shapes what GutSignal shows you first."
      onPrimary={() => router.push('/(onboarding)/symptoms')}
    >
      <View style={{ gap: theme.spacing.xs }}>
        {GOALS.map((goal) => (
          <SelectCard
            key={goal.key}
            label={goal.label}
            selected={goals.includes(goal.key)}
            onPress={() => toggleGoal(goal.key)}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}
