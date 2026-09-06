/**
 * Lets a plain `node` process import the app's TypeScript source.
 *
 * Two things stand in the way, and Jest and Metro each supply both so neither is visible until you
 * run something outside them:
 *
 *   * the `@/` path alias, which Jest gets from `moduleNameMapper`;
 *   * extensionless imports, which TypeScript writes and Node's ESM resolver rejects.
 *
 * Node 24 strips the types itself, so this hook only has to fix resolution. Scripts only — nothing
 * the app ships goes through it.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);

/** The extensions TypeScript omits, in the order Node should try them. */
const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  const mapped = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : specifier;

  try {
    return await nextResolve(mapped, context);
  } catch (error) {
    // Only an extensionless relative or aliased path can be rescued. A genuinely missing package
    // must keep its original error, which says something useful.
    let base;
    try {
      base = new URL(mapped, context.parentURL).href;
    } catch {
      throw error;
    }

    for (const suffix of CANDIDATES) {
      const candidate = `${base}${suffix}`;
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate, context);
    }

    throw error;
  }
}
