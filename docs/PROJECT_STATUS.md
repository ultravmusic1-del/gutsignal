# GutSignal — Project Status & Hardening Plan

**Updated:** 2026-09-06 · **Branch:** `main` @ `7df27d7` · **Source of truth for project state.**

This file exists because status was drifting across `README.md`, `HANDOFF.md` and
`PROJECT_PLAN.md`, and stale status is worse here than on an ordinary team: it actively directs
coding agents. When state changes, change it **here** and let the others link to it.

---

## 1. Verified state, right now

Everything below was run on 2026-09-06, not inferred.

| Check                              | Result                                          |
| ---------------------------------- | ----------------------------------------------- |
| `npm run verify:full`              | green end to end — the same commands CI runs    |
| `npm test`                         | **1136 tests, 67 suites** — pass                |
| `npx expo-doctor`                  | **21/21**                                       |
| `npm run export:ios`               | bundles, **including Hermes bytecode** (5.8 MB) |
| RLS isolation suite (live project) | **67 assertions** pass, no leftover rows        |
| Supabase security advisor          | no lints                                        |
| `npm audit --audit-level=high`     | passes — 14 moderate, 0 high/critical           |
| CI (`.github/workflows/ci.yml`)    | **green** — all three jobs, run 34033313830     |

> The Hermes bytecode step now works locally. Windows Smart App Control had been blocking that
> binary as not-yet-reputable (ADR-0038); the block lapsed on its own, as expected. `--no-bytecode`
> is no longer needed here.

**Built:** onboarding, auth (Apple + email), all five log types offline with a durable outbox and
bidirectional sync, timeline with filter/search/edit/delete, the deterministic pattern engine with
confounders and breadth control, Insights, Gut Map, trends, appointment reports, diary export
domain logic, the analytics wall, the crash scrubber, and account deletion end to end.

### The one fact that governs the next phase

**GutSignal has never run on a physical iPhone.** `expo export` proves Metro can build a bundle.
It proves nothing about entitlements, SecureStore, Sign in with Apple, native sheets, Reanimated,
the SQLite native module, app lifecycle, release-mode behaviour, or signing.

This is not theoretical. In Milestone 6, `log/meal` was never registered in the root navigator, so
it opened as a full-screen push instead of a sheet — and **typecheck, lint, 292 tests and a full
iOS bundle all passed while it was broken.** There is now a regression test for that specific
class, but the general lesson stands: _test existence is not test evidence._

---

## 2. Closed since the review was written

Do not re-open these; they are done and verified.

- **Sync cursor pagination** — the review's P0 #1. Fixed to a keyset on `(updated_at, id)`,
  with six regression tests (201 rows, 500 rows, boundary straddle, non-deterministic tie order,
  mid-pagination update, tombstone in a tie group). All six were confirmed to fail against the old
  implementation before the fix was kept. Measured on the live project: the old cursor pulled
  **200 of 250** and wedged permanently; the keyset cursor pulls 250. Indexes moved to
  `(user_id, updated_at, id)`. ADR-0043.
- **RLS suite actually executed** against the live database. Running it found two defects that
  reading never would: the block opened with `do $` instead of `do $$`, so the file had never been
  valid SQL and _nothing_ in it had ever run. ADR-0041.
- **Account deletion**, server and client, with no target-user parameter. ADR-0042.
- **`pattern_findings`** migration applied, RLS on, covered by the isolation suite.

---

## 3. Bucket A — I can do these now, unblocked

No accounts, hardware or decisions needed. Ordered by value.

### A1. CI and repository engineering (review §16–18) — **DONE** (`20a35aa`)

- [x] `.github/workflows/ci.yml` — three jobs: `verify`, `audit`, `migrations`
- [x] `verify:fast` (typecheck + lint + tests) and `verify:full` (adds format, doctor, iOS
      bundle). CI runs the `verify:full` commands step for step, in the same order
- [x] `npm audit` gate at `--audit-level=high`. Moderate does not fail: ADR-0039 accepts two with
      a documented absence of data exposure, and 14 are currently outstanding from Expo-pinned
      transitives. A gate that fails on findings nobody may act on is one people learn to ignore
- [x] Migrations-from-zero job — starts a local Supabase, applies every migration against an empty
      database, runs `rls_isolation.sql`. The job that would have caught ADR-0041 the day it was
      written
- [x] PR template, bug template, release-checklist template. All ask for pasted output rather than
      adjectives
- [x] `.github/dependabot.yml`, ignoring the whole Expo and React Native surface, which
      `npx expo install --check` owns

**The verify job needs no secrets** — the suite was confirmed to pass with no `.env` at all — so
the gate works on a fork's pull request exactly as on a branch.

> **Validated on Actions.** It took four runs, and each failure was the gate earning its place:
> `supabase db query` cannot execute a multi-statement file (now psql with `ON_ERROR_STOP`); a
> `git add -A` swept unformatted work into an unrelated commit; and starting eleven containers to
> run one SQL file flaked on a port bind (now database-only). None of those would have been found
> by reading.

> Branch protection itself is Bucket C — only a repo admin can enable it. Everything the rules
> will enforce is now written.

### A2. Pattern-engine methodology (review §3, §31)

- [x] **Severity scoring semantics — DONE.** `comparisonEffect()` now decides which difference a
      finding is about; severity is scored from `meanSeverityDifference` over `SEVERITY_SCALE_SPAN`,
      weekly consistency measures the same quantity, and precision is unmeasured rather than
      assumed — which holds severity findings to `moderate` at best, emergently. ADR-0044
- [ ] Expand the fixture corpus with the adversarial diaries the review lists: highly correlated
      foods, correlated context factors, inconsistent logger, extreme sparsity, repetitive diet,
      simultaneous diet changes, travel, illness week, no-symptom user, very high symptom baseline
- [ ] Threshold sensitivity analysis — show which findings flip when thresholds move
- [ ] Freeze `ENGINE_VERSION` semantics for 1.0 and write down what a bump means

### A3. Test layers Jest can still reach

- [x] **Coverage thresholds — DONE.** Per-namespace, aggregated per directory, enforced in CI
      (`test:ci` now runs with `--coverage`) and confirmed to fail when breached. They are a
      **ratchet set from measurement**, not an aspiration: each sits just under what the namespace
      achieves today, so coverage cannot quietly fall.

  | Namespace                    | stmts | branch | funcs | lines |
  | ---------------------------- | ----: | -----: | ----: | ----: |
  | `src/domain/pattern-engine/` |  97.6 |   90.3 |  98.0 |  98.7 |
  | `src/domain/patterns/`       |  98.0 |   89.4 | 100.0 | 100.0 |
  | `src/services/sync/`         |  90.0 |   83.2 |  79.2 |  90.6 |
  | `src/services/db/`           |  76.1 |   40.9 |  86.7 |  75.3 |
  | `src/services/auth/`         |  29.8 |   57.9 |  12.5 |  27.7 |
  | `src/features/account/`      |  56.5 |   37.5 |  37.5 |  56.5 |

  The low numbers are not evenly spread, and the shape matters more than the average. Pure logic
  is at or near 100% — `deleteAccount.ts` is 100%, and every `db` module except one is 100%. What
  sits near zero is the thin adapters over native modules and the network: `database.ts` (the
  expo-sqlite binding), `useDeleteAccount.ts`, and the Supabase-calling half of `authService.ts`.
  Unit-testing those means mocking the SDK and asserting against the mock, which is the kind of
  test that passes while the app is broken.

- [ ] **Raise `services/auth` deliberately.** Its floor is honest but low. The right cover for it
      is the device pass and the E2E flows, not more mocks — so it should rise as those land,
      rather than by adding unit tests that prove nothing
- [ ] Timezone matrix as real tests: Bahrain→London, London→New York, DST start/end, 23:59 and
      00:01 logs, timezone change while offline, entry edited in a second timezone
- [ ] Destructive-path tests that need no device: malformed server row, schema mismatch, corrupt
      outbox JSON, 429/401/500 responses, network loss mid-batch, 1,000-entry outbox,
      same record edited on two devices, offline delete vs remote edit
- [ ] Assert report semantics match Insights semantics, and export semantics match Timeline

### A4. Diagnostics and provenance (review §23–24) — **DONE**

- [x] Hidden panel at `app/diagnostics.tsx`, reached by tapping the version row in You seven times.
      Shows version, build number, commit SHA, environment, Supabase project ref and bundle id
- [x] The SHA is real: `EAS_BUILD_GIT_COMMIT_HASH` on a build, local `git rev-parse` otherwise,
      `unknown` where neither works rather than a guess — a wrong SHA in a bug report is worse than
      no SHA. Verified locally to match `HEAD`
- [x] `EAS_BUILD_PROFILE` names the environment in the app, so a preview build accidentally pointed
      at production is visible in the first screenshot rather than after an afternoon
- [x] Identifiers only. The project ref is in every request URL and is not a secret; the
      publishable key is absent, because a screenshot of a diagnostics panel ends up in a support
      thread. A test asserts nothing credential-shaped can reach the screen whatever it is handed

### A5. E2E scaffolding (review §19) — **WRITTEN, NEVER RUN**

- [x] Eight Maestro flows in `.maestro/`, chosen against §54's priority order rather than as a map
      of the app: onboarding to first entry, offline logging surviving a force-quit, offline edit,
      offline delete propagating as a tombstone, the sign-out warning, account switching, account
      deletion, and the two native sheets
- [x] Targeted by accessibility label rather than testID — §36 already requires those labels to
      exist and stay accurate, so the flows lean on something the app must maintain anyway
- [x] Each flow names the assertions Maestro **cannot** make, as SQL to run against Supabase
      afterwards. The flows assert what the app shows; sync is the claim that the app and the
      server agree, and only half of that is visible from the phone

> **None of these has ever run.** Every selector was read out of the source rather than observed on
> screen, so expect to fix some on the first device session. They exist now so that session is
> spent finding out whether GutSignal works rather than deciding what to try.
>
> A green run is not evidence until a flow has failed once for a real reason. A suite that has only
> ever passed is the trap ADR-0041 describes.

### A6. Export delivery — **DONE**

- [x] `expo-file-system` and `expo-sharing` installed via `npx expo install`, with the
      `expo-sharing` config plugin registered
- [x] A picker on Privacy & Data offering all six files — the complete JSON record and the five
      per-table CSVs. iOS shares one URL, so rather than adding a zip dependency the user chooses;
      the default is everything, one tap
- [x] Written to the **cache** directory, and only after checking the device can share. An export
      that cannot be delivered leaves no copy of the diary behind (§28)
- [x] A test pins the picker list to what `buildDiaryExport` actually returns, so a file added
      later cannot become unreachable from the UI

### A7. Documentation consolidation (review §15)

- [x] `README.md` — the milestone table, the 357-test claim, the "29 ADRs" count and the
      provisional bundle identifier are gone. It now carries setup, commands and a summary that
      points here
- [x] `HANDOFF.md` reduced to a pointer. It was written to be read first by agents and had gone on
      describing a paused database, an unapplied migration and an unwritten deletion flow, all of
      which were done. The full text stays in git history
- [ ] Architecture and data-flow diagrams
- [ ] Threat model refreshed for account deletion and the Edge Function boundary

---

## 4. Bucket B — I can do these once you give me one thing

Each is blocked on exactly one input. Nothing else stands in the way.

| Task                                                                                        | What I need from you                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Commit the real EAS project ID and unblock every build workflow                             | Run `eas init` (needs your Expo login)           |
| Wire Sentry behind the existing scrubber, and prove the scrubber against a real SDK payload | A Sentry DSN                                     |
| Wire PostHog behind the existing analytics wall, verify no health data leaves               | A PostHog project key                            |
| Point `preview`/`production` EAS profiles at separate backends                              | A second Supabase project for staging            |
| Enable Sign in with Apple in the Supabase dashboard                                         | Apple provider credentials (needs Apple account) |
| CI that runs migrations + RLS against a real hosted project                                 | A Supabase access token as a GitHub secret       |
| Trigger EAS builds from CI                                                                  | An `EXPO_TOKEN` as a GitHub secret               |

> On separate environments (review §22): I can write the config and the env-plumbing now, but
> until a staging project exists, "staging" would just be production wearing a different name —
> which is worse than not having it, because it reads as a safety boundary that is not there.

---

## 5. Bucket C — only you can do these

Not a matter of permission. These need hardware, an Apple identity, money, or a product judgement
that is not mine to make.

### C1. Getting onto the phone — the gate everything else waits behind

- [ ] Apple Developer Program enrolment
- [ ] `eas login`, `eas init`, `eas device:create`, register the iPhone
- [ ] `eas build --profile development --platform ios`
- [ ] Install on the device and confirm it boots
- [ ] App Store Connect app record; enable **Sign in with Apple** only, nothing else yet

### C2. Physical-device acceptance (nothing here is reachable from Windows)

Boot · SQLite · SecureStore · Sign in with Apple · email auth · every native sheet, detent and
swipe-dismiss · keyboard behaviour and avoidance · airplane-mode logging · force-close offline ·
reopen offline · reconnect and confirm Supabase received the exact records · edit sync · deletion
sync · account switching · full account deletion · report print/share sheet.

Session lifecycle: backgrounded 10 minutes, 1 hour, overnight · expired refresh token · revoked
session · airplane mode then resume · network change during token renewal · Apple credential
revoked · reinstall.

### C3. Accessibility and device-matrix passes (review §12, §28)

VoiceOver order and dismissal · Dynamic Type at maximum · Bold Text · Increase Contrast · Reduce
Motion · Reduce Transparency · Button Shapes · 44×44 targets · iPhone SE and Pro Max layouts ·
light and dark · multiple iOS versions.

### C4. Release engineering that needs an Apple identity

TestFlight install on a clean device · TestFlight upgrade over an older version · local SQLite
migration across app versions with data preserved · release-mode (not development) build
behaviour · native crash behaviour.

### C5. Product and clinical decisions I should not make for you

- [ ] **Option A (lean: Track → Timeline → Patterns → Reports) vs Option B (adds Experiments).**
      The reviewer leans B with Experiments before Ask My Gut, and so do I — the pattern engine is
      the moat, and Experiments turn observation into action without an LLM. But it is a scope call
- [ ] Red-flag safety (R-05): static "see a doctor" copy for V1, or a sourced clinical ruleset?
- [ ] Photo retention default — analyse-then-delete, with retention opt-in?
- [ ] AI provider constraints — blocks M7 and M10
- [ ] Free/premium boundary, before RevenueCat work is worth starting
- [ ] **Manual review of pattern-engine output with a clinical perspective.** I can generate the
      diaries and the findings; judging whether the language is safe and useful to a clinician is
      a human call
- [ ] Database backups configured, restore procedure tested on staging

---

## 6. Recommended order

1. **A1 — CI and PR protection.** The repository engineering is the weakest layer and the cheapest
   to fix. Do it before more code lands, so everything after is gated
2. **C1 — get it on the phone.** Nothing else in Bucket C can start until this does, and it is
   worth more now than another hundred unit tests
3. **C2 — the offline/sync acceptance run.** The product's whole claim rests on it
4. **A7 — documentation**, so agents stop reading stale state
5. **A2 — severity scoring**, before any surface markets severity findings
6. **B — observability and staging**, as the inputs arrive
7. **A5/A6 — E2E flows and export delivery**
8. **Experiments**, if you choose Option B

---

## 7. What not to do

From the review, and worth keeping: do not replace SQLite with a sync framework, do not move
analysis to an LLM, do not put everything in Zustand, do not turn repositories into hooks, do not
remove the deterministic domain layer, do not switch backends without a concrete limitation, and
do not rewrite in Swift. The architecture is not what needs work.
