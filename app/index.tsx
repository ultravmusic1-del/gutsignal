import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Alert, DevSettings, View } from 'react-native';

import { useAppBoot, type BootFailureKind } from '@/boot/useAppBoot';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { Button, Card, Screen, Text } from '@/components/ui';
import { deleteLocalDatabase } from '@/services/db/database';
import { useTheme } from '@/theme';

/**
 * Boot gate. The app routes exactly once, from here, after the boot sequence resolves
 * (spec §20) — which is what prevents the auth/navigation flicker of deciding routes inside
 * several providers.
 *
 * Order matters: configuration, then session restore, then profile, then route.
 */
export default function BootGate() {
  const boot = useAppBoot();
  const auth = useAuth();
  const profile = useProfile();

  if (boot.state === 'booting') {
    // Deliberately blank: the native splash is still up, and rendering a second loading
    // treatment here would produce a visible flash between the two.
    return <Screen />;
  }

  if (boot.state === 'configuration_error') {
    return <BootFailure problems={boot.problems} kind={boot.failureKind ?? 'environment'} />;
  }

  // Wait for the session restore before deciding. Routing early and correcting afterwards is
  // exactly the auth flicker the spec calls out (§20).
  if (!auth.initialised) {
    return <Screen />;
  }

  if (!auth.session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (profile.isPending) {
    return <Screen />;
  }

  // A profile that says onboarding is unfinished sends the user back into it.
  //
  // A profile we could NOT read does not: an unreachable network on launch must not trap a
  // returning user in onboarding they already completed. Personalization is worth less than
  // access to their own logs, so an unreadable profile falls through to the app.
  const needsOnboarding =
    profile.data?.ok === true && profile.data.profile.onboarding_completed_at === null;

  if (needsOnboarding) {
    return <Redirect href="/(onboarding)" />;
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

        {__DEV__ && kind === 'storage' ? <ResetLocalStorage /> : null}
      </View>
    </Screen>
  );
}

/**
 * A way out of a local database that cannot be migrated. **Development builds only.**
 *
 * A half-applied schema is not something restarting fixes: the version table says migration 2 ran
 * while the tables it creates are absent, so every launch fails the same way. Before this existed
 * the only remedy was deleting Expo Go to clear its sandbox, which is an absurd thing to ask of
 * someone testing a build.
 *
 * It is `__DEV__`-gated rather than shipped. Deleting a diary is not a remedy to put in front of a
 * real user — for them, unsynced entries are the thing most worth protecting (CLAUDE.md §15), and
 * a recoverable schema fault should be handled by the migrator, not by a button. If a shipped
 * build ever needs this, it needs an export first.
 *
 * The confirmation is not decoration. This deletes local logs, and the copy says so plainly rather
 * than calling it a reset (§57: no fake or euphemistic destructive actions).
 */
function ResetLocalStorage() {
  const theme = useTheme();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const confirm = () => {
    Alert.alert(
      'Delete local data?',
      'This deletes every log stored on this device, including any not yet synced. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setWorking(true);
            setFailure(null);
            void deleteLocalDatabase()
              .then(() => DevSettings.reload())
              .catch((error: unknown) => {
                // Shown, not swallowed. The first version of this caught and discarded the error,
                // so a delete that failed because the connection was still open was
                // indistinguishable from a button that did nothing — which is how it was reported.
                setWorking(false);
                setFailure(error instanceof Error ? error.message : String(error));
              });
          },
        },
      ]
    );
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Button
        label="Delete local data and restart"
        variant="secondary"
        loading={working}
        onPress={confirm}
      />
      {failure === null ? (
        <Text variant="caption" color="tertiary">
          Development builds only. Deletes every log stored on this device.
        </Text>
      ) : (
        <Text variant="caption" color="secondary">
          Could not delete: {failure}
        </Text>
      )}
    </View>
  );
}
