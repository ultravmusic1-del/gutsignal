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
