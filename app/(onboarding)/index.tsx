import { Redirect } from 'expo-router';

/** Entry point for the onboarding group — the flow always starts at the first question. */
export default function OnboardingIndex() {
  return <Redirect href="/(onboarding)/goals" />;
}
