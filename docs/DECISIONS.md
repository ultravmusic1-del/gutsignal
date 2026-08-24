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
