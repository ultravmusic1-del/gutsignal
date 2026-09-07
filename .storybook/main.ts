import type { StorybookConfig } from '@storybook/react-native-web-vite';

/**
 * Storybook, on React Native Web.
 *
 * ## Why the web framework rather than on-device Storybook
 *
 * `@storybook/react-native` renders stories inside the app itself, which means swapping the app's
 * entry point — and GutSignal's entry is `expo-router/entry`, which owns routing. Trading the
 * production router for a story browser is exactly the disruption this setup is meant to avoid.
 *
 * The web framework runs Storybook as its own Vite server on port 6006, renders the *same*
 * components through `react-native-web`, and leaves the app untouched. It is also the surface a
 * coding agent can actually drive through a browser, which is the point of having it.
 *
 * Native remains the source of truth for anything native (see `docs/UI_DEVELOPMENT_WORKFLOW.md`).
 * Storybook is for layout, spacing, typography, states and variants.
 */
const config: StorybookConfig = {
  // Colocated, next to the components they document — matching how `__tests__` already sit beside
  // the code. A central `stories/` directory would put the story a directory away from the thing
  // it describes, which is how stories rot.
  stories: ['../src/**/*.stories.@(ts|tsx)'],

  addons: ['@storybook/addon-docs'],

  framework: {
    name: '@storybook/react-native-web-vite',
    options: {},
  },
};

export default config;
