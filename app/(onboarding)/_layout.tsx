import { Stack } from 'expo-router';

/**
 * The onboarding flow's own navigator.
 *
 * Same reason as `(auth)`: without this file the group is not a navigator, its screens are hoisted
 * into the root stack, and the root's `<Stack.Screen name="(onboarding)" />` matches no route.
 *
 * The order below is the order a new user walks through, which is worth keeping readable — it is
 * the only place the whole flow is visible at once. `index` redirects to `goals`; it exists so
 * `/(onboarding)` is a valid destination.
 */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="symptoms" />
      <Stack.Screen name="bowel-pattern" />
      <Stack.Screen name="suspected-factors" />
      <Stack.Screen name="tracking-style" />
      <Stack.Screen name="philosophy" />
      <Stack.Screen name="account" />
      <Stack.Screen name="complete" />
    </Stack>
  );
}
