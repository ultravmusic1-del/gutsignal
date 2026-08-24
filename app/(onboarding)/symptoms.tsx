import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { SelectCard, Text } from '@/components/ui';
import { SYMPTOMS } from '@/domain/onboarding/options';
import { OnboardingStep } from '@/features/onboarding/OnboardingStep';
import { useOnboardingDraft } from '@/features/onboarding/draftStore';
import { useTheme } from '@/theme';

/**
 * Symptom tracking categories (spec §25).
 *
 * These are the things this user wants to track. Nothing here implies a diagnosis, and the
 * copy says so plainly — a list of GI symptoms can otherwise read like a checklist someone is
 * being scored against.
 */
export default function SymptomsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const symptoms = useOnboardingDraft((state) => state.symptoms);
  const toggleSymptom = useOnboardingDraft((state) => state.toggleSymptom);

  const next = () => router.push('/(onboarding)/bowel-pattern');

  return (
    <OnboardingStep
      step="symptoms"
      title="What do you commonly experience?"
      subtitle="These become your quick options when logging. You can change them at any time."
      onPrimary={next}
      secondaryLabel="Skip — I'm not sure"
      onSecondary={next}
    >
      <View style={{ gap: theme.spacing.xs }}>
        {SYMPTOMS.map((symptom) => (
          <SelectCard
            key={symptom.key}
            label={symptom.label}
            selected={symptoms.includes(symptom.key)}
            onPress={() => toggleSymptom(symptom.key)}
          />
        ))}
      </View>

      <Text variant="caption" color="tertiary">
        Choosing symptoms here is a tracking preference. It doesn&apos;t suggest a diagnosis.
      </Text>
    </OnboardingStep>
  );
}
