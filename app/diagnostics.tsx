import Constants from 'expo-constants';
import { View } from 'react-native';

import { Card, Screen, Text } from '@/components/ui';
import { describeBuild } from '@/config/buildInfo';
import { useTheme } from '@/theme';

/**
 * Diagnostics (review §23–24).
 *
 * Reached by tapping the version row in You several times, and deliberately not listed anywhere.
 * It is for the moment someone says "my log disappeared" and the reply needs to establish which
 * binary they are holding and which backend it is pointed at — which is one screenshot from here,
 * and otherwise an afternoon.
 *
 * **Everything on this screen is an identifier.** The Supabase project reference appears in every
 * request URL and is not a secret; the publishable key is not here, because a screenshot of a
 * diagnostics panel ends up in a support thread. `buildInfo.ts` holds a test asserting nothing
 * credential-shaped can reach this screen whatever it is handed.
 */
export default function DiagnosticsScreen() {
  const theme = useTheme();

  const build = describeBuild({
    version: Constants.expoConfig?.version,
    buildNumber: Constants.expoConfig?.ios?.buildNumber,
    bundleIdentifier: Constants.expoConfig?.ios?.bundleIdentifier,
    gitSha: Constants.expoConfig?.extra?.build?.gitSha as string | undefined,
    appEnv: Constants.expoConfig?.extra?.build?.appEnv as string | undefined,
    builtAt: Constants.expoConfig?.extra?.build?.builtAt as string | undefined,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  });

  return (
    <Screen scroll topInset={false}>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="title">Diagnostics</Text>
          <Text variant="caption" color="secondary">
            For support. Nothing here identifies you or anything you have logged — read it out or
            send a photo of it if you are asked to.
          </Text>
        </View>

        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            {build.lines.map((line, index) => (
              <View key={line.label} style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text variant="caption" color="secondary">
                    {line.label}
                  </Text>
                  {/* Selectable so it can be copied without a clipboard dependency. */}
                  <Text variant="caption" selectable style={{ flexShrink: 1, textAlign: 'right' }}>
                    {line.value}
                  </Text>
                </View>
                {index < build.lines.length - 1 ? null : null}
              </View>
            ))}
          </View>
        </Card>

        <Text variant="caption" color="tertiary">
          A build that says “unknown” was made outside the release pipeline — usually a local
          development build, which has no commit or environment attached to it.
        </Text>
      </View>
    </Screen>
  );
}
