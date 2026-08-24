import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useAppBoot, type BootFailureKind } from '@/boot/useAppBoot';
import { Card, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Boot gate. The app routes exactly once, from here, after the boot sequence resolves
 * (spec §20) — which is what prevents the auth/navigation flicker of deciding routes inside
 * several providers.
 *
 * Milestone 3 adds the branch to the welcome/auth flow for `unauthenticated`. Until sign-in
 * exists, a booted app goes straight to the tab shell.
 */
export default function BootGate() {
  const boot = useAppBoot();

  if (boot.state === 'booting') {
    // Deliberately blank: the native splash is still up, and rendering a second loading
    // treatment here would produce a visible flash between the two.
    return <Screen />;
  }

  if (boot.state === 'configuration_error') {
    return <BootFailure problems={boot.problems} kind={boot.failureKind ?? 'environment'} />;
  }

  return <Redirect href="/(tabs)/today" />;
}

/**
 * The two failure causes get different copy, because they have different audiences and
 * different remedies. Telling a user with a broken database to "check .env" is worse than
 * saying nothing.
 */
const FAILURE_COPY: Record<BootFailureKind, { title: string; body: string; footer: string }> = {
  environment: {
    title: "This build isn't configured",
    body: 'The app cannot reach its backend because required configuration is missing. This is a build-time problem, not something a user can fix.',
    footer: 'Set these in .env (see .env.example) and restart the bundler.',
  },
  storage: {
    title: "GutSignal can't start",
    body: 'The app stores your entries on this device, and that storage could not be opened. Nothing you have logged has been deleted.',
    footer:
      'Try restarting the app. If it keeps happening, restarting the device or freeing up storage space usually helps.',
  },
};

function BootFailure({ problems, kind }: { problems: string[]; kind: BootFailureKind }) {
  const theme = useTheme();
  const copy = FAILURE_COPY[kind];

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xxl }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="overline" color="accent">
            GUTSIGNAL
          </Text>
          <Text variant="title">{copy.title}</Text>
          <Text variant="body" color="secondary">
            {copy.body}
          </Text>
        </View>

        <Card>
          <Text variant="cardTitle">
            {kind === 'environment' ? 'Missing or invalid' : 'Details'}
          </Text>
          <View style={{ height: theme.spacing.xs }} />
          {problems.map((problem) => (
            <Text key={problem} variant="body" color="secondary">
              • {problem}
            </Text>
          ))}
          <View style={{ height: theme.spacing.md }} />
          <Text variant="caption" color="tertiary">
            {copy.footer}
          </Text>
        </Card>
      </View>
    </Screen>
  );
}
