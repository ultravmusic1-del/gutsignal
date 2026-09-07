// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration.
 *
 * This file exists only because of the **web** target, which is a development surface for looking
 * at the UI (see `docs/UI_DEVELOPMENT_WORKFLOW.md`). Nothing here changes how iOS builds: the
 * default config is taken as-is and one asset extension is added to it.
 *
 * `expo-sqlite` on web is wa-sqlite compiled to WebAssembly, loaded in a worker. Metro does not
 * treat `.wasm` as an asset by default, so the worker's `import wasmModule from
 * './wa-sqlite/wa-sqlite.wasm'` fails to resolve and the whole web bundle dies at the first screen
 * — which reads the local database.
 */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

/**
 * Cross-origin isolation, for the same reason.
 *
 * wa-sqlite's OPFS backend uses `SharedArrayBuffer`, which browsers only expose to a
 * cross-origin-isolated document. Without these two headers the worker starts and then fails on
 * the first query, which presents as an empty screen rather than as an error.
 *
 * Dev server only. This middleware is not part of any build, and iOS never sees it.
 */
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = config;
