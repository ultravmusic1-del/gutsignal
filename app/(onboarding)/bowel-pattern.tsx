import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { SelectCard, Text } from '@/components/ui';
import { BOWEL_PATTERNS } from '@/domain/onboarding/options';
import { OnboardingStep } from '@/features/onboarding/OnboardingStep';
import { useOnboardingDraft } from '@/features/onboarding/draftStore';
import { useTheme } from '@/theme';

/**
 * Usual bowel pattern (spec §26).
 *
 * This answer must NOT produce an IBS-C/D/M label — it is context for the user's own baseline,
 * nothing more. "I'm not sure" is a first-class answer, not a cop-out.
 */
export default function BowelPatternScreen() {
  const theme = useTheme();
  const router = useRouter();
  const bowelPattern = useOnboardingDraft((state) => state.bowelPattern);
  const setBowelPattern = useOnboardingDraft((state) => state.setBowelPattern);

  return (
    <OnboardingStep
      step="bowel-pattern"
      title="Which sounds most like your usual pattern?"
      subtitle="This gives GutSignal a starting point for what's normal for you."
      onPrimary={() => router.push('/(onboarding)/suspected-factors')}
    >
      <View style={{ gap: theme.spacing.xs }}>
        {BOWEL_PATTERNS.map((pattern) => (
          <SelectCard
            key={pattern.key}
            label={pattern.label}
            mode="radio"
            selected={bowelPattern === pattern.key}
            onPress={() => setBowelPattern(pattern.key)}
          />
        ))}
      </View>

      <Text variant="caption" color="tertiary">
        GutSignal doesn&apos;t use this to categorise you. It only helps describe your own baseline.
      </Text>
    </OnboardingStep>
  );
}
