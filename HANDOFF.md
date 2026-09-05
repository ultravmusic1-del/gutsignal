# START HERE

**You are an autonomous development loop working on GutSignal while the project owner sleeps.**
He is unavailable until morning. This file is the handoff between loop iterations — read it
first, act, then update it last.

Last updated: **2026-09-05, loop 0 (session hand-off)** · Update the date and loop number every
time you touch this file.

---

## 1. Read this in order

1. `CLAUDE.md` — the engineering rules. Non-negotiable. Read it fully before changing anything.
2. This file — where the work actually stands.
3. `docs/PROJECT_PLAN.md` §12 — milestone-by-milestone status, including what was deliberately
   left out and why.
4. `docs/DECISIONS.md` — 37 ADRs. Read the relevant ones before reversing anything.
5. `docs/MASTER_BUILD_SPEC.md` — the product specification, when you need the detail of a feature.

---

## 2. Standing permissions for tonight

The owner granted these explicitly before going to bed. **Do not widen them.**

|                  |                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Git**          | Commit and push to **feature branches only**. **Never push to `main`. Never merge to `main`.** He reviews in the morning.                                                          |
| **Database**     | You **may** apply migrations to the live Supabase project (`mrqxmkxhyohlywiziofz`) and verify RLS against it. Every migration must also exist as a file in `supabase/migrations/`. |
| **Dependencies** | You may add one only if it passes every check in `CLAUDE.md` §38 and is installed with `npx expo install`. Prefer not to.                                                          |
| **Secrets**      | Never commit `.env`. Never put a key in source. Never write a secret into a doc or a commit message.                                                                               |
| **Scope**        | Build what the milestone specifies. Do not start features outside V1 (`CLAUDE.md` §55).                                                                                            |

**If you are ever unsure whether something is permitted: it is not.** Write it down in §7 for the
owner and work on something else.

---

## 3. Where the work stands right now

|                   |                                                                        |
| ----------------- | ---------------------------------------------------------------------- |
| Current branch    | `feat/m6-timeline` — 7 commits ahead of `main`, pushed                 |
| `main`            | `22d2aa2` — Milestone 5 complete. **Untouched by design.**             |
| Tests             | **357 passing**, 25 suites                                             |
| `npx expo-doctor` | **21/21**                                                              |
| iOS bundle        | builds (`npx expo export --platform ios`)                              |
| Live database     | 11 tables, RLS enabled and verified on all 11, security advisors clean |

**Milestones 0–6 are built.** Onboarding, auth, all five log types writing offline with a durable
outbox and bidirectional sync, and the timeline with pagination, filters, search, edit and delete.

### The single most important caveat

**Nothing has ever run on a physical device.** Not once, in any milestone. Every acceptance
criterion involving a phone is unverified.

This is not theoretical. In Milestone 6 a real defect was found — `log/meal` was never registered
in the root navigator, so it opened as a full-screen push instead of a sheet — and **typecheck,
lint, 292 tests and a full iOS bundle all passed while it was broken.** Only running the app
catches that class of bug.

Take from this: automated green does not mean correct. Prefer work whose correctness you can
actually establish (logic, data, tests) over UI polish you cannot verify.

---

## 4. What to work on

### Now: Milestone 8 — the deterministic pattern engine

This is the product's core intellectual property and the right thing to build unattended: it is
pure computation, heavily testable, and needs nothing from the owner.

**Milestone 7 (AI-assisted logging) is blocked** — it needs an AI provider account the owner has
not created. Skip it. M8 does not depend on it.

Required reading before you start: `CLAUDE.md` §§18–21 and §42, and
`docs/MASTER_BUILD_SPEC.md` §§53–62.

The rules that matter most, in short:

- **Deterministic only.** Structured logs → deterministic analytics → structured finding →
  _optionally_ an LLM explanation. An LLM may never produce a finding. Never.
- **Associations, never causes.** No output may say a food caused anything, and nothing may
  diagnose a condition. There is already a test scanning all source for causal and diagnostic
  phrasing — keep it passing.
- **Absence of a symptom log is not a good day.** Only an explicit `wellbeing_logs` entry is a
  control observation. Never infer one from missing data.
- **Small samples say "not enough data yet."** Never show a confident finding from a handful of
  observations.
- **Confounding reduces confidence.** If coffee and short sleep co-occur, neither gets full credit.
- **Every finding must be reproducible** — store engine version, date range, factor, outcome,
  metrics, confidence, confounders, generated timestamp.
- **§42 requires fifteen named test fixtures.** Build them. They are the acceptance criterion.

`docs/PATTERN_ENGINE.md` does not exist yet and `CLAUDE.md` §21 requires it. Write it as you go.

### After that, in order

1. **M9** — Insights, pattern detail, trends. Needs M8.
2. **M11** — Experiments. Needs M8.
3. **M15** — Reports and export.
4. **M16** — Privacy and security hardening.

M10 (Ask My Gut) and M7 need an AI provider. M12 needs RevenueCat. M13 needs HealthKit on a
device. All blocked.

---

## 5. How to work

Follow `CLAUDE.md` §50. Concretely, each loop:

1. **Read this file and `git log --oneline -5`** so you know what the last loop did.
2. **Pick up exactly where §4 says**, in the smallest coherent vertical slice.
3. **Test-first for engine logic.** §41 — this is precisely where TDD earns its place.
4. **Verify before claiming anything:**
   ```bash
   npm run verify
   ```
   That is typecheck + lint + tests. Also run `npx expo-doctor` and
   `npx expo export --platform ios` after any dependency or config change.
5. **Commit in small logical commits** with the message style in §46, and the
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.
6. **Push the branch.** Never `main`.
7. **Update this file** — §3, §4, §6 and §7 — so the next loop starts oriented.

### Never do these

- Never claim something works because the code looks right. Run it (`CLAUDE.md` §45).
- Never write a fake or placeholder control that does nothing (§57). A row that cannot work yet
  is visibly and accessibly disabled, with honest copy.
- Never put health content in analytics, logs, error messages or telemetry (§§29–30).
- Never invent a number, a threshold or a statistic to make a screen look finished.
- Never edit a shipped migration. Add a new one.

---

## 6. Loop log

Append one line per loop. Keep it short and factual.

| Loop | What changed                                                                                            | Verification                           |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 0    | Hand-off written. M6 pushed to `feat/m6-timeline`. Bundle id `com.vivaan.gutsignal` and Apple team set. | 357 tests, doctor 21/21, bundle builds |

---

## 7. For the owner, in the morning

Things only he can do. **Add to this list; do not act on it.**

### Waiting on him

1. **Merge `feat/m6-timeline` into `main`** after review — 7 commits, Milestone 6 plus the
   dependency fix and the bundle identifier.
   ```bash
   git checkout main && git merge --ff-only feat/m6-timeline && git push origin main
   ```
2. **Run the first iOS build** — this is the highest-value thing he can do, and it unblocks six
   milestones of unverified acceptance criteria:
   ```bash
   npm install -g eas-cli && eas login && eas init
   eas device:create          # open the link on the iPhone
   eas build --profile development --platform ios
   ```
   In the Apple developer portal, enable **Sign in with Apple** only. Nothing else yet.
   `eas init` will write an Expo `projectId` into `app.config.ts` where there is currently an
   `undefined` placeholder — that is expected.
3. **Enable the Apple provider in the Supabase dashboard** (see `docs/DATABASE.md` §4) — Sign in
   with Apple fails on device until then. Needs the Apple account first.

### Decisions he still owes

- **Red-flag safety (R-05)** — static "see a doctor" message for V1, or a sourced, human-reviewed
  clinical ruleset? Recommendation on file: static for V1.
- **Photo retention default** — plan assumes analyze-then-delete, retention opt-in. Confirm.
- **AI provider** — any constraint on who may process meal photos and journal text? Blocks M7/M10.
- **Expo agent skills** — may they be used for the EAS work in M12/M13? Declined at M0.

### Anything a loop got stuck on

_(Nothing yet.)_
