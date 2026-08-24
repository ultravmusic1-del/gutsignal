import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
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
          <ErrorBoundary>
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
