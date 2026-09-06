# GutSignal — Architecture Decision Records

Lightweight ADRs. One entry per material decision. Format:
**Decision · Context · Alternatives considered · Reason · Consequences · Date**.

Add an entry whenever a decision would surprise a new engineer reading the code. Superseding
an ADR means adding a new one that references it — never silently editing history.

Status values: `Accepted` · `Provisional` (will be revisited at a named milestone) ·
`Superseded by ADR-NNNN` · `Rejected`.

---

## ADR-0001 — React Native + Expo instead of native SwiftUI

**Status:** Accepted · **Date:** 2026-08-24

**Context.** GutSignal launches on iOS, targets Android relatively soon after validation, and
is developed on a Windows machine with no macOS or Xcode access.

**Alternatives considered.** (a) Native SwiftUI — best iOS fidelity, but requires a Mac for
every build and a full second codebase for Android. (b) Flutter — cross-platform, but a
separate ecosystem from the team's TypeScript strengths and from Supabase/RevenueCat's
first-class RN support. (c) React Native without Expo — loses EAS Build, config plugins, and
first-party modules.

**Reason.** Expo is the only option that makes iOS development from Windows practical (EAS
remote builds), keeps one codebase for a near-term Android launch, and has first-party
modules for every native capability we need (camera, audio, SQLite, secure store,
notifications, print).

**Consequences.** Native fidelity requires deliberate effort (ADR-0016). Native debugging
costs a remote build cycle. We accept a dependency on Expo's SDK cadence.

---

## ADR-0002 — Target Expo SDK 57 / React Native 0.86.2; no canaries

**Status:** Accepted · **Date:** 2026-08-24

**Context.** npm on 2026-08-24 shows `expo@57.0.16` as `latest` (and as `next`), with SDK 52–56
tags behind it and 58 available only as a canary.

**Correction (Milestone 1).** This ADR originally recorded `react-native@0.87.0` as the paired
version, taken from npm `latest`. That was wrong: SDK 57 pins **`react-native@0.86.2`** and
**`react@19.2.3`**. The registry's newest is not the SDK's pinned version, and installing it
would break the EAS build. The corrected figures are in `PROJECT_PLAN.md` §1.1.

**Alternatives considered.** Riding canary 58 for future-proofing; staying on 56 for maturity.

**Reason.** 57 is the current stable line with the full first-party module set published at
`57.x`. Canaries are unsupported for production. Staying a version behind buys nothing at
project start.

**Consequences.** Versions are pinned to the SDK 57 line and installed with `npx expo install`
(which resolves SDK-compatible versions) rather than `npm install <pkg>@latest`. An SDK 58
upgrade will be a deliberate, between-milestones task with its own ADR.

---

## ADR-0003 — Supabase instead of a custom backend

**Status:** Accepted · **Date:** 2026-08-24

**Context.** We need Postgres, auth, private file storage, server-side compute for AI calls,
scheduled jobs, and above all **per-row access control on sensitive health data**.

**Alternatives considered.** (a) Custom Node/Express + Postgres — full control, but we would
be writing and securing auth, storage signing, and access control ourselves. (b) Firebase —
strong client SDKs, but a document model is a poor fit for longitudinal analytical queries and
its security rules are weaker than Postgres RLS for this shape of data. (c) Serverless
functions + a managed Postgres — most of Supabase, assembled by hand.

**Reason.** Postgres RLS lets the database itself enforce "a user can only ever touch their own
rows", which is exactly the guarantee a health product needs and the one most likely to be
broken by application-layer mistakes. Supabase provides the rest of the surface without a
bespoke server.

**Consequences.** We are bound to Supabase's Edge Function (Deno) runtime for server code, and
must keep the shared pattern engine runtime-neutral (ADR-0007). RLS tests become release
blockers rather than nice-to-haves.

---

## ADR-0004 — EAS Build/Submit is the only iOS build path

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The development machine runs Windows 11. No local Xcode, no iOS simulator.

**Alternatives considered.** (a) Buying/renting a Mac or a cloud Mac — cost and workflow
overhead. (b) Local Android-only development with iOS deferred — contradicts the iOS-first
product goal.

**Reason.** EAS compiles on hosted macOS, manages signing without Xcode, and submits to App
Store Connect. Combined with development builds on a physical iPhone, it removes the Mac from
the routine loop entirely.

**Consequences.** No iOS simulator: **physical-device QA starts at Milestone 1, not release
week.** Native-config iteration is measured in build minutes, so config-plugin changes get
batched. Build failures are diagnosed from EAS logs (see `WINDOWS_IOS_WORKFLOW.md`).

---

## ADR-0005 — RevenueCat as the entitlement authority

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Subscriptions ($9.99/mo, $59.99/yr target) with a required restore path, future
Google Play billing, and a hard rule that premium must never be a client boolean.

**Alternatives considered.** (a) Raw StoreKit 2 via a native module — full control, but we would
own receipt validation, cross-platform entitlement, and restore logic. (b) A custom
subscription server — explicitly rejected in `CLAUDE.md` §52.

**Reason.** RevenueCat solves receipt validation, entitlement state, restore, trials, billing
grace, and the eventual Play Store path, with `react-native-purchases` (10.7.2) as a maintained
RN SDK.

**Consequences.** RevenueCat becomes a hard dependency in the purchase path and must degrade
gracefully when it is unreachable. Its app user ID is bound to the Supabase user ID
(ADR-0013). Sandbox purchase testing requires a development/TestFlight build (ADR-0004).

---

## ADR-0006 — Deterministic statistics; the LLM only explains

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The product's promise is finding real associations in a user's own logs, in a
health context, under an explicit non-diagnostic safety boundary.

**Alternatives considered.** (a) Feed the diary to an LLM and ask for triggers — fast to build,
demos well. (b) Hybrid: LLM proposes candidates, statistics confirm.

**Reason.** (a) is disqualified on three independent grounds: results are unreproducible, the
model will confidently invent associations, and it cannot honestly represent sample size,
confounding, or missing data. Even (b) leaks model bias into which hypotheses are ever tested.
Findings must be reproducible artifacts with stored inputs and versioned methodology.

**Consequences.** The engine is pure TypeScript with injected time, extensive fixtures, and a
stamped `engine_version`. The LLM receives a finding object, never the diary. Some
"impressive" outputs a chatbot could fake are simply not available to us — by design.

---

## ADR-0007 — One pattern-engine implementation, run in two runtimes

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Findings are needed on-device (fast, offline, local data) and on a schedule
(nightly refresh, weekly reviews) inside an Edge Function.

**Alternatives considered.** (a) Device-only — no scheduled refresh, no push-worthy weekly
review. (b) Server-only — insights unavailable offline and slower to feel responsive.
(c) Two implementations (TS + SQL) — guarantees divergence.

**Reason.** A single runtime-neutral TypeScript module can execute in Hermes and in Deno. Two
implementations of a statistical engine will drift, and the drift will be invisible.

**Consequences.** The engine may not use React, Node built-ins, or platform APIs; data access
is injected as plain arrays. The fixture suite runs in **both** runtimes in CI.

---

## ADR-0008 — expo-sqlite + an outbox for offline-first logging

**Status:** Accepted · **Date:** 2026-08-24

**Context.** A diary that loses an entry because of a dropped connection is a broken product.

**Alternatives considered.** (a) MMKV/AsyncStorage queue — fine for a queue, wrong for
queryable longitudinal data. (b) WatermelonDB — a full sync framework, more machinery than a
single-user dataset needs. (c) `@op-engineering/op-sqlite` (18.1.4) — faster, but our write
volume is a handful of rows per day. (d) Supabase-only with optimistic UI — fails offline.

**Reason.** `expo-sqlite` (57.0.1) is first-party, queryable, and durable. A transactional
write of "record + outbox row" plus an idempotent upsert keyed on a device-generated UUID
gives durability without a sync framework.

**Consequences.** We own the sync engine (retry, backoff, tombstones, conflict policy).
Conflict resolution is record-level last-writer-wins on `updated_at`, which is adequate for
single-owner data and would not be for collaborative data.

---

## ADR-0009 — No ORM for the local database (initially)

**Status:** Provisional — revisit at Milestone 6 · **Date:** 2026-08-24

**Context.** The local mirror is roughly ten tables with simple access patterns.

**Alternatives considered.** `drizzle-orm` (0.45.2) over expo-sqlite — nice typing and a
migration story, but a second schema definition to keep in sync with the Postgres migrations,
and another abstraction between us and a bug.

**Reason.** Hand-written typed repositories in `src/services/db/` are transparent, trivially
testable, and small at this scale.

**Consequences.** Local migrations are hand-written and versioned. If repository code becomes
repetitive by Milestone 6, revisit — this ADR is explicitly provisional.

---

## ADR-0010 — TanStack Query for server state; Zustand only for ephemeral UI state

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Two different problems — cached remote data with invalidation, and transient UI
state like an open sheet or an unsaved draft — are routinely conflated into one global store.

**Alternatives considered.** Redux Toolkit (rejected per `CLAUDE.md` §10); a single Zustand
store for everything; Context-only.

**Reason.** TanStack Query (5.102.2) owns caching, retries, invalidation and pagination.
Zustand (5.0.15) is a small, unopinionated store for genuinely local state. Mirroring the
database into Zustand would recreate every cache-invalidation bug by hand.

**Consequences.** A rule with teeth: **nothing that exists in SQLite or Postgres may be
duplicated into Zustand.** For the timeline, SQLite is the read source and Query manages
server hydration.

---

## ADR-0011 — Zod validation at every boundary

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Untrusted inputs: LLM JSON, Edge Function requests/responses, third-party APIs,
deep links, forms, RevenueCat metadata.

**Alternatives considered.** TypeScript types alone (erased at runtime); ad-hoc manual checks;
Valibot/ArkType.

**Reason.** Zod (4.4.3) gives one schema that both validates at runtime and produces the static
type. LLM output in particular must never be trusted structurally.

**Consequences.** Schemas live next to their boundary and are treated as API contracts. A
malformed AI response fails cleanly and never partially writes.

---

## ADR-0012 — Charts built on react-native-svg first; Skia/Victory deferred

**Status:** Provisional — revisit at Milestone 9 · **Date:** 2026-08-24

**Context.** Five chart forms are needed: symptom trend, Bristol distribution, exposed vs
comparison, weekly score, tracking completeness. They must be accessible, screen-reader
describable, and legible when printed in grayscale.

**Alternatives considered.** `victory-native` 41.26.0 (Skia-based, maintained) and
`@shopify/react-native-skia` 2.11.1 directly — both healthy libraries, both add a native
dependency and a rendering model we would then have to make accessible and printable.

**Reason.** Our charts are simple and opinionated. Composing them from `react-native-svg`
(15.15.5) primitives keeps full control of accessibility labels, grayscale rendering, and the
"one emphasized element, one reference line" style extracted from the reference image.

**Consequences.** We write a small chart layer ourselves. If a future chart genuinely needs
high-performance canvas rendering, adopt Victory/Skia then — with a new ADR.

---

## ADR-0013 — Sign in with Apple primary, email OTP secondary, no passwords

**Status:** Accepted · **Date:** 2026-08-24

**Context.** iOS-first health app; low-friction, high-trust sign-in; RevenueCat needs a stable
user identity.

**Alternatives considered.** Email + password (credential handling, reset flows, breach risk);
Google-first (wrong platform priority for launch; also an App Store requirement consideration
when third-party sign-in is offered on iOS).

**Reason.** Apple sign-in is native, private, and expected on iOS. Email OTP covers everyone
else without us ever storing a password.

**Consequences.** The auth layer is provider-shaped so Google can be added for Android.
RevenueCat's app user ID is set to the Supabase user ID at login and reset at logout, so
entitlements follow the account rather than the device.

---

## ADR-0014 — Timestamps stored as instant + local date + zone

**Status:** Accepted · **Date:** 2026-08-24

**Context.** "Today", day grouping, and every analysis window depend on the user's local day.
Users travel; DST happens; meals happen near midnight.

**Alternatives considered.** (a) UTC `timestamptz` only — ambiguous local day; grouping by UTC
date silently misassigns late-evening entries. (b) Naive local time only — loses ordering
across zones. (c) Derive the local date on read from a stored zone — correct but pushes a
subtle computation into every query and every client.

**Reason.** Store all three: `occurred_at timestamptz` (the instant), `occurred_local_date date`
(the user's calendar day at logging time), and `occurred_tz` + `occurred_utc_offset_minutes`.
Grouping and windows use the stored local date.

**Consequences.** A small amount of denormalization, deliberately accepted for correctness.
Retroactive timestamp edits must recompute the local date. DST/travel/midnight fixtures are
written in Milestone 5, before any analysis depends on them.

---

## ADR-0015 — AI runs server-side only, behind a provider interface

**Status:** Accepted · **Date:** 2026-08-24

**Context.** AI features (photo/text/voice/journal parsing, explanations, Ask My Gut) require
provider credentials, rate limiting, and output safety checks.

**Alternatives considered.** Direct client→provider calls (would ship a secret in the binary,
with no quota or safety enforcement); coupling directly to one vendor's SDK.

**Reason.** Edge Functions keep keys server-side and give one place to enforce validation,
quotas, safety filtering and cost telemetry. `GutSignalAIProvider` keeps vendor choice
reversible.

**Consequences.** Every AI feature needs connectivity (no offline AI parsing — manual entry
always remains available). Provider/model selection is made at Milestone 7 after a real
benchmark, not assumed now.

---

## ADR-0016 — Explicit wellbeing logs as the control arm

**Status:** Accepted · **Date:** 2026-08-24

**Context.** In diary studies, a missing entry is ambiguous — it may mean "no symptoms" or
"didn't log". Treating blanks as symptom-free manufactures signal.

**Alternatives considered.** Treating non-symptom days as controls (statistically wrong);
prompting for a daily mandatory check-in (high friction, poor retention).

**Reason.** A one-tap "I'm feeling good" creates a genuine comparison observation. The engine
uses a three-state model: `no_data | explicit_good_state | symptom_logged`.

**Consequences.** "Feeling good" is a first-class logging action in the UI, not a nicety.
Tracking completeness becomes a visible metric and a modifier on confidence.

---

## ADR-0017 — Raw item text is never overwritten by normalization

**Status:** Accepted · **Date:** 2026-08-24

**Context.** "latte", "espresso", "flat white" must all map to `coffee`/`caffeine` for analysis,
but the user's own words matter for trust and for correcting mistakes.

**Alternatives considered.** Normalize on write (destroys the original and bakes in the alias
map version); normalize only at query time (repeated cost, no correction path).

**Reason.** `meal_items` stores both `raw_name` and `canonical_factor_id`, with a versioned
`factor_aliases` map. Re-normalization can be re-run; the user can correct a mapping.

**Consequences.** Alias-map changes can change historical findings — which is why findings
store `engine_version` and their inputs (ADR-0006).

---

## ADR-0018 — Private storage bucket; photos not retained by default

**Status:** Provisional — owner confirmation pending · **Date:** 2026-08-24

**Context.** Meal photos are sensitive health-adjacent media whose primary purpose is one-time
extraction of meal components.

**Alternatives considered.** Retain all photos indefinitely for a richer timeline (larger
sensitive-data footprint, more to leak, more to explain in the privacy policy).

**Reason.** Data minimization: analyze → extract → confirm → delete the original after a short
controlled window, keeping the structured log. Retention becomes an explicit opt-in
("Keep meal photos in my timeline"). Paths are `meal-photos/{userId}/{uuid}.webp` in a
**private** bucket with short-lived signed URLs; EXIF is stripped and images are compressed
before upload.

**Consequences.** Timeline photo thumbnails only exist for users who opt in. Awaiting owner
confirmation (`PROJECT_PLAN.md` §14.5).

---

## ADR-0019 — Analytics may never carry health content

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Product analytics are needed for the activation/conversion funnel; the data being
measured is health data.

**Alternatives considered.** Rich event properties for better analysis (unacceptable privacy
and App Store risk); no analytics at all (flying blind on activation and churn).

**Reason.** Event **names and counts** answer the funnel questions. Symptom types, severities,
Bristol types, food names, journal text, AI questions and HealthKit values answer none of them.

**Consequences.** A single `track()` wrapper accepts only an allowlisted event name and a
constrained, non-free-form property set — enforced by types **and** unit tests, so a careless
call site cannot leak content. Session replay is disabled by default and never enabled on
health-sensitive views. Sentry gets a `beforeSend` scrubber. Health-based ad targeting is
categorically excluded.

---

## ADR-0020 — The red-flag safety system is deferred pending vetted sources

**Status:** Provisional — owner decision required · **Date:** 2026-08-24

**Context.** The spec requires a deterministic red-flag mechanism for user-entered symptom
information, and explicitly forbids inventing the criteria from model memory.

**Alternatives considered.** (a) Ship LLM-based symptom triage — unsafe, unreviewable, and
outside the product's stated scope. (b) Ship criteria recalled from memory — precisely what the
spec forbids, and potentially harmful. (c) Ship a static, non-triaging safety surface for V1.

**Reason.** Any rule that tells a user their symptom pattern may be urgent must be traceable to
a citable clinical source and reviewed by a qualified human. Neither exists yet.

**Consequences.** V1 ships a clear, general "GutSignal can't assess urgency — contact a
healthcare professional" surface plus non-diagnostic language everywhere, and **no automated
triage**. `src/domain/safety/` is built as versioned, reviewable rule scaffolding with no
shipped ruleset. Escalating this to a real red-flag feature is a separate, reviewed project.

---

## ADR-0021 — Barcode scanning deferred to V1.1

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The spec marks barcode scanning as optional for V1.

**Reason.** It adds a camera mode, a third-party data source (Open Food Facts) with variable
quality, and a set of failure states (unknown barcode, incomplete ingredients, stale data, API
down) — none of which advance the core loop of log → compare → detect → explain.

**Consequences.** Packaged foods are logged by text/voice/repeat in V1. Revisit after beta if
users ask for it.

---

## ADR-0022 — Testing stack: jest-expo, RNTL, pgTAP, Maestro

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Required coverage: pure domain logic, services/DB, components, RLS, and end-to-end
flows — from a Windows host with no iOS simulator.

**Alternatives considered.** Detox for E2E (heavier setup; simulator-oriented — impractical
here); application-level RLS assertions instead of database tests (tests the wrong layer).

**Reason.** `jest-expo` (57.0.4) + `@testing-library/react-native` (14.0.1) cover unit and
component tests on Windows. RLS is tested **in the database** with pgTAP, where the guarantee
actually lives. Maestro drives E2E on a physical device.

**Consequences.** The pgTAP suite (User A vs User B: select/insert/update/delete) is a release
blocker per `CLAUDE.md` §58. Pattern-engine fixtures run in CI on every PR in both runtimes.

---

## ADR-0023 — Ecosystem versions are verified against the registry, never recalled

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The spec forbids inventing current APIs or versions. The Expo agent skill was not
available in the Milestone 0 session.

**Reason.** Version claims in `PROJECT_PLAN.md` §1 were read from the live npm registry on
2026-08-24. Installation uses `npx expo install`, which resolves SDK-compatible versions rather
than the newest published ones.

**Consequences.** Version tables carry their verification date and must be re-checked at
implementation time. Where a _workflow_ (not a version) is uncertain — EAS command specifics,
HealthKit plugin configuration — it is checked against current documentation or the Expo skill
before code is written, and flagged in the plan until then.

---

## ADR-0024 — Routes live in `app/` at the repository root, not `src/app/`

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The SDK 57 `create-expo-app` default template places routes in `src/app/`. The
GutSignal specification (§19, §109) specifies `app/` at the root with `src/` alongside it.

**Alternatives considered.** Following the template so a future `create-expo-app` scaffold
diffs cleanly against ours.

**Reason.** Expo Router supports both locations. The spec's layout keeps a hard visual
boundary between _routing_ (`app/`) and _everything else_ (`src/`), which matters more here
than template symmetry: the domain layer and pattern engine must stay obviously separate from
screens. The `@/*` alias still points at `src/*`, matching the template.

**Consequences.** A `create-expo-app` scaffold cannot be diffed directly against this repo.
Anyone copying an Expo example that assumes `src/app/` must adjust the path.

---

## ADR-0025 — Supabase sessions are stored in chunked SecureStore, not AsyncStorage

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Supabase Auth needs a persistent key/value store for the session. Sessions
(access token + refresh token + user object) commonly exceed SecureStore's ~2048-byte
per-value guidance, and losing one logs the user out for no visible reason.

**Alternatives considered.** (a) AsyncStorage / `expo-sqlite/kv-store` — no size limit, but the
refresh token would sit in plaintext app storage, which is the wrong default for a health
product. (b) Storing only the refresh token securely and the rest elsewhere — a split-brain
session with two failure modes instead of one.

**Reason.** Keychain/Keystore-backed storage is the right home for session material (spec §10).
The size limit is solved by chunking with an index record, which is ~60 lines of pure string
handling and fully unit-testable.

**Consequences.** A custom storage adapter to maintain. It is covered by tests for the cases
that actually bite: values far over the limit, values that shrink (stale chunks must be
removed), and a partially-wiped record (returns null rather than a truncated session).

---

## ADR-0026 — Platform typography instead of a bundled webfont

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The reference image's character comes from very large, tight, bold headlines
against small muted labels — a size/weight hierarchy, not a distinctive typeface.

**Alternatives considered.** Bundling a geometric sans (Inter, Satoshi, Spline Sans) for a more
"designed" signature.

**Reason.** San Francisco is what makes an iOS app feel native (spec §116), it supports Dynamic
Type correctly without extra work, it adds no bundle weight or font-loading state, and it
sidesteps font licensing. The hierarchy is carried by the type scale in `src/theme/typography.ts`.

**Consequences.** GutSignal will not have a proprietary type signature at launch; brand
identity rests on colour, spacing, shape and illustration. Revisit only if brand work later
demands it — and then budget for the licence, the loading state, and Dynamic Type testing.

---

## ADR-0027 — Web is not a target; the physical device is the verification path

**Status:** Accepted · **Date:** 2026-08-24

**Context.** With no macOS and no iOS simulator, there is no way to _look at_ the UI on the
development machine. Expo's web target was trialled during Milestone 2 as a design-iteration
preview, to avoid spending an EAS build cycle on every visual change.

**Alternatives considered.** (a) Keep `react-native-web` and configure the extra plumbing that
`expo-sqlite` needs on web (WASM asset resolution plus COOP/COEP headers). (b) Keep web as a
genuine product target.

**Reason.** The trial did not survive contact with the app's own architecture: the boot
sequence opens a local SQLite database, which does not open on web without additional
configuration. Even if that were fixed, the milestones ahead add RevenueCat, HealthKit and
Apple authentication — all native-only. A web preview would break permanently within a few
milestones while accumulating configuration that ships to nobody. (b) is out of scope entirely.

**Consequences.** `react-native-web` and `@expo/metro-runtime` were removed. Visual
verification happens on a physical iPhone via a development build, which is why physical-device
QA starts at Milestone 1 rather than release week (ADR-0004). Logic, accessibility semantics
and copy remain verifiable on Windows through unit and React Native Testing Library tests.

**Worth keeping from the trial.** It exposed a real defect: when the database step hung rather
than failing, the app sat on a blank screen indefinitely with nothing to act on. Boot steps are
now bounded by a timeout, and a storage failure reports different copy from a configuration
failure — the fix outlived the tool that found it.

---

## ADR-0028 — Onboarding questions come before account creation

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Milestone 3 shipped a boot gate that sent unauthenticated users straight to
sign-in. Milestone 4 had to place the onboarding questions somewhere relative to that.

**Alternatives considered.** (a) Account first, then onboarding — simplest, because every
answer can be written to the database as it is given. (b) Questions first, account last, which
is the order the specification's own route list uses (§19: `philosophy` then `account`).

**Reason.** Someone who has just been asked what their symptoms are, what they suspect, and how
much effort they want to spend has invested a minute in describing their situation. Asking for
an account at that point is a much smaller step than asking a stranger to sign up before
seeing anything. It also means an abandoned onboarding leaves no account and no half-formed
profile behind.

**Consequences.** Answers live in an in-memory Zustand draft until the final step writes them,
so nothing about a user's symptoms or suspected foods touches disk before they have an account.
The trade is that killing the app mid-onboarding loses the answers; that is a few screens of
re-tapping, and it is the right side of the trade for a health app. The draft store is reset
after a successful save so a second account on the same device never inherits the first
account's answers — there is a test for exactly that.

---

## ADR-0029 — The HealthKit pre-permission screen ships with HealthKit, not before it

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Spec §31 places an Apple Health pre-permission screen inside onboarding, between
account creation and completion. HealthKit itself is Milestone 13.

**Alternatives considered.** (a) Ship the screen now with a disabled "Connect Apple Health"
button. (b) Ship the screen now with a button that silently does nothing.

**Reason.** (b) is the dead button the spec forbids outright. (a) puts a disabled primary
action in the middle of the happy path, which reads as a broken app rather than a considered
one — and the screen's entire purpose is to earn a permission grant it currently cannot
request.

**Consequences.** Onboarding is `goals → symptoms → bowel-pattern → suspected-factors →
tracking-style → philosophy → account → complete`. Milestone 13 inserts the pre-permission
screen before `complete`, where it will be fully functional, and the progress indicator will
gain a step. Recorded here so the deviation from §19's route list is deliberate and traceable
rather than an omission.

---

## ADR-0030 — Milestone 5 lands as a vertical slice, symptoms first

**Status:** Accepted · **Date:** 2026-08-24

**Context.** Milestone 5 is "core offline logging + outbox + sync" across five log types
(meals, symptoms, bowel, wellbeing, context) plus the sync engine, five migrations and the RLS
suite for each. Building it in one pass produces a change set too large to review and delays
the first evidence that the offline architecture works at all.

**Alternatives considered.** (a) All five log types at once. (b) The sync engine alone, tested
headlessly against a scratch table, with logging screens in a second pass. (c) One log type end
to end, then repeat.

**Reason.** (c), per CLAUDE.md §50 step 3. (a) is the unreviewable rewrite. (b) defers the only
thing that proves the design — a real user-owned table, with real RLS, written offline and
reconciled — and risks an engine shaped around a scratch table rather than a real one.

Symptoms were chosen over the simpler one-tap wellbeing log precisely because they are harder:
a real form, a severity scale, and a user-chosen occurrence time, which is what forces the
timezone handling that risk R-02 calls the most likely source of silent corruption here.

**Consequences.** Meals, bowel, wellbeing and context follow as repetitions of a proven path;
each still needs its own migration, RLS entry and fixtures. The log sheet keeps five of its six
rows visibly disabled in the meantime, which is the honest state rather than a dead control.

---

## ADR-0031 — Sync is bidirectional from the first slice, not push-only

**Status:** Accepted · **Date:** 2026-08-24

**Context.** `PROJECT_PLAN.md` §6 specifies the push path in full — SQLite write, durable
outbox, idempotent upsert — and says nothing about a pull. With push only, local storage is the
sole source for the UI, so a reinstall or a second device shows an empty timeline even though
every row is safe in Postgres.

**Alternatives considered.** (a) Push only, add a pull at M6 with the timeline. (b) Push only,
treat restore-on-reinstall as part of M16's privacy and portability work. (c) Push and a
cursor-based pull together.

**Reason.** (c). The merge rule and the write path are the same design decision — "last writer
wins on `updated_at`, except that an unpushed local change outranks the server" is meaningless
without both halves. Designing the read path after the write path had shipped would mean
retrofitting conflict resolution onto data already in users' hands.

**Consequences.** `sync_cursors` holds one watermark per table. The cursor is **inclusive**
(`>=`, not `>`): two rows can share a timestamp, and re-applying a row is free because
`applyServerRows` is idempotent, whereas skipping one would be a silent hole in the user's
history. `symptom_logs.updated_at` is therefore server-maintained on insert as well as update,
so the watermark advances on one trusted clock and a device with a wrong clock cannot write
itself permanently behind every other device's cursor.

---

## ADR-0032 — `expo-network` for connectivity

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The outbox needs to know when connectivity returns; M5's acceptance criterion is
that a log made in airplane mode syncs on reconnect. Nothing in the project detected network
state.

**Alternatives considered.** (a) `expo-network`. (b) No dependency — drain on foreground and on
backoff only. (c) `@react-native-community/netinfo`.

**Reason.** (a), and it passes every §38 check: Expo already solves it, it is first-party and
SDK-pinned (`~57.0.1`), New Architecture ready, and adds no privacy surface. (b) means a user
switching off airplane mode waits for a backoff tick rather than syncing immediately, which
makes the product's core reliability promise feel broken even though it is not. (c) reports
true internet reachability rather than interface state — genuinely better for captive portals —
but is not version-managed by Expo, against §39.

It was added deliberately **before** the first development build exists, when a new native
module costs nothing; afterwards it would cost a full EAS cycle (risk R-03).

**Consequences.** The engine depends on a three-method `NetworkMonitor` interface, not on the
module, so tests inject a fake and a later swap to reachability probing touches one file.
Connectivity is treated as a hint: if the platform will not say, the engine assumes reachable
and lets the request decide, because refusing to try would strand logs.

---

## ADR-0033 — The offline layer is tested against real SQLite via `node:sqlite`

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The guarantees that matter in M5 are transactional: a log and its outbox row commit
together or not at all; a repeat upsert must not duplicate; a rollback must leave no half-state.
`expo-sqlite` is a native module and does not run under Jest on Windows, and the existing
migration test could only assert on pure functions, never on the SQL itself.

**Alternatives considered.** (a) A hand-written in-memory fake implementing the database
interface. (b) `better-sqlite3` as a dev dependency. (c) Node 24's built-in `node:sqlite`.

**Reason.** (c). A fake would have to model transactions, constraints and rollback — the exact
behaviours under test — so it could agree with a bug. `better-sqlite3` needs a native build
toolchain on a Windows host, which contradicts the project's whole development posture.
`node:sqlite` is built into the Node version already required, so it costs no dependency at all.

**Consequences.** The offline modules are written against a narrow `SqlDatabase` interface that
`expo-sqlite`'s handle satisfies structurally; production passes the real handle, tests pass a
`node:sqlite` adapter. The migration runner moved out of `database.ts` into `migrator.ts` so it
carries no native import. `nodeSqlite.testing.ts` sits outside `__tests__/` so Jest does not
collect it as a suite, and is never imported by application code — `node:sqlite` does not exist
in Hermes. The shipped migrations, their constraints and their rollback behaviour are now
executed on every test run.

---

## ADR-0034 — A meal is written and synced as one aggregate, through a Postgres function

**Status:** Accepted · **Date:** 2026-08-24

**Context.** A symptom is one row, so it syncs as a plain table upsert. A meal is three:
`meal_logs`, `meal_items` and `meal_tags`. The outbox is keyed one row per record, so "what is
the record?" had to be answered before meals could sync at all.

**Alternatives considered.** (a) One outbox row per table, pushed in foreign-key order.
(b) Denormalise items and tags into JSONB columns on `meal_logs`. (c) One outbox row for the
whole aggregate, written server-side by a Postgres function in a single transaction.

**Reason.** (c).

(a)'s failure mode is not a harmless partial write. A meal that reaches the server without its
items reads to the pattern engine as an eating occasion with **no exposures** — a data point
that never happened, quietly weakening every comparison drawn from it. A retry would fix it
eventually, but "eventually" includes a window in which a second device and the engine both see
it. It also costs three or more round trips per meal.

(b) removes the problem by removing the structure, and would have to be undone at M8:
`PROJECT_PLAN.md` §4.5 indexes `(user_id, canonical_factor_id)` on `meal_items` precisely so
exposure lookup is an index scan, and spec §78 warns against JSON blobs in this exact place.

**Consequences.** `public.upsert_meals(jsonb)` takes an array of complete meals and writes each
one — parent, items, tags — inside one transaction. It is **`security invoker`**, so RLS applies
exactly as it would to a direct insert: the function is a transaction boundary, not a privilege
escalation, and can do nothing the caller could not already do one statement at a time. Its
`search_path` is pinned empty with every name schema-qualified.

Items and tags are **replaced wholesale rather than diffed**, on both sides. The client always
sends the complete aggregate and ids are device-generated and stable, so a diff would only add a
second place where "what is in this meal?" gets decided.

This is the project's first client-callable RPC. The bar for adding another is the same one it
cleared: a write that must be atomic across tables, which PostgREST cannot express.

**A consequence worth stating separately.** `meal_logs` carries a redundant `unique (id, user_id)`
so the children can reference it with a **composite foreign key** `(meal_id, user_id)`. Without
it, RLS alone would let a client insert items carrying their own `user_id` but pointing at
someone else's meal. That is not a data leak — the victim's policies still hide those rows — but
it would let one account attach junk to another's records. The composite key makes it impossible
rather than merely invisible, and `rls_isolation.sql` asserts it by bypassing the function and
writing the table directly.

---

## ADR-0035 — The sync engine drives entities, not tables it knows about

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The engine shipped with symptom logging hardcoded `symptom_logs`: it imported the
symptom repository directly and took a `SymptomRemote`. Adding meals meant either duplicating it
or generalising it.

**Alternatives considered.** (a) A second engine instance per log type. (b) Add meal-shaped
branches to the existing one. (c) A `SyncEntity` interface the engine drives without knowing what
any of them are.

**Reason.** (c). (a) multiplies the concurrency guard, the reconnection subscription and the
crash recovery — three things that must happen exactly once — by the number of log types. (b)
grows a switch statement in the one module where a mistake loses user data.

**Consequences.** An entity owns one outbox table name, one cursor, and four operations: upsert,
fetch-changed-since, and apply. The engine owns batching, backoff, claim recovery, coalescing and
ordering. Meals and symptoms differ completely in how they reach the server — an RPC versus a
table upsert — and the engine is indifferent to that.

Three log types remain (bowel, wellbeing, context). Each is now a new entity plus its migration,
RLS entry and fixtures, with no change to the engine at all.

---

## ADR-0036 — Single-row log types share one repository

**Status:** Accepted · **Date:** 2026-08-24

**Context.** By the end of Milestone 5 there are four single-row event tables — symptoms, bowel
movements, wellbeing and context. They differ only in which columns they add to a common shape:
a device-generated id, four occurrence columns, a note, a source, a tombstone and timestamps.
Everything that is _easy to get wrong_ is identical between them: the transaction binding a log
to its outbox row, the tombstone, the last-writer-wins merge, the sync-status join, the
local-day filter.

**Alternatives considered.** (a) Copy `symptomRepository` three times. (b) One generic
repository parameterised by a per-type codec. (c) Extend the generic to cover meals as well.

**Reason.** (b). (a) would put four copies of the T9 defence — the transaction that stops a log
existing without its intent to sync — in four files, where a fix to one silently misses three.
(c) was rejected in the other direction: a meal is an aggregate spanning three tables written
through an RPC, and bending one abstraction across both shapes would make each worse than a
clean split (ADR-0034).

**Consequences.** A log type supplies a `LogCodec` — its table name, its extra columns, and how
they map to and from its domain type — and gets create, update, tombstone, day query, recent
query and merge for free. `symptomRepository` was **retrofitted onto it with its public API
unchanged**, so its twenty existing tests ran untouched as the regression net; they passed
without modification, which is the evidence that the generic behaves identically.

The same collapse happened on the sync side: all four types reach the server as a plain table
upsert plus a cursor read, so `logEntities.ts` builds all four `SyncEntity` implementations from
one factory. `symptomRemote.ts` was deleted rather than joined by three siblings.

Two seams are worth naming. The generic derives its column list from the row object's own keys
rather than restating it, so a new column cannot be silently dropped on write; the interpolated
names come from our row types, never user input, and values are always bound. And SQLite has no
boolean, while the row shape is _also_ the wire format sent to Postgres where the column really
is a boolean — so rows carry `true`/`false` and are narrowed to 1/0 on the way into SQLite only.

---

## ADR-0037 — The timeline is one paginated union, paged by keyset

**Status:** Accepted · **Date:** 2026-08-24

**Context.** The timeline is a single chronological diary drawn from five separate tables, and
Milestone 6's acceptance criterion is that it stays smooth on a large dataset.

**Alternatives considered.** (a) Query each table, merge in memory, page the merged list.
(b) Maintain a denormalised index table written alongside every log. (c) One `UNION ALL` over
the five tables that reads only the columns needed to _place_ an entry, then fill in the detail
for the page.

**Reason.** (c).

(a) cannot page correctly without over-fetching: to know the newest forty entries overall you
must fetch forty from each table and discard most, and to reach page fifty you must fetch two
thousand from each. The cost grows with depth, which is exactly what the criterion forbids.

(b) is the fastest to read and the easiest to corrupt. Every write path would have to maintain
it, and a missed update means an entry that exists but is invisible — the failure mode this
product can least afford.

**Consequences.** A page costs one union query plus at most one query per kind present: six
queries for a page of forty, not forty-one. The union's arms are individually limited as well as
the outer query, so a search matching ten thousand meals still sorts only what a page could need.

**Paging is keyset, not `OFFSET`.** `OFFSET 5000` makes SQLite walk and discard five thousand
rows before returning anything; a cursor on `(occurred_at, id)` makes every page cost the same.
A diary is append-mostly, and the deep pages are precisely the ones a long-term user scrolls to.

The `id` tiebreaker is load-bearing rather than cosmetic. Two entries can share a timestamp to
the millisecond — a meal and the symptom logged in the same breath — and without a total order
one would repeat on the next page while another silently vanished. There is a test for exactly
that.

Verified against ten thousand entries: a page twenty-five deep costs about the same as the
first, and a full-text search across all of them returns in a fraction of a second.

---

## ADR-0038 — SDK 57 patch drift is closed by moving react-native and jest-expo together

**Status:** Accepted · **Date:** 2026-09-05

**Context.** `npx expo-doctor` reported 20/21 with thirteen packages behind their SDK 57 patch
versions. `npx expo install --fix` could not complete: it failed with an npm `ERESOLVE` error,
and so did a `node_modules` wipe followed by `npm install`.

The cause is a three-way constraint that only appears once react-native moves:

- SDK 57 has moved its pin from `react-native@0.86.2` to `0.86.3`. This is the SDK's own
  recommendation, read from `https://api.expo.dev/v2/sdks/57.0.0/native-modules`, not a
  newer-than-SDK version of the kind ADR-0023 warns about.
- `react-native@0.86.3` declares `peerOptional @react-native/jest-preset@"0.86.3"` — an exact
  pin. `0.86.2` declared it as a hard peer on `0.86.2`.
- `jest-expo@57.0.4` peers on `@react-native/jest-preset@"^0.86.2"`; only `jest-expo@57.0.5`
  peers on `^0.86.3`. SDK 57 asks for `~57.0.5`.

`@react-native/jest-preset` is not a direct dependency. It is an auto-installed peer, and the
committed lockfile pinned it at `0.86.2`. npm anchors on that entry and refuses to raise it
unless forced to re-resolve, which is why removing `node_modules` changed nothing: the lockfile,
not the installed tree, was holding the old version.

`expo install --fix` fails for a second, independent reason. It installs in batches, upgrading
the production dependencies before the dev dependencies, so it moves react-native to `0.86.3`
while `jest-expo` is still `57.0.4` — a state npm cannot resolve. It leaves package.json
half-written when it aborts.

**Alternatives considered.** (a) Hold react-native at `0.86.2` via `expo.install.exclude`.
(b) Delete `package-lock.json` and let npm re-resolve everything. (c) Move all thirteen packages
in one atomic `npm install`, after clearing the one stale lockfile entry that anchors the tree.

**Reason.** (c).

(a) inverts the situation ADR-0023 describes. The exclusion would hold the project _below_ the
SDK's own pin, which is the divergence that breaks EAS, and it would leave the doctor check
failing permanently rather than fixing it. An exclusion is for holding a package the SDK does not
own; it is not a way to refuse an SDK patch bump.

(b) works, but re-resolves the whole tree: 107 entries changed, 122 added, 89 removed, silently
carrying `@supabase/supabase-js` from 2.112.3 to 2.115.0, `zod` to 4.5.4, `react-hook-form` to
7.87.0 and `@typescript-eslint` to 8.69.0. None of that is related to the SDK drift, and a
lockfile exists precisely to stop unrelated upgrades riding along with an intended one.

**Consequences.** The lockfile change is confined to the Expo and React Native ecosystem: 44
entries changed, 7 added, 6 removed, and nothing outside it. `expo-doctor` is back to 21/21,
`npm run verify` is green at 357 tests, and the iOS bundle still builds at 1988 modules.

No `expo.install.exclude` was added. Nothing was forced; `--force` and `--legacy-peer-deps` were
not used.

**The reproducible procedure**, should this recur on a later patch bump — the failure mode
returns whenever an SDK patch moves react-native, because the jest-preset peer is pinned exactly:

1. Read the SDK's own version map from `https://api.expo.dev/v2/sdks/57.0.0/native-modules`
   and write those ranges into `package.json`. Move `react-native` and `jest-expo` in the same
   edit, never one without the other.
2. Delete the `node_modules/@react-native/jest-preset` entry from `package-lock.json`. This is
   the anchor, and it is the only surgery required.
3. Run a single `npm install`.

Step 2 is the non-obvious part, and it is why the documented `expo install --fix` workflow cannot
close this particular drift on its own.

**Local Hermes bytecode is blocked on this Windows machine, and that is unrelated to the app.**
`react-native@0.86.3` pins `hermes-compiler` to exactly `250829098.0.17`. Windows Smart App
Control is in enforcement mode here and blocks that binary as not-yet-reputable; the `0.86.2`
binary it replaces runs, and both are unsigned, so this is reputation, not signing. There is no
Mark-of-the-Web on the file, so `Unblock-File` does not apply.

The consequence is local and narrow. `npx expo export --platform ios` completes through Metro and
fails only at the bytecode step; `--no-bytecode` exports cleanly, and the Metro dev server never
generates bytecode. EAS Build is unaffected: it compiles on hosted macOS using the `osx-bin`
Hermes binary, and Smart App Control is a Windows feature. Per ADR-0004 that is the only iOS
build path, so no shipping artefact depends on the blocked binary.

Smart App Control is a system security setting and disabling it is irreversible without
reinstalling Windows, so it is left alone. Use `--no-bytecode` for local export checks; the block
is expected to lapse on its own as the binary acquires reputation.

**Update, 2026-09-06:** it lapsed. `npm run export:ios` now completes the Hermes step on this
machine with no flag, so `verify:full` runs locally exactly as it runs in CI. Nothing was changed
to achieve that, which is the point: the block was reputational and waiting was the correct
response.

---

## ADR-0039 — Two moderate advisories are accepted rather than downgrading the SDK

**Status:** Accepted · **Date:** 2026-09-06

**Context.** The Milestone 16 dependency audit reports 14 moderate vulnerabilities, 0 high and 0
critical, resolving to two root advisories:

- `decode-uri-component@0.2.2` (GHSA-vcc3-ghjq-m6fr), reached through
  `expo-router → query-string`. A denial of service on malformed percent-encoded input. This is a
  **runtime** path: `app.config.ts` registers a `gutsignal://` scheme, so Expo Router parses
  incoming URLs, and a crafted deep link could burn CPU. There is no data-exposure component.
- `uuid@7.0.3` (GHSA-w5hq-g745-h8pq), reached through
  `expo-splash-screen → @expo/config-plugins → xcode`. Missing bounds check when a `buf` argument
  is supplied. This is **build time only**, on the machine running prebuild, and `xcode` does not
  pass `buf`. It is not in the shipped bundle.

**Alternatives considered.** (a) `npm audit fix --force`, which offers **downgrades** rather than
upgrades — `expo-router` 57.0.19 → 5.1.11 and `expo-splash-screen` 57.0.8 → 55.0.25, both
semver-major — and would break the SDK 57 install that `npx expo install --check` currently
reports as correct. (b) A `package.json` override pinning newer transitive versions, which is the
version-forcing `CLAUDE.md` §39 tells us not to do when Expo manages compatibility, and which
would leave the lockfile disagreeing with the SDK's own version map. (c) Removing `expo-router`
or `expo-splash-screen`, which is not a serious option.

**Reason.** Neither advisory is fixable within SDK 57's dependency tree; both need Expo to bump
upstream. The cost of every available fix is a broken SDK install, and the benefit is closing two
moderate issues — one build-time and unreachable in the shipped app, one a self-inflicted CPU burn
requiring the user to open a hostile link. That trade does not favour the fix.

**Consequences.** The audit result is documented in `docs/PRIVACY_SECURITY.md` §6 with the
reasoning and the exact paths, so the next person does not have to redo the analysis. It is
re-checked on every Expo SDK upgrade. **A high or critical finding is a release blocker under
`CLAUDE.md` §58 and must not be accepted this way** — this ADR covers moderate findings with a
documented absence of data exposure, and nothing broader.

---

## ADR-0040 — A severity finding is only emitted when both groups have a mean

**Status:** Accepted · **Date:** 2026-09-06

**Context.** `symptom_severity` is labelled "Bloating intensity", but every surface described it
with the occurrence template — "was recorded less often" — and quantified it with
`exposedOutcomeRate`/`controlOutcomeRate`. An intensity is higher or lower, not more or less
frequent, so the sentence stated something the engine never measured.

The cause is that a severity finding's rate metrics _are_ the occurrence metrics:
`outcomeOccurredOn` returns the same boolean for `symptom_severity` as for `symptom_occurrence`,
and only `meanSeverityDifference` distinguishes them. `meanSeverityDifference` was computed and
then read by nothing outside the engine.

The consequence was worse than a wording slip. On the sample diary every one of the six severity
findings had `meanSeverityDifference === null` — no mean on one side, because the symptom never
occurred in that group — so each rendered as a byte-for-byte copy of the occurrence finding
beside it, differing only by the word "intensity". A reader saw two findings where there was one
measurement, which reads as corroboration and overstates the evidence.

**Alternatives considered.** (a) Fix only the sentence. (b) Drop `symptom_severity` from
user-facing findings entirely. (c) Skip the finding when the comparison could not be made, and
describe and quantify the ones that remain as intensities.

**Reason.** (c).

(a) leaves the numbers beside the sentence unchanged, so "intensity was lower" would still sit
above two occurrence percentages. That is the same defect wearing better words.

(b) discards a real signal. When both groups do report the symptom, a difference in how strongly
it was reported is a genuine, distinct observation — and one a user would want.

**Consequences.** The skip lives in `analyse` rather than at the screen, which keeps the §21
breadth correction honest: it corrects for how many questions were asked, and a question that
could not be answered was not one of them. The sample report went from 18 comparisons to 12, and
its three duplicate "intensity" findings disappeared.

`comparisonNumbers()` now derives both figures from the finding's outcome kind, and the card, the
detail screen and the printed report all read from it. The card previously built its own headline
and its own figures, so it carried a second copy of the frequency wording; it now uses
`observationSentence` like everything else. The joining word is part of that function's output,
because "6.5 out of 10 of 18 days" is not English and three surfaces getting that agreement right
independently is three chances to get it wrong.

**What this does not fix.** `status` and `confidence` are still scored from `absoluteDifference`
for every outcome kind, so a large difference in intensity between two groups that report the
symptom equally often is scored `no_clear_pattern`. The finding is described correctly when shown;
the ranking does not yet know what it is ranking. Scoring severity from `meanSeverityDifference`
on its own scale is a methodology change that needs its own ADR and fixture scenarios, and is
recorded in `PATTERN_ENGINE.md` §6 as a known limitation rather than silently left out.

---

## ADR-0041 — The RLS isolation suite is run, not merely written

**Status:** Accepted · **Date:** 2026-09-06

**Context.** `supabase/tests/rls_isolation.sql` had never been executed. The Supabase project was
paused when it was written, and the file said so honestly: "structurally reviewed but unrun.
Expect to fix a typo on its first real run."

It contained two, and neither was a typo a reader would catch:

1. The block opened with `do $` — a single dollar sign — and closed with `$$;`. Dollar quoting
   requires `$$` or `$tag$`, so the file was never valid SQL and **no** part of it had ever run,
   not just the `pattern_findings` section.
2. `anon_tables := anon_tables || 'pattern_findings'` fails at runtime. The untyped literal makes
   Postgres resolve `||` as array-to-array and try to parse the string as an array literal. It
   needs `::text`.

**Reason.** §14 makes a missing or untested RLS policy a release blocker, and a security test that
has never executed provides no assurance whatsoever — it is worse than none, because its presence
in the tree reads as coverage. Both defects are invisible to review and instant on execution,
which is the entire argument for running it.

**Consequences.** With the migration applied, the suite passes **67 assertions** against the live
project, covering every user-owned table plus `pattern_findings` and the anonymous-client checks.
The fixtures roll back, and the project was confirmed to hold zero leftover rows afterwards.
Supabase's own security advisor reports no lints.

The suite is run through the Management API rather than `psql`, which is not installed on the
Windows dev machine (§6). `supabase db query --file --linked` would run the committed file
directly and is the better route once an access token is configured; that is worth doing, because
running a hand-copied version of a security test is a practice that eventually verifies the wrong
thing.

---

## ADR-0042 — Account deletion runs through an Edge Function that takes no user id

**Status:** Accepted · **Date:** 2026-09-06

**Context.** Spec §97 requires in-app account deletion, and `CLAUDE.md` §58 makes its absence a
release blocker. Deleting an `auth.users` row needs the service-role key, which §14 and §58 both
forbid shipping to a device. So the deletion has to happen somewhere the key can live.

**Alternatives considered.** (a) A Postgres function called over RPC. (b) An Edge Function that
accepts the user id to delete. (c) An Edge Function that accepts nothing and deletes the caller.

**Reason.** (c).

(a) cannot work: RLS governs table access, but removing the `auth.users` row is an auth-server
operation, not a table one, and a `security definer` function that could do it would be a
privilege-escalation surface reachable by every authenticated client.

(b) is the ordinary shape and the dangerous one. An endpoint that takes an id is one authorisation
bug away from "delete any account by uuid", which in an app holding health diaries is the worst
defect available. There is therefore **no id parameter at all** — not optional, not admin-only —
because a parameter that must never be used is one that eventually gets used. The id comes from
`getUser(token)`, which validates against the auth server rather than decoding locally, and the
platform's `verify_jwt` stands in front of that as a second, independent check.

**Consequences.** One delete removes everything. Every user-owned table references
`auth.users (id) on delete cascade` and the meal children cascade from `meal_logs`, verified
against the live schema, so there is deliberately no per-table delete list in the function — a
list would need updating for every new table and would fail silently when someone forgot.

Verified against the live project, not by reading: a caller whose request body named a second
account deleted only their own, and the named account and its rows were untouched. Missing token,
expired token and `GET` are refused with 401/401/405, and the caller's token is refused once the
account is gone.

**The client ordering is server → device → session**, and that is the part with a wrong answer.
The server holds the only copy that outlives the device, so it goes first; if that call fails,
nothing local is touched and the person still has an account to retry from. Wiping the device
first would produce the one arrangement with no way back — local data gone, server data intact,
and no session left to reach it with. Past the server call the steps stop gating each other:
leaving someone signed in to an account that no longer exists strands the app with no route out,
so the session ends even when clearing the device failed, and the app says a local copy may remain
rather than claiming a clean sweep it did not achieve. `runAccountDeletion` is pure and its ports
are injected, so every one of those failure paths is tested without a network or a database.

**Reauthentication is a typed word.** §97 asks for it "if needed", and neither sign-in method can
provide it: Sign in with Apple has no password to re-enter, and an emailed code would make an
irreversible action depend on an inbox arriving — failing exactly when someone is travelling, and
proving nothing about intent. Typing `DELETE` cannot happen by mis-tap, which is what
reauthentication is protecting against here.

**Storage is not touched, because no bucket exists.** When meal photos arrive (M7), objects under
`meal-photos/{userId}/` must be removed in this function before the auth user goes. That is
recorded in the function's own docstring, next to the code that will need changing.

---

## ADR-0043 — The pull cursor is a keyset on `(updated_at, id)`

**Status:** Accepted · **Date:** 2026-09-06

**Context.** The sync pull ordered by `updated_at` alone, asked for `updated_at >= cursor`, and
advanced the cursor to the largest `updated_at` in the page, stopping when it could not advance.

`updated_at` is written by a trigger using `now()`, which in Postgres is the **transaction**
timestamp — identical for every row a transaction touches. Ties are therefore not an edge case,
they are what every batched write produces: an `upsert_meals` call, a restore, or any future data
migration doing `UPDATE symptom_logs SET ...`, which stamps the entire table with one value.

Postgres promises nothing about the order of rows sharing a sort key, so a page boundary landing
inside a tie group can return the same rows again. When the tie group is larger than
`PULL_PAGE_SIZE` (200) the pull cannot get past it at all: page two returns 200 rows all bearing
the cursor's timestamp, `newest === cursor`, and the loop stops.

**The consequence is worse than the dropped page.** The cursor is rewritten to the same timestamp
it already held, so every later run repeats the same stop. That entity never syncs again — not
the remaining rows in the tie group, and not anything changed afterwards. Silent, permanent, and
with no error anywhere.

Measured against the live project with 250 rows written in one transaction: the old cursor pulled
**200 of 250** and stopped; the keyset cursor pulled **250 of 250**.

**Alternatives considered.** (a) `OFFSET`. (b) Widen the page until ties fit. (c) Keyset on
`(updated_at, id)`.

**Reason.** (c).

(a) is not stable under concurrent writes — a row updated mid-pagination shifts the window and
rows fall through the gap — and it degrades with depth, which is the same objection ADR-0037 made
for the timeline.

(b) is not a fix but a larger number to be exceeded later. A migration touching every row produces
a tie group the size of the table, which no page size covers.

`id` is a device-generated UUID, unique per row, so `(updated_at, id)` is a total order and every
page strictly advances. This is the same conclusion ADR-0037 reached for the timeline's keyset —
learned there, and not carried across to sync, which is the more interesting half of this entry.

**Consequences.** `fetchChangedSince` takes a `SyncCursor` rather than a string and must order by
`(updated_at, id)` with a strict pair comparison; the contract says so in the interface, where an
implementer will actually read it. PostgREST has no row-value comparison, so `keysetFilter` writes
the pair out longhand and quotes the timestamp, whose `:` and `+` the filter grammar would
otherwise treat as syntax. The grammar was verified against the live API rather than assumed.

The engine now advances to the **last row of the page** in cursor order rather than the maximum
timestamp, and terminates on a short page. Taking the maximum was the defect itself.

**Stored cursors upgrade in place.** Existing devices hold a bare timestamp; `parseCursor` reads
one as `{ updatedAt, id: '' }`, and an empty id makes the first keyset query inclusive of that
timestamp — so it re-fetches the whole tie group, which is exactly the set of rows the old cursor
may have skipped. Re-applying is free because `applyServerRows` is idempotent and still refuses
to overwrite unpushed local edits. There is no migration and no reset.

**Indexes moved with it** (`20260906150000_sync_keyset_indexes.sql`). `(user_id, updated_at)`
could serve the range scan but not the order, leaving Postgres to sort each tie group by `id`
before applying the LIMIT — cheap for fifty meals, ruinous for the whole-table tie group this
exists to survive. The two-column indexes are dropped rather than kept, being a leading prefix of
the new ones and earning nothing for their write cost.

**Tests.** Six scenarios in `syncEngine.test.ts`: a tie group one larger than a page, one far
larger, one straddling a boundary, ties returned in a different order on every call (as Postgres
is free to do), a row updated mid-pagination, and a tombstone sharing a timestamp with a live row.
All six were confirmed to fail against the previous implementation before the fix was kept.
