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
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for exactly where the work stopped and what is
blocked on whom.

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

| Command                 | Does                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `npm start`             | Metro with dev-client                                           |
| `npm run verify`        | alias for `verify:fast` — run before every commit               |
| `npm run verify:fast`   | typecheck + lint + tests. The inner loop                        |
| `npm run verify:full`   | adds format, `expo-doctor` and the iOS bundle. **What CI runs** |
| `npm test`              | Jest                                                            |
| `npm run test:ci`       | Jest, serial and non-interactive                                |
| `npm run typecheck`     | `tsc --noEmit`                                                  |
| `npm run lint`          | ESLint                                                          |
| `npm run doctor`        | `expo-doctor` — 21 project checks                               |
| `npm run export:ios`    | full Metro bundle; catches what typecheck cannot                |
| `npm run report:sample` | renders a sample appointment report and opens it                |

`verify:full` runs exactly what CI runs, in the same order. If it is green locally it should be
green on the pull request.

Database migrations live in `supabase/migrations/` and are applied via the Supabase MCP server or
the CLI. RLS isolation tests: `supabase/tests/rls_isolation.sql` — CI applies every migration from
zero and runs that suite on every pull request.

### Diagnostics

**Tap the version row in You seven times.** It opens a panel naming the version, build number,
commit SHA, environment and Supabase project reference — everything needed to answer "which build,
pointed at which backend?" from a single screenshot.

Hidden rather than listed because it exists for support conversations, not for browsing. It is not
secret, which is why it is written down here. Everything on it is an identifier; the publishable
key and every credential are deliberately absent, and `src/config/buildInfo.ts` carries a test
asserting nothing credential-shaped can reach that screen.

The commit comes from `EAS_BUILD_GIT_COMMIT_HASH` on a real build and from local git otherwise. A
build showing `unknown` was made outside both.

---

## Current state

**[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) is the source of truth for project state.** It
is the only file to update when state moves; this section is a summary and will otherwise drift,
which is how this README came to claim 357 tests while `main` had 1131.

As of 2026-09-06: **1201 tests across 72 suites**, `expo-doctor` 21/21, iOS bundle builds, and the
RLS isolation suite passing 67 assertions against the live database.

Built: onboarding, auth, all five log types offline with a durable outbox and bidirectional sync,
the timeline, the deterministic pattern engine, Insights, Gut Map, trends, appointment reports,
diary export domain logic, the analytics wall, the crash scrubber, and account deletion end to end.

**Nothing has ever run on a physical iPhone.** Every verification so far is tests, bundling and
direct database checks. `expo export` proves Metro can build a bundle; it proves nothing about
entitlements, SecureStore, native sheets, the SQLite native module or signing. Getting a build onto
a device is the highest-value next step — see PROJECT_STATUS §5.

---

## Blocked on the project owner

The full list, with what each one unblocks, is in
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) §4 and §5. The short version:

1. **Apple Developer Program** enrolment — blocks every iOS build and all device verification.
2. **`eas init`** — `app.config.ts` still carries `projectId: undefined`, so no build can be
   attributed to a project.
3. **Apple auth provider** in the Supabase dashboard — Sign in with Apple fails on device until it
   is enabled. The app detects this and points the user at email sign-in.
4. **A Sentry DSN and a PostHog key** — the scrubber and the analytics wall are built and tested;
   neither is wired to a real service.

The bundle identifier is settled: `com.vivaan.gutsignal`, confirmed 2026-08-24. It cannot change
after a store release.

---

## Documentation

| Doc                                                          | Contents                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)             | **Project state, blockers and the hardening plan. Start here**    |
| [CLAUDE.md](CLAUDE.md)                                       | Engineering rules. Read before changing anything                  |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | The shape of the system, in diagrams                              |
| [docs/MASTER_BUILD_SPEC.md](docs/MASTER_BUILD_SPEC.md)       | The product specification — source of truth for behaviour         |
| [docs/DECISIONS.md](docs/DECISIONS.md)                       | 43 ADRs — read before reversing a decision                        |
| [docs/PATTERN_ENGINE.md](docs/PATTERN_ENGINE.md)             | Every threshold, why it was chosen, and the honest limitations    |
| [docs/PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md)         | Data classes, RLS, scrubbing, and what is not protected yet       |
| [docs/DATABASE.md](docs/DATABASE.md)                         | Tables, RLS policies, security verification, auth config          |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)                 | Architecture, schema, threat model, risks                         |
| [docs/WINDOWS_IOS_WORKFLOW.md](docs/WINDOWS_IOS_WORKFLOW.md) | Prerequisites → dev build → TestFlight → App Store, without a Mac |

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
