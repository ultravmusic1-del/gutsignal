# GutSignal — CLAUDE.md

This file contains persistent engineering instructions for Claude Code when working in the GutSignal repository.

Read this file at the beginning of every session before making changes.

Also read the relevant project documentation under `/docs` before modifying architecture, data models, security-sensitive code, subscriptions, AI behavior, health integrations, analytics, or the pattern engine.

## 1. PROJECT

GutSignal is a production consumer gut-health tracking application.

Its primary promise is:

Stop guessing what affects your gut.

Users log:

- meals
- food components
- gastrointestinal symptoms
- bowel movements
- explicit good/low-symptom states
- sleep/context
- stress
- journal entries
- suspected factors

GutSignal then analyzes longitudinal data to identify personal recurring associations.

The core product loop is:

```text
Log
→ Structure
→ Compare
→ Detect patterns
→ Explain
→ Test assumptions
→ Learn over time
```

GutSignal is not primarily a chatbot.

GutSignal is not a diagnostic medical device.

## 2. SOURCE OF TRUTH

Before making substantial product or architecture decisions, consult these sources in this order:

1. `CLAUDE.md`
2. current task/request from the project owner
3. `/docs/MASTER_BUILD_SPEC.md`
4. `/docs/ARCHITECTURE.md`
5. `/docs/DECISIONS.md`
6. relevant domain-specific documents under `/docs`
7. existing implementation and tests
8. installed official skills/resources
9. current official documentation

If there is a conflict:

- current explicit user instruction overrides older product preferences
- security/privacy requirements override convenience
- documented architecture decisions should not be silently changed
- current official framework documentation overrides stale examples

Do not make material architectural changes without documenting them in `/docs/DECISIONS.md`.

## 3. PROVIDED ENGINEERING RESOURCES

The project owner has provided additional engineering resources.

Use them deliberately rather than treating them as code to copy blindly.

Available resources include:

**Expo skills repository**

Use for current guidance around:

- Expo
- Expo Router
- Expo development builds
- EAS Build
- EAS Submit
- native modules
- configuration plugins
- iOS distribution
- TestFlight
- app-store workflows

Prefer this over model memory when Expo APIs or workflows may have changed.

**Supabase Agent Skills**

Use for:

- PostgreSQL
- Supabase Auth
- Row Level Security
- migrations
- Storage
- Edge Functions
- database security
- Supabase client patterns

RLS/security recommendations from current Supabase guidance should be treated as particularly important.

**RevenueCat React Native SDK**

Use as an implementation reference for:

- purchases
- subscriptions
- Offerings
- Entitlements
- restore purchases
- CustomerInfo
- account identity
- subscription lifecycle
- React Native integration

RevenueCat remains the source of truth for premium entitlement.

**Software Mansion React Native skills**

Use for current production-quality React Native practices involving:

- React Native New Architecture
- performance
- gestures
- animations
- Reanimated
- SVG
- native-feeling interactions
- React Native platform behavior

**Awesome React Native extracted tool/resource list**

Use only as a discovery/reference catalogue.

Do not install a dependency merely because it appears in the list.

Every new dependency must pass the dependency checks defined later in this file.

**Awesome iOS reference catalogue**

Use as a secondary reference for:

- iOS UX conventions
- security
- permissions
- accessibility
- App Store concerns
- Apple-platform patterns

GutSignal is not a native Swift project, so do not import native Swift architectural patterns unnecessarily.

## 4. SUPERPOWERS WORKFLOW

The project owner uses the Superpowers skill ecosystem for development workflows.

Use applicable Superpowers skills when available.

In particular, favor skills corresponding to:

- brainstorming
- writing plans
- test-driven development
- systematic debugging
- verification before completion
- code review
- implementation planning
- root-cause analysis

Do not invoke skills mechanically.

Use the appropriate skill when the work genuinely benefits from it.

For significant features:

```text
Understand task
→ inspect relevant code/docs
→ brainstorm where necessary
→ produce implementation plan
→ identify tests
→ implement incrementally
→ run verification
→ inspect diff
→ report result
```

For bugs:

```text
Reproduce
→ gather evidence
→ identify root cause
→ write/adjust regression test
→ implement minimal correct fix
→ verify
```

Do not perform random trial-and-error debugging when a systematic debugging skill/process is available.

## 5. PRIMARY TECHNOLOGY STACK

The stack is intentionally constrained.

Do not replace major components without explicit approval.

Application

- React Native
- Expo
- TypeScript
- Expo Router

Use the current stable Expo-supported React Native version.

TypeScript must use strict mode.

Avoid `any`.

If `any` is unavoidable at a third-party boundary:

- isolate it
- document why
- validate data before it crosses into domain code

## 6. WINDOWS DEVELOPMENT CONSTRAINT

The primary development machine is Windows.

There is no assumption of local macOS or Xcode access.

Therefore:

Local Windows environment handles

- Claude Code
- source code
- Node/npm tooling
- TypeScript
- Metro
- linting
- tests
- Git
- Supabase work
- Android testing where useful

iOS native compilation uses

- EAS Build

iOS distribution/testing uses

- EAS development builds
- physical iPhone
- TestFlight
- EAS Submit

Never design a routine development requirement that depends on local Xcode.

If a task normally assumes Xcode:

1. determine whether Expo/EAS provides the required workflow
2. consult Expo skills/current docs
3. document any unavoidable limitation clearly

Do not tell the project owner to open Xcode as a normal development step.

## 7. CROSS-PLATFORM STRATEGY

Launch target:

iOS

Future target:

Android

The UI should be iOS-first and feel deliberately designed for iPhone.

Business logic must remain platform-agnostic where practical.

Use interfaces/adapters around native systems such as:

```ts
interface HealthDataProvider {}
interface SubscriptionProvider {}
interface NotificationProvider {}
interface SecureStorageProvider {}
```

Expected implementations include:

```text
IOSHealthKitProvider
AndroidHealthConnectProvider (future)

RevenueCatSubscriptionProvider

ExpoNotificationProvider
```

Do not spread `Platform.OS === "ios"` checks throughout domain logic.

## 8. APPLICATION ARCHITECTURE

Use feature/domain-oriented architecture.

Target high-level structure:

```text
app/
src/
  components/
  features/
  domain/
  services/
  hooks/
  state/
  theme/
  types/
  utils/

supabase/
  migrations/
  functions/
  tests/

tests/
docs/
assets/
```

Prefer cohesion by feature.

Avoid:

```text
components/
  Component1.tsx
  Component2.tsx
  Component3.tsx
  ...
```

with hundreds of unrelated files.

Feature-specific components belong near their feature when appropriate.

## 9. ROUTING

Use Expo Router.

Primary destinations:

- Today
- Timeline
- Insights
- You

Logging is a separate global action.

Do not make the Log action semantically behave as a navigation destination.

Use modal/sheet routing where appropriate.

Keep routes typed where supported.

## 10. STATE MANAGEMENT

Use the right state system for the right job.

**TanStack Query**

Use for server state:

- Supabase queries
- mutations
- caching
- pagination
- refetching
- invalidation
- optimistic updates where safe

**Zustand**

Use for lightweight ephemeral client state:

- active modal
- draft logging state
- local filters
- temporary UI preferences

Do not duplicate the entire server database inside Zustand.

Do not introduce Redux unless explicitly justified and approved.

## 11. FORMS AND VALIDATION

Use:

- React Hook Form
- Zod

Validate all external boundaries.

Examples:

- user forms
- Edge Function inputs
- Edge Function outputs
- AI structured responses
- external APIs
- deep-link parameters

Never trust LLM-generated JSON without schema validation.

Never trust third-party API responses without validation at the integration boundary.

## 12. BACKEND

Use Supabase.

Core services:

- PostgreSQL
- Supabase Auth
- Storage
- Edge Functions
- RLS
- migrations

Do not create a separate general-purpose backend server unless there is a demonstrated requirement that Supabase cannot reasonably satisfy.

Server-side secret-dependent work belongs in Edge Functions or another approved trusted backend context.

## 13. DATABASE DISCIPLINE

Database schema changes must use migrations.

Never manually rely on production dashboard edits that are not represented in source control.

Migration files should be:

- deterministic
- reviewable
- reversible when practical
- tested

Use UUID IDs unless a domain-specific reason requires otherwise.

User-event records generally need:

```text
id
user_id
occurred_at
created_at
updated_at
source
timezone information where relevant
```

Avoid storing duplicated derived values unless needed for performance/reproducibility.

## 14. ROW LEVEL SECURITY

RLS is mandatory.

All health-related user data is private by default.

No user-owned table may be considered complete until RLS policies exist and are tested.

Baseline access model:

```sql
auth.uid() = user_id
```

or the appropriate relational equivalent.

For each new user-owned table, create tests proving:

```text
User A cannot read User B
User A cannot update User B
User A cannot delete User B
User A cannot insert records pretending to be User B
```

A missing RLS policy is a release-blocking security defect.

Never use the Supabase service-role key in the application client.

## 15. OFFLINE-FIRST LOGGING

GutSignal is a diary.

Logging must not depend on reliable network connectivity.

Use:

- expo-sqlite
- local outbox/sync architecture

Core user logs should write locally first.

Expected flow:

```text
User logs event
→ local UUID generated
→ event saved to SQLite
→ UI updates immediately
→ event marked pending
→ background sync
→ Supabase idempotent upsert
→ event marked synced
```

Support offline:

- meals
- symptoms
- bowel movements
- wellbeing/good-state logs
- basic context logs

Never silently discard an unsynchronized record.

## 16. TIME AND TIMEZONES

Timezone bugs can corrupt health analysis.

Store canonical timestamps using timezone-aware representations.

Preserve enough local timezone information to reconstruct day boundaries correctly.

"Today" must mean the user's local day.

Test:

- midnight
- daylight-saving transitions
- timezone changes
- travel
- meals near midnight
- imported HealthKit records

Do not group records into days solely using UTC date.

## 17. HEALTH PRODUCT LANGUAGE

This is a non-negotiable product rule.

GutSignal identifies:

associations

not:

causes

Do not generate user-facing claims such as:

Dairy causes your symptoms.

Use:

Symptoms were reported more frequently following dairy-containing entries in your logs.

Do not say:

You have lactose intolerance.

Use:

GutSignal cannot determine whether you have lactose intolerance.

Never diagnose:

- IBS subtype
- Crohn's disease
- ulcerative colitis
- SIBO
- intolerances
- allergies
- other diseases

based on app data.

## 18. DETERMINISTIC PATTERN ENGINE

The pattern engine is core intellectual property.

It must be deterministic and testable.

Never implement:

```text
raw diary
→ LLM
→ "your triggers are..."
```

Correct architecture:

```text
structured logs
→ deterministic analytics
→ structured finding
→ optional LLM explanation
```

The pattern engine should account for:

- exposure counts
- comparison/control observations
- explicit good-state logs
- symptom rates
- symptom severity
- effect size
- uncertainty
- sample size
- tracking completeness
- consistency over time
- confounders
- multiple comparisons

Every finding must be reproducible.

Store:

- engine version
- date range
- factor
- outcome
- metrics
- confidence
- confounders
- generated timestamp

Do not display strong conclusions from tiny samples.

## 19. MISSING DATA

Absence of a symptom log is not proof of no symptoms.

Distinguish at least:

```text
no observation
explicit good/low-symptom observation
symptom observation
```

This distinction must be preserved throughout analytics.

Do not use missing days as control days unless the method explicitly justifies it.

## 20. CONFOUNDING

Patterns often overlap.

Example:

```text
coffee ↔ short sleep
```

If coffee and short sleep frequently co-occur, GutSignal should not confidently attribute symptom changes to one independently.

Confounding should reduce confidence.

User-facing explanations should say so.

Example:

Coffee and shorter sleep frequently occurred together in your logs, which makes their individual relationships harder to distinguish.

## 21. MULTIPLE COMPARISONS

Scanning many factors creates false-positive correlations.

Do not show every mathematical difference as an insight.

The pattern engine needs conservative controls, such as appropriate combinations of:

- minimum sample size
- meaningful effect-size threshold
- repeated-period consistency
- confidence adjustment
- false-discovery control
- exploratory/emerging state

Document statistical decisions in:

`docs/PATTERN_ENGINE.md`

## 22. AI BOUNDARIES

AI is an assistant, not the source of truth.

Approved AI uses include:

- meal-photo parsing
- natural-language meal extraction
- voice transcription/extraction
- journal parsing
- converting deterministic insights into natural language
- natural-language interface to deterministic analytics

AI must not independently:

- diagnose
- invent statistical findings
- prescribe medication
- establish allergies/intolerances
- silently create confirmed health logs

## 23. AI CONFIRMATION RULE

AI-extracted health information requires user confirmation before becoming a confirmed structured record.

Example:

```text
Photo
→ AI thinks meal contains chicken/rice/garlic sauce
→ review screen
→ user confirms/corrects
→ persisted as confirmed
```

Never silently convert uncertain model output into authoritative health-history data.

## 24. AI SERVER-SIDE ONLY

Private AI provider credentials must never exist in the mobile client.

Expected architecture:

```text
App
→ authenticated Edge Function
→ validation
→ provider call
→ structured-output validation
→ safety handling
→ response
```

Use provider abstractions.

Do not tightly couple domain code to one model vendor.

## 25. AI COST DISCIPLINE

AI API cost is a variable business expense.

Use deterministic code when deterministic code can solve the problem.

Do not use LLM calls for:

- simple calculations
- filtering
- counting
- averages
- correlation calculations
- formatting basic labels

Track operational AI usage safely.

Useful dimensions:

- feature
- provider/model
- latency
- token estimate
- estimated cost
- success/failure

Never duplicate sensitive health content unnecessarily in telemetry.

## 26. ASK MY GUT

"Ask My Gut" is a natural-language interface to the user's own data.

It is not an unrestricted medical chatbot.

Preferred architecture:

```text
user question
→ classify intent
→ deterministic analytics function(s)
→ structured answer data
→ safe natural-language explanation
```

Implement reusable analytics functions such as:

```ts
getSymptomTrend();
getFactorSummary();
getBestDays();
getWorstDays();
comparePeriods();
getBowelSummary();
getMealTimingSummary();
getTrackingCompleteness();
getExperimentSummary();
```

Do not send the user's entire database history to an LLM unless a future architecture decision explicitly permits a safe aggregation strategy.

## 27. HEALTHKIT

HealthKit is optional context, not a hard dependency.

The app must remain useful if HealthKit permission is denied.

Use a platform abstraction.

Initially consider importing only data that has a clear product use, such as:

- sleep
- activity/workouts
- steps where useful

Request minimum permissions.

Never request a health-data permission merely because it exists.

Always show a contextual pre-permission explanation before triggering the OS permission sheet.

## 28. PRIVACY

GutSignal contains highly sensitive health-adjacent information.

Apply:

- data minimization
- least privilege
- purpose limitation
- private storage
- user deletion
- user export
- explicit AI-processing disclosure

Never use health information for behavioral advertising.

Never create advertising audiences from:

- symptom logs
- bowel data
- food triggers
- journal text
- HealthKit data
- experiments

## 29. ANALYTICS

Product analytics must not contain health content.

Allowed event:

```ts
track('symptom_log_completed');
```

Forbidden:

```ts
track('symptom_log_completed', {
  symptom: 'diarrhea',
  severity: 8,
});
```

Do not send:

- symptom type
- severity
- Bristol type
- food names
- meal contents
- journal text
- HealthKit values
- Ask My Gut content
- suspected factors

to analytics platforms.

Prefer event counts and funnel-state analytics only.

Session replay should be disabled on health-sensitive views by default.

## 30. ERROR MONITORING

Use Sentry or approved equivalent.

Scrub sensitive information.

Do not attach raw:

- health records
- journals
- AI prompts
- photos
- auth tokens

to crash reports.

Logs should identify the operation and failure, not reveal user health content.

## 31. MEDIA

Meal photos are private.

Store in a private bucket.

Use user-scoped paths.

Example:

```text
meal-photos/{userId}/{uuid}.webp
```

Before upload:

- resize
- compress
- strip unnecessary metadata where possible

Do not retain source images forever unless required by user preference/product design.

Temporary audio should generally be deleted after successful transcription unless an explicit feature requires retention.

## 32. REVENUECAT

RevenueCat is the entitlement authority.

Never gate premium features using a client Boolean such as:

```ts
user.isPremium = true;
```

without validating RevenueCat entitlement.

Initial entitlement:

```text
premium
```

Implement correctly:

- offering fetch
- purchase
- restore
- entitlement refresh
- account identity
- subscription expiration
- errors
- offline behavior

Do not hardcode localized store prices.

Use Store/RevenueCat product pricing.

## 33. PAYWALL PHILOSOPHY

Do not show the primary paywall before users understand GutSignal.

Preferred contextual conversion point:

```text
user logs enough useful information
→ first meaningful/emerging insight becomes possible
→ show teaser
→ offer premium insight access
```

Avoid deceptive paywall patterns.

Restore Purchases must always be available.

## 34. UI DIRECTION

The supplied design reference establishes the visual inspiration.

GutSignal should feel:

- premium
- calm
- modern
- personal
- scientific without looking clinical
- spacious
- visually clear

Visual language:

- warm/light neutral primary backgrounds
- near-black typography
- lavender/purple primary accent
- dark charcoal surfaces where useful
- rounded cards
- pill controls
- subtle shadows
- clean charts
- generous whitespace
- bold typography hierarchy
- tasteful haptics
- restrained motion

Do not copy reference artwork or exact screens.

Do not create generic "AI app" aesthetics.

Avoid excessive:

- gradients
- glows
- neon
- glassmorphism
- sparkles
- decorative AI symbols

## 35. DESIGN TOKENS

Use centralized design tokens.

Never scatter arbitrary colors, spacing and radii through components.

Expected files:

```text
src/theme/
  colors.ts
  typography.ts
  spacing.ts
  radii.ts
  shadows.ts
  motion.ts
  theme.ts
```

Prefer semantic tokens:

```ts
colors.background.primary;
colors.surface.card;
colors.text.primary;
colors.text.secondary;
colors.accent.primary;
colors.status.warning;
```

## 36. ACCESSIBILITY

Accessibility is part of done.

Support:

- VoiceOver
- Dynamic Type
- reduced motion
- adequate contrast
- large touch targets
- meaningful labels
- logical focus order
- accessible charts

Do not use color as the only indication of pattern confidence or symptom state.

## 37. PERFORMANCE

Do not prematurely optimize, but avoid known poor patterns.

Requirements:

- virtualize large timelines
- paginate server queries
- compress media
- avoid unnecessary re-renders
- avoid N+1 database queries
- avoid huge global stores
- avoid loading full user history on every screen
- keep expensive analytics off UI-critical execution paths

Measure before introducing complex optimizations.

## 38. DEPENDENCY POLICY

Do not install packages casually.

Before introducing a non-trivial dependency, check:

1. Does Expo/platform already solve this?
2. Is the library actively maintained?
3. Does it support the current Expo/React Native stack?
4. Does it support React Native New Architecture if required?
5. Is its license acceptable?
6. What native configuration does it require?
7. Does it increase app/privacy/security risk?
8. Is the dependency justified versus implementing a small local abstraction?

Do not install a package solely because it appears in:

- awesome-react-native
- awesome-ios
- a blog post
- an old Stack Overflow answer

Use those resources for discovery, not authority.

## 39. PACKAGE VERSION POLICY

Never guess current versions from memory.

When adding/upgrading packages:

- consult project package.json
- consult Expo compatibility
- consult installed skills/current docs
- use Expo-recommended installation commands where applicable

Avoid forcing versions manually when Expo manages compatibility.

## 40. TESTING EXPECTATION

Every meaningful domain behavior should be testable.

Especially test:

- pattern engine
- sync/outbox
- authentication
- RLS
- AI schema validation
- subscription gating
- timezone handling

A feature is not complete because the screen renders.

## 41. TEST-DRIVEN DEVELOPMENT

Use the Superpowers TDD workflow where it meaningfully improves reliability.

TDD is particularly valuable for:

- pattern-engine calculations
- normalization logic
- timezone behavior
- sync conflict logic
- permission/state machines
- subscription entitlement helpers
- safety rules

For pure presentation work, do not mechanically write useless tests before every style change.

Favor tests that protect behavior.

## 42. PATTERN ENGINE TEST FIXTURES

Maintain synthetic datasets for at least:

- obvious positive association
- no association
- tiny sample
- missing-data-heavy history
- explicit good-state controls
- strong confounding
- cross-week consistency
- one-off anomaly
- contradictory periods
- midnight/timezone boundary
- multiple simultaneous food exposures
- custom factor
- retrospective log edit
- log deletion changing a finding

Pattern changes must run this suite.

## 43. SECURITY TESTING

For new sensitive database features:

- test RLS
- test invalid user ID attempts
- test malformed input
- test authorization at Edge Function boundary

Security should not rely on hidden UI controls.

The server/database must enforce access.

## 44. DEBUGGING

When something breaks:

Do not immediately rewrite large sections.

Use systematic debugging.

Required sequence:

```text
1. Reproduce
2. Capture exact failure
3. Inspect logs/state
4. Identify likely boundary
5. Isolate root cause
6. Add regression coverage where useful
7. Implement smallest correct fix
8. Verify original failure is gone
9. Run relevant broader tests
```

Avoid random dependency changes to "see if it fixes it."

## 45. VERIFICATION BEFORE CLAIMING COMPLETION

Use the relevant Superpowers verification workflow.

Before saying a task is complete:

- inspect Git diff
- run typecheck
- run relevant tests
- run lint where appropriate
- run build checks where appropriate
- confirm no unintended files changed
- confirm no secrets were added
- confirm acceptance criteria

Do not claim success based only on code inspection.

## 46. GIT

Use small, logical commits.

Preferred style:

```text
feat(logging): add offline symptom entry

feat(patterns): calculate exposure outcome rates

fix(sync): prevent duplicate queued meal uploads

test(rls): verify bowel log isolation

docs(architecture): document HealthKit provider boundary
```

Before commit:

```text
git status
git diff
```

Then appropriate verification.

Never commit:

- `.env`
- provider secrets
- service-role keys
- private certificates
- personal provisioning data

## 47. DOCUMENTATION

Documentation is part of the codebase.

Expected key documents:

```text
docs/
  MASTER_BUILD_SPEC.md
  PROJECT_PLAN.md
  ARCHITECTURE.md
  DECISIONS.md
  DATABASE.md
  PATTERN_ENGINE.md
  AI_ARCHITECTURE.md
  PRIVACY_SECURITY.md
  WINDOWS_IOS_WORKFLOW.md
  TEST_PLAN.md
  APP_STORE_RELEASE.md
```

If implementation materially changes architecture, update documentation in the same task.

Do not leave docs knowingly inaccurate.

## 48. DECISION RECORDS

For meaningful changes, add a brief entry to `docs/DECISIONS.md`.

Examples:

- replacing a major library
- changing offline strategy
- changing authentication architecture
- changing pattern methodology
- changing AI provider architecture
- changing HealthKit library
- changing subscription architecture

Include:

```text
Decision
Context
Alternatives considered
Reason
Consequences
Date
```

## 49. ENVIRONMENT VARIABLES

Maintain:

`.env.example`

Only intentionally public client values can use:

```text
EXPO_PUBLIC_*
```

Never expose:

- AI secret keys
- RevenueCat webhook secret
- Supabase service role
- private server credentials

in client environment variables.

## 50. FEATURE IMPLEMENTATION PROCESS

For a substantial feature:

**Step 1 — inspect**

Read:

- relevant docs
- existing feature code
- types
- schema
- tests

**Step 2 — plan**

Write concise implementation plan.

Identify:

- files
- database changes
- tests
- privacy concerns
- error states
- offline implications
- analytics implications
- subscription gating

**Step 3 — implement smallest coherent vertical slice**

Avoid giant unreviewable rewrites.

**Step 4 — verify**

Run appropriate checks.

**Step 5 — review**

Inspect code for:

- duplication
- missing error states
- unsafe assumptions
- architecture violations

**Step 6 — report**

Summarize:

- what changed
- tests run
- remaining risk
- owner actions required

## 51. USER ACTIONS VS CLAUDE ACTIONS

Do not ask the project owner to perform tasks Claude Code can perform itself.

Claude should autonomously handle:

- file creation
- refactors
- tests
- documentation
- dependency inspection
- local tooling checks
- migrations
- Git diff inspection

Ask the owner only for things requiring:

- Apple account interaction
- App Store Connect actions
- physical-device confirmation
- external credentials
- payment/account authorization
- irreversible production actions
- genuine product decisions

When owner action is required, give an exact checklist.

Then continue all work that does not depend on that action.

## 52. DO NOT OVER-ENGINEER

GutSignal is intended to scale, but do not prematurely introduce:

- microservices
- Kubernetes
- custom event buses
- distributed queues
- custom auth servers
- custom subscription servers
- elaborate CQRS
- complicated repository patterns
- unnecessary abstraction layers

Prefer boring, understandable systems.

The current architecture:

```text
Expo app
+
Supabase
+
RevenueCat
+
controlled AI providers
+
EAS
```

is intentionally simple.

Keep it that way until evidence requires more.

## 53. DO NOT UNDER-ENGINEER SAFETY

Conversely, do not simplify away:

- RLS
- privacy
- offline reliability
- deterministic analytics
- tests
- schema validation
- error handling
- account deletion
- restore purchases
- timezones
- data export
- AI safety boundaries

These are core product requirements.

## 54. CURRENT PRODUCT PRIORITY ORDER

When trade-offs arise, prioritize:

1. reliable logging
2. data correctness
3. privacy/security
4. pattern quality
5. ease of logging
6. retention-driving insights
7. subscription conversion
8. visual polish
9. secondary features

A beautiful dashboard built on unreliable health data is a failure.

## 55. V1 SCOPE DISCIPLINE

Do not casually add features outside the approved V1.

Core V1 priorities:

- onboarding
- auth
- manual meal logging
- AI-assisted meal logging
- symptom logging
- bowel logging
- explicit feeling-good logs
- quick journal
- timeline
- offline sync
- pattern engine
- insights
- Ask My Gut
- subscriptions
- reports
- privacy/account controls
- basic HealthKit integration
- notifications

Potential later features should not derail core completion.

Examples:

- social community
- clinician dashboard
- full FODMAP database
- stool photo recognition
- recipe engine
- supplement marketplace
- live coaching
- family accounts

Do not implement these without explicit approval.

## 56. APP STORE QUALITY

Remember continuously that this application must pass real App Store review.

Particular care is required around:

- health claims
- privacy
- HealthKit
- account deletion
- subscriptions
- restore purchases
- permission explanations
- user-data handling
- misleading functionality

Do not wait until final release to consider App Store requirements.

## 57. DEFINITION OF DONE

A feature is done only when applicable items are satisfied:

- implementation complete
- no fake/placeholder actions
- loading state
- empty state
- error state
- offline behavior considered
- accessibility considered
- privacy reviewed
- types valid
- tests pass
- lint passes
- docs updated where needed
- analytics contains no health data
- subscriptions correctly gated where applicable
- physical iPhone verification identified where required

## 58. ABSOLUTE RELEASE BLOCKERS

Never consider GutSignal production-ready with any of the following:

- client-side Supabase service key
- missing RLS
- public health-data storage
- hardcoded premium status
- missing restore purchases
- missing account deletion
- AI-generated health records without confirmation
- LLM-generated "trigger" conclusions
- broken offline logs
- known cross-user data access
- sensitive health values in analytics
- sensitive content in crash telemetry
- significant timezone corruption
- broken HealthKit permission handling
- untested StoreKit/RevenueCat purchase flow
- diagnostic claims that exceed product scope
- committed secrets
- unresolved high-severity security issue

## 59. SESSION START ROUTINE

At the start of a development session:

1. read `CLAUDE.md`
2. read current user request
3. inspect `git status`
4. inspect relevant docs
5. inspect relevant existing code
6. identify applicable installed skills
7. use Superpowers planning/debugging/TDD workflow when useful
8. state concise plan before a substantial change

Do not repeatedly reread the entire repository when the task is small.

## 60. SESSION END ROUTINE

Before reporting completion:

1. run relevant tests
2. run typecheck
3. run lint if code changed
4. inspect `git status`
5. inspect `git diff`
6. ensure secrets were not added
7. update documentation if architecture changed
8. clearly state anything that still requires physical-iPhone or external-account verification

Use verification evidence rather than confidence statements.

## 61. FINAL ENGINEERING PRINCIPLE

GutSignal should become more valuable as the user's history grows.

Protect that longitudinal dataset carefully.

The product succeeds only if users can trust that:

- logging is fast
- logs are not lost
- their information remains private
- AI does not silently invent health history
- insights come from actual recorded evidence
- uncertainty is communicated honestly
- the application works consistently

When choosing between a clever implementation and a simple, reliable, testable one:

choose the simple, reliable, testable implementation.
