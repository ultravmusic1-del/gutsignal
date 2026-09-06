import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { track } from '@/services/analytics/analytics';

/**
 * Entry point for the onboarding group — the flow always starts at the first question.
 *
 * The event fires here rather than on the first question's screen, so it counts entries into the
 * flow rather than views of one screen. Someone who leaves and comes back to finish is counted
 * twice, which is true: they started twice.
 */
export default function OnboardingIndex() {
  useEffect(() => {
    track('onboarding_started');
  }, []);

  return <Redirect href="/(onboarding)/goals" />;
}
