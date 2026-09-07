import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Chip, Screen, Text, TextField, ToggleRow } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The design system on one screen. **Development builds only.**
 *
 * Storybook is the right place to work on a single component in isolation. This is the other
 * question: whether the pieces look like they belong to the same product when they are next to
 * each other. A radius that is 4pt off, a caption colour that is legible in isolation and
 * invisible on a card, two greys that were meant to be one — none of those show up one story at a
 * time.
 *
 * It reads its values from the theme rather than restating them, so it cannot drift from what the
 * app actually uses (`CLAUDE.md` §35). If a token is added and does not appear here, that is a
 * missing row rather than a wrong one.
 *
 * `__DEV__` is checked before anything renders. The route still exists in a release bundle —
 * Expo Router discovers routes from the filesystem and there is no way to unpublish one — so it
 * redirects instead, and nothing behind it is reachable.
 */
export default function DevUiGallery() {
  const theme = useTheme();

  if (!__DEV__) return <Redirect href="/" />;

  const swatches = [
    ['surface.primary', theme.colors.surface.primary],
    ['surface.card', theme.colors.surface.card],
    ['surface.inverse', theme.colors.surface.inverse],
    ['accent.solid', theme.colors.accent.solid],
    ['border.strong', theme.colors.border.strong],
  ] as const;

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="overline" color="accent">
            DEVELOPMENT ONLY
          </Text>
          <Text variant="title">UI gallery</Text>
          <Text variant="body" color="secondary">
            Every primitive on one screen, so inconsistency between them is visible. Not reachable
            in a release build.
          </Text>
        </View>

        <Section title="TYPOGRAPHY">
          {(
            ['display', 'title', 'cardTitle', 'body', 'button', 'caption', 'overline'] as const
          ).map((variant) => (
            <View key={variant} style={{ gap: 2 }}>
              <Text variant="caption" color="tertiary">
                {variant}
              </Text>
              <Text variant={variant}>Stop guessing what affects your gut</Text>
            </View>
          ))}
        </Section>

        <Section title="COLOUR">
          {swatches.map(([name, value]) => (
            <View
              key={name}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: theme.radius.sm,
                  backgroundColor: value,
                  borderWidth: 1,
                  borderColor: theme.colors.border.strong,
                }}
              />
              <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                {name}
              </Text>
              <Text variant="caption" color="tertiary">
                {value}
              </Text>
            </View>
          ))}
        </Section>

        <Section title="BUTTONS">
          <Button label="Primary" onPress={() => {}} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <Button label="Ghost" variant="ghost" onPress={() => {}} />
          <Button label="Loading" loading onPress={() => {}} />
          <Button label="Disabled" disabled onPress={() => {}} />
        </Section>

        <Section title="CHIPS">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <Chip label="All" selected onPress={() => {}} />
            <Chip label="Meals" onPress={() => {}} />
            <Chip label="Symptoms" onPress={() => {}} />
            <Chip label="Feeling good" onPress={() => {}} />
          </View>
        </Section>

        <Section title="CARDS">
          <Card elevation="flat">
            <Text variant="body">flat</Text>
          </Card>
          <Card>
            <Text variant="body">card</Text>
          </Card>
          <Card elevation="raised">
            <Text variant="body">raised</Text>
          </Card>
          <Card inverse>
            <Text variant="body" color="onInverse">
              inverse
            </Text>
          </Card>
        </Section>

        <Section title="INPUTS">
          <TextField label="Email" placeholder="you@example.com" />
          <TextField
            label="Email"
            value="vivaan@"
            error="That does not look like an email address."
          />
          <ToggleRow label="Morning check-in" value onValueChange={() => {}} />
          <ToggleRow
            label="Evening check-in"
            description="Anything worth logging today?"
            warning="This falls inside your quiet hours, so it will not be sent."
            value
            onValueChange={() => {}}
          />
        </Section>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="overline" color="secondary">
        {title}
      </Text>
      {children}
    </View>
  );
}
