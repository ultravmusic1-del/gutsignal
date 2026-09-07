import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import type { EditLoadState } from './editLoadState';

/**
 * What a log sheet shows instead of its form when the entry it is editing is not there.
 *
 * One component rather than the same three blocks in five screens, and — more importantly — one
 * place where the wording of "we could not read your entry" is decided. Every message here says
 * what happened to the *entry*, never just that something went wrong: someone who opened an edit
 * needs to know their record is intact before they need to know the read failed.
 */

const COPY: Record<
  Exclude<EditLoadState, 'new' | 'ready'>,
  { title: string; body: string } | null
> = {
  loading: null,

  failed: {
    title: 'That entry could not be opened',
    body: 'Nothing has been lost — this is a problem reading from this device, not with your saved entry. Closing and reopening usually clears it.',
  },

  missing: {
    title: 'That entry is no longer here',
    body: 'It looks like it was deleted, either here or on another device. There is nothing to edit.',
  },
};

export function EditLoadGate({ state }: { state: Exclude<EditLoadState, 'new' | 'ready'> }) {
  const theme = useTheme();
  const router = useRouter();
  const copy = COPY[state];

  return (
    <Screen>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
        {copy === null ? (
          <Card>
            <Text variant="body" color="secondary">
              Opening your entry…
            </Text>
          </Card>
        ) : (
          <>
            <View style={{ gap: theme.spacing.xxs }}>
              <Text variant="title">{copy.title}</Text>
              <Text variant="body" color="secondary">
                {copy.body}
              </Text>
            </View>

            <Button label="Close" variant="secondary" onPress={() => router.back()} />
          </>
        )}
      </View>
    </Screen>
  );
}
