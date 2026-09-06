import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { captureError } from '@/services/monitoring/monitoring';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { SyncProvider } from '@/features/sync/SyncProvider';
import { createQueryClient } from '@/services/query/client';
import { ThemeProvider } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient());

  useEffect(() => {
    // The splash hides as soon as the first screen can render. Boot work that must finish
    // before routing lives in useAppBoot, not here, so launch stays fast (spec §21).
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* Above the data providers, below the theme: the fallback UI needs tokens and safe
              areas, and a provider that throws during init must still be caught. */}
          <ErrorBoundary onError={(error) => captureError('app_render', error)}>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                {/* Inside AuthProvider: the engine's lifetime follows the session, starting
                    when one appears and stopping on sign-out. */}
                <SyncProvider>
                  <StatusBar style="auto" />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(onboarding)" />
                    <Stack.Screen name="(tabs)" />
                    {/* The log flow is a native form sheet: platform drag-to-dismiss and
                    detents, not a hand-rolled modal. Every logging screen enters here. */}
                    <Stack.Screen
                      name="log/index"
                      options={{
                        presentation: 'formSheet',
                        sheetAllowedDetents: 'fitToContents',
                        sheetCornerRadius: 28,
                        sheetGrabberVisible: true,
                        headerShown: false,
                      }}
                    />
                    {/* The symptom form is taller than the action list, so it takes a large
                    detent rather than fitting to content. */}
                    <Stack.Screen
                      name="log/symptom"
                      options={{
                        presentation: 'formSheet',
                        sheetAllowedDetents: [0.9],
                        sheetCornerRadius: 28,
                        sheetGrabberVisible: true,
                        headerShown: false,
                      }}
                    />
                    {/* Every logging screen is a sheet like the action list above it. */}
                    <Stack.Screen
                      name="log/meal"
                      options={{
                        presentation: 'formSheet',
                        sheetAllowedDetents: [0.9],
                        sheetCornerRadius: 28,
                        sheetGrabberVisible: true,
                        headerShown: false,
                      }}
                    />
                    {/* Bowel movement entry. */}
                    <Stack.Screen
                      name="log/bowel"
                      options={{
                        presentation: 'formSheet',
                        sheetAllowedDetents: [0.9],
                        sheetCornerRadius: 28,
                        sheetGrabberVisible: true,
                        headerShown: false,
                      }}
                    />
                    {/* Wellbeing normally saves in one tap; this is for editing one. */}
                    <Stack.Screen
                      name="log/wellbeing"
                      options={{
                        presentation: 'formSheet',
                        sheetAllowedDetents: [0.9],
                        sheetCornerRadius: 28,
                        sheetGrabberVisible: true,
                        headerShown: false,
                      }}
                    />
                    {/* Stress, sleep and exercise. */}
                    <Stack.Screen
                      name="log/context"
                      options={{
                        presentation: 'formSheet',
                        sheetAllowedDetents: [0.9],
                        sheetCornerRadius: 28,
                        sheetGrabberVisible: true,
                        headerShown: false,
                      }}
                    />
                    {/* Pattern detail is read, not filled in, so it pushes rather than opening
                    as a sheet — and it takes the native header for a real back gesture and a
                    back button VoiceOver already knows how to describe. */}
                    {/* Privacy and data (spec §97). Pushed rather than a sheet: it is read and
                    acted on, not filled in. */}
                    <Stack.Screen
                      name="privacy-data"
                      options={{
                        headerShown: true,
                        headerTitle: 'Privacy & data',
                        headerBackTitle: 'You',
                      }}
                    />
                    <Stack.Screen
                      name="pattern/[id]"
                      options={{
                        headerShown: true,
                        headerTitle: 'Pattern',
                        headerBackTitle: 'Insights',
                      }}
                    />
                    {/* Diagnostics (review §23). Registered like any other route — reaching it is
                    what is hidden, not the screen. An unregistered route still renders, it just
                    silently loses its header and presentation, which is the Milestone 6 defect
                    `src/__tests__/routeRegistration.test.ts` now exists to prevent. */}
                    <Stack.Screen
                      name="diagnostics"
                      options={{
                        headerShown: true,
                        headerTitle: 'Diagnostics',
                        headerBackTitle: 'You',
                      }}
                    />
                  </Stack>
                </SyncProvider>
              </AuthProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
