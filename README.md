# GutSignal

Gut-health tracking app. Log meals, symptoms and bowel patterns; a deterministic engine finds
recurring associations in your own data.

iOS-first, React Native + Expo, Supabase backend. Developed on Windows — iOS builds run on EAS,
never locally.

---

## Start here (new machine or new session)

```bash
npm install
```

```bash
cp .env.example .env
```

Then fill `.env` with the two required values (see [Environment](#environment)), and:

```bash
npx expo start --dev-client
```

Read [CLAUDE.md](CLAUDE.md) first if you are an agent. Then
[docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) §12 for exactly where the work stopped.

---

## Dependencies to install

### System tools (not in `package.json`)

| Tool             | Install              | Needed for                                                              |
| ---------------- | -------------------- | ----------------------------------------------------------------------- |
| Node.js LTS      | winget / nvm-windows | everything                                                              |
| Git              | winget               | everything                                                              |
| EAS CLI 22.x     | `npm i -g eas-cli`   | iOS builds and submissions                                              |
| Supabase CLI 2.x | `npm i -g supabase`  | local migration workflow (optional — migrations can be applied via MCP) |

Not needed: Xcode, macOS, Android Studio, Watchman, Docker.

### npm packages

`npm install` covers everything. Versions are pinned to the Expo SDK 57 line.

**Always add packages with `npx expo install <pkg>`, never `npm install <pkg>@latest`.** The SDK
pins versions that differ from npm's newest — `react-native@0.86.2` while npm `latest` says
`0.87.0`, for instance. Installing the newest builds fine on Windows and fails on EAS.
See ADR-0023.

Runtime: `expo` · `expo-router` · `react-native` · `@supabase/supabase-js` ·
`@tanstack/react-query` · `zustand` · `zod` · `react-hook-form` + `@hookform/resolvers` ·
`expo-sqlite` · `expo-secure-store` · `expo-apple-authentication` · `expo-haptics` ·
`expo-network` · `expo-crypto` ·
`react-native-svg` · `react-native-reanimated` · `react-native-gesture-handler` ·
`react-native-safe-area-context` · `react-native-screens`

Dev: `jest-expo` · `jest` · `@testing-library/react-native` · `test-renderer` · `eslint` +
`eslint-config-expo` · `prettier` · `typescript`

> `test-renderer` (not `react-test-renderer`) is required by RNTL v14, and its `render` is
> **async** — `await render(...)` in every component test.
>
> The offline layer is tested against **real SQLite** using Node's built-in `node:sqlite`, so
> transactions, constraints and rollback are exercised for real. Those suites carry a
> `@jest-environment node` docblock; without it the built-in module is unavailable. See
> ADR-0033.

---

## Environment

`.env` is git-ignored. `.env.example` lists the names. Only `EXPO_PUBLIC_*` values belong in it.

**Required now:**

| Variable                               | Where to get it                                                      |
| -------------------------------------- | -------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | Supabase dashboard → Project Settings → API                          |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page — the `sb_publishable_…` key, **not** the service role key |

Supabase project: `mrqxmkxhyohlywiziofz` (`gutsignal`, ap-northeast-2).

**Later milestones:** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (M12),
`EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_SENTRY_DSN` (M16).

Server secrets (AI provider keys, RevenueCat webhook secret, service role key) live **only** in
Supabase Edge Function secrets. Never prefix a secret with `EXPO_PUBLIC_` — anything so
prefixed is embedded in the app binary.

Without a valid `.env` the app boots to a configuration-error screen naming the missing
variables. That is expected behaviour, not a bug.

---

## Commands

| Command                          | Does                                               |
| -------------------------------- | -------------------------------------------------- |
| `npm start`                      | Metro with dev-client                              |
| `npm run verify`                 | typecheck + lint + tests (run before every commit) |
| `npm test`                       | Jest                                               |
| `npm run typecheck`              | `tsc --noEmit`                                     |
| `npm run lint`                   | ESLint                                             |
| `npm run doctor`                 | `expo-doctor` — 21 project checks                  |
| `npx expo export --platform ios` | full Metro bundle; catches what typecheck cannot   |

Database migrations live in `supabase/migrations/` and are applied via the Supabase MCP server
or the CLI. RLS isolation tests: `supabase/tests/rls_isolation.sql`.

---

## Current state

**Milestones 0–4 complete. Milestone 5 in progress** — symptom and meal logging work end to
end, offline. 292 tests passing, `expo-doctor` 21/21, iOS bundle builds.

| #   | Milestone              | State                                                                                |
| --- | ---------------------- | ------------------------------------------------------------------------------------ |
| 0   | Technical audit        | Done — plan, 29 ADRs, Windows/iOS workflow                                           |
| 1   | Foundation             | Done — theme, UI primitives, boot sequence, Supabase client, local SQLite            |
| 2   | Design system + shells | Done — floating nav, four tabs, log sheet                                            |
| 3   | Auth                   | Done — Apple + email OTP, `profiles` table, RLS verified                             |
| 4   | Onboarding             | Done — full flow, preferences schema, RLS verified                                   |
| 5   | Offline logging        | **In progress** — symptoms and meals done end to end; bowel, wellbeing, context next |

**Nothing has ever run on a physical device.** All verification so far is tests, bundling and
direct database checks. Milestone 5's acceptance criterion (log in airplane mode, reconnect,
verify sync) cannot be met without one — the offline guarantees are covered by tests against a
real SQL engine, but no log has been made on a phone.

---

## Blocked on the project owner

1. **Apple Developer Program** enrollment — approval takes 24–48h, blocks every iOS build.
2. **Bundle identifier** — `app.config.ts` uses the provisional `com.gutsignal.app`. It cannot
   change after a store release.
3. **Apple auth provider** — not yet enabled in the Supabase dashboard. Sign in with Apple
   fails on device until it is (the app detects this and points the user at email sign-in).

Everything not depending on these is buildable now.

---

## Documentation

| Doc                                                          | Contents                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                       | Engineering rules. Read before changing anything                    |
| [docs/MASTER_BUILD_SPEC.md](docs/MASTER_BUILD_SPEC.md)       | The product specification — source of truth                         |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)                 | Architecture, schema, privacy/threat model, risks, milestone status |
| [docs/DECISIONS.md](docs/DECISIONS.md)                       | 29 ADRs — read before reversing a decision                          |
| [docs/DATABASE.md](docs/DATABASE.md)                         | Tables, RLS policies, security verification, auth config            |
| [docs/WINDOWS_IOS_WORKFLOW.md](docs/WINDOWS_IOS_WORKFLOW.md) | Prerequisites → dev build → TestFlight → App Store, without a Mac   |

---

## Non-negotiables

Short version of `CLAUDE.md`, because these are the ones that get eroded:

- GutSignal reports **associations, never causes or diagnoses**. A test scans all source for
  causal and diagnostic phrasing.
- **RLS on every user table**, tested. A table without an entry in `rls_isolation.sql` is
  unfinished.
- **The pattern engine is deterministic.** An LLM may explain a finding; it may never produce
  one.
- **No health content in analytics or crash reports.** Ever.
- **Logging works offline.** A dropped connection must never lose an entry.
- **No fake buttons.** A control that does nothing does not ship.
