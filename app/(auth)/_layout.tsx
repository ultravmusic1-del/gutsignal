import { Stack } from 'expo-router';

/**
 * The sign-in flow's own navigator.
 *
 * A route group without a `_layout` is not a navigator at all — Expo Router hoists its files into
 * the parent stack, and the `<Stack.Screen name="(auth)" />` in the root layout matches nothing.
 * That is how these four screens ran for a while with no registration of any kind: they worked,
 * because routes are discovered from the filesystem, but nothing could give them options.
 *
 * Declaring them here makes the grouping real and gives the flow a place to hold its own
 * presentation, the same way `(tabs)` does.
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="email" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
