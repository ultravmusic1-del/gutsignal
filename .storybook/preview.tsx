import type { Preview } from '@storybook/react';
import { View } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider, themes } from '@/theme';

/**
 * What every story is rendered inside.
 *
 * The decorator is deliberately thin — the app's real `ThemeProvider`, the app's real safe-area
 * metrics, and the app's real background colour. A story that renders against a white Storybook
 * canvas with invented padding is a story that agrees with itself and disagrees with the app,
 * which is worse than no story at all (`CLAUDE.md` §35: tokens are the single source of truth).
 *
 * Nothing here defines a colour, a radius or a spacing value.
 */

/** An iPhone 15/16's insets, so a component that respects them is laid out as it will be. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const preview: Preview = {
  parameters: {
    // GutSignal is a phone app. Stories open at a phone width rather than a desktop canvas.
    viewport: {
      options: {
        iphone15: { name: 'iPhone 15 (393×852)', styles: { width: '393px', height: '852px' } },
        iphone15Max: {
          name: 'iPhone 15 Pro Max (430×932)',
          styles: { width: '430px', height: '932px' },
        },
        ipad: { name: 'iPad (820×1180)', styles: { width: '820px', height: '1180px' } },
      },
    },
    backgrounds: { disable: true },
    controls: { expanded: true },
  },

  /**
   * Light and dark are a toolbar switch rather than two copies of every story.
   *
   * §34 asks for a specific dark-surface treatment, and the two schemes are genuinely different
   * designs rather than one design tinted — so being able to flip a story between them without
   * writing it twice is the difference between checking both and checking neither.
   */
  globalTypes: {
    scheme: {
      description: 'Colour scheme',
      toolbar: {
        title: 'Scheme',
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: {
    scheme: 'light',
    viewport: { value: 'iphone15', isRotated: false },
  },

  decorators: [
    (Story, context) => {
      const scheme = (context.globals.scheme as 'light' | 'dark') ?? 'light';
      const background = themes[scheme].colors.surface.primary;

      return (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider scheme={scheme}>
            <View style={{ flex: 1, backgroundColor: background, padding: 16 }}>
              <Story />
            </View>
          </ThemeProvider>
        </SafeAreaProvider>
      );
    },
  ],
};

export default preview;
