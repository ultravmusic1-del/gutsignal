import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { SelectCard, Text } from '@/components/ui';
import { TRACKING_STYLES } from '@/domain/onboarding/options';
import { OnboardingStep } from '@/features/onboarding/OnboardingStep';
import { useOnboardingDraft } from '@/features/onboarding/draftStore';
import { useTheme } from '@/theme';

/**
 * Tracking style (spec §28).
 *
 * This sets how much each logging screen asks for by default. Someone who chose Minimal must
 * never be shown ten fields to record a symptom — the setting has to actually change the
 * product, not just be stored.
 */
export default function TrackingStyleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const trackingStyle = useOnboardingDraft((state) => state.trackingStyle);
  const setTrackingStyle = useOnboardingDraft((state) => state.setTrackingStyle);

  return (
    <OnboardingStep
      step="tracking-style"
      title="How much effort should tracking take?"
      subtitle="You can change this whenever you like."
      onPrimary={() => router.push('/(onboarding)/philosophy')}
    >
      <View style={{ gap: theme.spacing.xs }}>
        {TRACKING_STYLES.map((style) => (
          <SelectCard
            key={style.key}
            label={style.label}
            description={style.description}
            mode="radio"
            selected={trackingStyle === style.key}
            onPress={() => setTrackingStyle(style.key)}
          />
        ))}
      </View>

      <Text variant="caption" color="tertiary">
        Logging consistently matters more than logging in detail.
      </Text>
    </OnboardingStep>
  );
}
