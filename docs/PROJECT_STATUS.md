# GutSignal — Project Status & Hardening Plan

**Updated:** 2026-09-06 · **Branch:** `main` @ `7df27d7` · **Source of truth for project state.**

This file exists because status was drifting across `README.md`, `HANDOFF.md` and
`PROJECT_PLAN.md`, and stale status is worse here than on an ordinary team: it actively directs
coding agents. When state changes, change it **here** and let the others link to it.

---

## 1. Verified state, right now

Everything below was run on 2026-09-06, not inferred.

| Check                              | Result                                   |
| ---------------------------------- | ---------------------------------------- |
| `npm run verify`                   | **1131 tests, 67 suites** — pass         |
| `npx expo-doctor`                  | **21/21**                                |
| `npx expo export --platform ios`   | bundles (1988 modules)                   |
| RLS isolation suite (live project) | **67 assertions** pass, no leftover rows |
| Supabase security advisor          | no lints                                 |
| `npm run format:check`             | clean                                    |

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

### A1. CI and repository engineering (review §16–18) — highest value

- [ ] `.github/workflows/ci.yml`: `npm ci` → typecheck → lint → `format:check` → jest
      `--runInBand` → `expo-doctor` → `expo export --platform ios`
- [ ] Split `verify` into `verify:fast` (typecheck + lint + tests) and `verify:full` (adds format,
      doctor, ios export); point CI at `verify:full`
- [ ] `npm audit` job with a policy that tolerates Expo-pinned transitives rather than auto-fixing
      (see ADR-0039 — two moderate advisories are already accepted, not ignored)
- [ ] Migration-from-zero job: spin up Postgres in CI, apply every migration in order, run
      `rls_isolation.sql`, assert the schema. This is the job that would have caught the `do $`
      defect on the day it was written
- [ ] PR template, bug template, release-checklist template
- [ ] `.github/dependabot.yml` scoped so it cannot propose upgrades that break the SDK 57 pin

> Branch protection itself is Bucket C — only a repo admin can enable it. I can write everything
> the rules will enforce.

### A2. Pattern-engine methodology (review §3, §31)

- [ ] **Severity scoring semantics.** `status` and `confidence` still derive from
      `absoluteDifference` (occurrence) for every outcome kind, so equal frequency with very
      different intensity scores `no_clear_pattern`. Score severity from `meanSeverityDifference`
      on its own scale. Needs an ADR and fixture scenarios; documented today as a known limitation
      in `PATTERN_ENGINE.md` §6 rather than left silent
- [ ] Expand the fixture corpus with the adversarial diaries the review lists: highly correlated
      foods, correlated context factors, inconsistent logger, extreme sparsity, repetitive diet,
      simultaneous diet changes, travel, illness week, no-symptom user, very high symptom baseline
- [ ] Threshold sensitivity analysis — show which findings flip when thresholds move
- [ ] Freeze `ENGINE_VERSION` semantics for 1.0 and write down what a bump means

### A3. Test layers Jest can still reach

- [ ] Coverage thresholds on the namespaces where correctness matters, not globally:
      `domain/pattern-engine`, `services/sync`, `services/db`, `services/auth`, `features/account`
- [ ] Timezone matrix as real tests: Bahrain→London, London→New York, DST start/end, 23:59 and
      00:01 logs, timezone change while offline, entry edited in a second timezone
- [ ] Destructive-path tests that need no device: malformed server row, schema mismatch, corrupt
      outbox JSON, 429/401/500 responses, network loss mid-batch, 1,000-entry outbox,
      same record edited on two devices, offline delete vs remote edit
- [ ] Assert report semantics match Insights semantics, and export semantics match Timeline

### A4. Diagnostics and provenance (review §23–24)

- [ ] Hidden diagnostics panel: `APP_ENV`, build channel, Supabase project ref, version, build
      number, git SHA. Identifiers only, never secrets
- [ ] Wire the SHA and channel in at build time so a TestFlight report maps to an exact build

### A5. E2E scaffolding (review §19)

- [ ] Write the 8–12 critical journeys as Maestro flows and commit them. **Authoring is Bucket A;
      running them needs a device or simulator, which is Bucket C.** Writing them now means the
      first device session has a script instead of improvisation

### A6. Export delivery (dependencies already approved)

- [ ] Install `expo-file-system` + `expo-sharing` via `npx expo install`, wire the control on
      Privacy & Data. The domain layer (`buildDiaryExport`) is done and tested; only delivery is
      missing. Closes spec §98

### A7. Documentation consolidation (review §15)

- [ ] `README.md` — currently claims 357 tests and M0–M6. Reduce to setup, commands, and a link
      here
- [ ] Fold `HANDOFF.md` into this file; it is a loop artefact whose state is superseded
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
