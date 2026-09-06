# GutSignal — Project Status & Hardening Plan

**Updated:** 2026-09-06 · **Branch:** `main` @ `3b60aec` · **Source of truth for project state.**

This file exists because status was drifting across `README.md`, `HANDOFF.md` and
`PROJECT_PLAN.md`, and stale status is worse here than on an ordinary team: it actively directs
coding agents. When state changes, change it **here** and let the others link to it.

---

## 1. Verified state, right now

Everything below was run on 2026-09-06, not inferred.

| Check                              | Result                                          |
| ---------------------------------- | ----------------------------------------------- |
| `npm run verify:full`              | green end to end — the same commands CI runs    |
| `npm test`                         | **1286 tests, 79 suites** — pass                |
| `npx expo-doctor`                  | **21/21**                                       |
| `npm run export:ios`               | bundles, **including Hermes bytecode** (5.9 MB) |
| RLS isolation suite (live project) | **67 assertions** pass, no leftover rows        |
| Supabase security advisor          | no lints                                        |
| `npm audit --audit-level=high`     | passes — 14 moderate, 0 high/critical           |
| CI (`.github/workflows/ci.yml`)    | **green** — all three jobs, run 34049663895     |

> The Hermes bytecode step now works locally. Windows Smart App Control had been blocking that
> binary as not-yet-reputable (ADR-0038); the block lapsed on its own, as expected. `--no-bytecode`
> is no longer needed here.

**Built:** onboarding, auth (Apple + email), all five log types offline with a durable outbox and
bidirectional sync, timeline with filter/search/edit/delete, the deterministic pattern engine with
confounders and breadth control, Insights, Gut Map, trends, appointment reports, diary export
domain logic, the analytics wall, the crash scrubber, account deletion end to end, and local
reminders with quiet hours (Milestone 14).

### The one fact that governed the last phase, and what it cost

**GutSignal now runs on a physical iPhone**, in Expo Go, as of 2026-09-06. That is the first time,
and it took four defects to get there — every one of them invisible to 1200 passing tests, a clean
typecheck and a full iOS bundle:

1. **`openDatabase` migrated concurrently.** It memoized the resolved handle, so during the open
   itself it memoized nothing. Twenty call sites raced, `expo-sqlite` gave each the same native
   connection, and overlapping `BEGIN`s gave `cannot start a transaction within a transaction`.
   The app never got past its boot screen. ADR-0046.
2. **A failed open leaked the connection**, and `expo-sqlite` refuses to delete an open database —
   so the boot screen's recovery button could not work either.
3. **The recovery button swallowed its own error**, making a real failure look like a dead button.
4. **`(auth)` and `(onboarding)` were groups with no `_layout`**, so twelve screens were
   registered nowhere while the root declared two routes that matched nothing.

Nothing on this list is exotic. Every one needed a device, or a test written to model what the
device actually does — which is now the standard the database tests are held to: `serialize.test.ts`
and `database.test.ts` run against a connection reproducing `expo-sqlite`'s real transaction
semantics over a real SQL engine, and each shows its scenario failing without the fix.

The older lesson stands unchanged. In Milestone 6, `log/meal` was never registered in the root
navigator, so it opened as a full-screen push instead of a sheet — and **typecheck, lint, 292 tests
and a full iOS bundle all passed while it was broken.** _Test existence is not test evidence._

**Still unproven on device:** a development build (Expo Go is not the same binary), entitlements,
SecureStore, Sign in with Apple, release-mode behaviour, and signing. Section 5 is still the gate.

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
- **Local writes serialised.** Beyond the boot crash, the sync engine's untransacted writes — an
  outbox row cleared, a cursor advanced, on a timer — were joining whatever transaction the user's
  save happened to have open, so a rolled-back meal took sync progress with it and the record
  uploaded twice. Every operation on the connection now goes through one queue and the raw handle
  never reaches application code. ADR-0046.
- **Route groups are navigators.** `(auth)` and `(onboarding)` have `_layout.tsx` files, and the
  registration test derives its rule from where the layouts are rather than assuming a
  parenthesised directory owns its children.

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
- [x] **Adversarial fixtures — DONE.** Five added to the §42 corpus, now twenty: an inconsistent
      logger who works in bursts, an illness week where everything is bad regardless of the factor,
      a user who never records a symptom at all, a very high symptom baseline where 97% against 93%
      must not become a finding, and two diet changes starting on the same day. All five passed
      their expectations first time, which is the engine behaving as documented
- [x] **Threshold sensitivity — DONE.** Five flip-point tests in `scoring.test.ts`: one step below
      and exactly at each gate, so the point at which a finding changes is written down rather than
      inferred from a constant. Changing a threshold now fails a test that names the affected
      behaviour, and a gate nothing depends on shows up as a gate that has stopped working
- [x] **`ENGINE_VERSION` frozen for 1.0 — DONE.** `PATTERN_ENGINE.md` §12 now says what 1.0.0
      covers, what forces a bump and what does not, and — the part that bites — what a bump does to
      findings already stored: `pattern_findings` gains a parallel row rather than overwriting, so
      anything reading that table must filter to the current version. Nothing reads it yet, which
      is exactly why the rule is written down now

### A3. Test layers Jest can still reach

- [x] **Coverage thresholds — DONE.** Per-namespace, aggregated per directory, enforced in CI
      (`test:ci` now runs with `--coverage`) and confirmed to fail when breached. They are a
      **ratchet set from measurement**, not an aspiration: each sits just under what the namespace
      achieves today, so coverage cannot quietly fall.

  | Namespace                    | stmts | branch | funcs | lines |
  | ---------------------------- | ----: | -----: | ----: | ----: |
  | `src/domain/pattern-engine/` |  97.6 |   90.3 |  98.0 |  98.7 |
  | `src/domain/patterns/`       |  98.0 |   89.4 | 100.0 | 100.0 |
  | `src/services/sync/`         |  91.8 |   83.9 |  79.2 |  92.7 |
  | `src/services/db/`           |  76.1 |   40.9 |  86.7 |  75.3 |
  | `src/services/auth/`         |  29.8 |   57.9 |  12.5 |  27.7 |
  | `src/features/account/`      |  56.5 |   37.5 |  37.5 |  56.5 |

  The low numbers are not evenly spread, and the shape matters more than the average. Pure logic
  is at or near 100% — `deleteAccount.ts` is 100%, and every `db` module except one is 100%. What
  sits near zero is the thin adapters over native modules and the network: `database.ts` (the
  expo-sqlite binding), `useDeleteAccount.ts`, and the Supabase-calling half of `authService.ts`.
  Unit-testing those means mocking the SDK and asserting against the mock, which is the kind of
  test that passes while the app is broken.

> **Not a Bucket A task, deliberately.** `services/auth`'s floor is honest but low, and the right
> cover for it is the device pass (§5 C2) and the E2E flows, not more mocks. It rises when those
> run. Unit tests over the Supabase SDK would raise the number and prove nothing, which is the
> kind of coverage this project has no use for.

- [x] **Timezone matrix — DONE.** `pattern-engine/__tests__/timezones.test.ts` joins the write path
      to the read path: same instant in two zones, a Bahrain→London move mid-diary, the 23-hour and
      25-hour DST days, and a meal-only day staying unknown. Instants chosen so the UTC and local
      dates disagree on every day — an earlier draft passed while a UTC-grouping mutation was
      caught by only one of ten tests
- [x] **Destructive paths — DONE.** `services/sync/__tests__/destructive.test.ts`: an unreadable
      server page, a corrupt outbox payload, a 400-entry backlog, and the same record edited in two
      places. **Writing them found a real defect** — a failed pull rejected the whole run, skipped
      every remaining entity and was swallowed silently by `SyncProvider`. Fixed in ADR-0045
- [x] **Surfaces agree — DONE.** `domain/__tests__/semantics.test.ts` pins the Insights screen, the
      printed report and the exported file to the same answers: the same findings stand out, the
      same ones are emerging, statuses match, and the report can never surface something the screen
      suppressed — Insights is where the §21 conservatism lives, and the report is the artefact that
      reaches a clinician. The export is asserted to carry every entry of every kind, with both the
      instant and the local reading of every timestamp

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
- [x] **Diagrams — DONE.** `docs/ARCHITECTURE.md`, which `CLAUDE.md` §47 expected and nobody had
      written. Five Mermaid diagrams: the layer dependencies, the offline write path, the pull and
      its keyset cursor, the diary-to-finding pipeline, and where the secrets are and are not.
      Deliberately thin — the reasoning stays in the documents that own it, because duplicating it
      is how five files come to disagree
- [x] **Threat model refreshed — DONE.** `PROJECT_PLAN.md` §5.3 gained T13 (the delete endpoint
      aimed at someone else — mitigated by there being no user id parameter at all), T14 (the
      service-role key escaping through a log) and T15 (a pull cursor skipping rows permanently).
      Three existing rows had "verified by" claims that were no longer true: T1 cited a pgTAP suite
      that does not exist, and T9 and T10 claimed tests that are written but unrun. All corrected —
      a threat table that overstates its verification is worse than one with gaps in it

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

---

## 8. Milestone 14 — Notifications (2026-09-06)

Shipped: morning check-in, evening check-in, weekly review, quiet hours, per-reminder times, and a
permission prompt opened only by a deliberate press. All local scheduling, so it works in Expo Go
and is verifiable on the phone now rather than after a development build.

**Two spec toggles are deliberately absent.** Experiment reminders need experiments (Milestone 11)
and product updates need a push channel that does not exist. A switch that cannot do what its label
says is the placeholder control `CLAUDE.md` §57 rules out; each is one line away once the thing
behind it exists.

**Still needs the phone.** Everything above is unit-tested, and none of it proves iOS actually
delivers a reminder. The device pass is: allow notifications, set the evening check-in a few
minutes ahead, background the app, and wait. Then set one inside quiet hours and confirm the row
says it will not be sent. Then deny notifications in iOS Settings, reopen, and confirm the screen
says iOS is blocking them rather than pretending to work.

**Deferred, not forgotten:** preferences are device-local and not synced. That is correct for a
schedule registered with one phone's OS, but it means a second device starts from the defaults. If
that becomes wrong, the fix is a `notification_preferences` column on `user_preferences` and a
last-writer-wins merge — not the outbox, which carries health records.
