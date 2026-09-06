// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions are Deno, not React Native: they use `Deno.serve`, `npm:` specifiers and a
    // different global set, none of which this config knows about. They are typechecked by the
    // Deno toolchain at deploy time instead, and excluded from tsconfig for the same reason.
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/functions/*'],
  },
  {
    rules: {
      // Health data must never reach a console in a release build.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
