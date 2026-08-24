# GutSignal — Project Plan

**Status:** Milestones 0–4 implemented — physical-device verification pending
**Author:** Claude Code (principal engineer role)
**Created:** 2026-08-24
**Last updated:** 2026-08-24

This document is the technical plan of record. It is written before feature implementation
and must be updated whenever architecture materially changes. Decisions are recorded
separately in [DECISIONS.md](DECISIONS.md); the Windows→iOS mechanics are in
[WINDOWS_IOS_WORKFLOW.md](WINDOWS_IOS_WORKFLOW.md).

---

## 0. Milestone 0 audit summary

### 0.1 What existed at the start of Milestone 0

```text
gutsignal/
  .agents/skills/          supabase, supabase-postgres-best-practices (vendored agent skills)
  .claude/skills/          same two skills
  skills-lock.json         pins supabase/agent-skills by content hash
  CLAUDE.md                engineering instructions (written this session)
  docs/                    this plan + ADRs + Windows/iOS workflow
```

There was **no application code, no `package.json`, and no git repository**. Milestone 0
therefore started from a clean slate — nothing to migrate or preserve. The Milestone 1
foundation (Expo app, theme, primitives, boot sequence, Supabase client, local database,
test/lint harness) has since been added; see §12.1 for what is and is not done.

### 0.2 Installed agent resources — actual state

| Resource                   | Installed?                                   | Notes                                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase agent skills      | **Yes** (vendored in `.agents/skills/`)      | `supabase`, `supabase-postgres-best-practices`. Use for RLS, migrations, Edge Functions, Postgres performance.                                                                                                                                                    |
| Supabase MCP server        | Yes (session tools)                          | Connected to project mrqxmkxhyohlywiziofz. Used to apply migrations, run the RLS isolation test and check security advisors.                                                                                                                                                                 |
| Expo skills                | Available but **not yet consulted**          | Loading the Expo skill was declined in this session. All Expo/EAS facts below were instead verified against the npm registry (see §1). **Recommendation: allow the Expo skill before Milestone 1**, since it is the correct authority for EAS workflow specifics. |
| RevenueCat skills / MCP    | Skills listed; **MCP requires OAuth**        | The RevenueCat MCP server is unauthenticated in this session. Owner must authorize it (or supply dashboard config) before Milestone 12.                                                                                                                           |
| Software Mansion RN skills | Listed (`react-native-best-practices`, etc.) | Use during Milestones 2, 6, 17 (animation, gestures, performance).                                                                                                                                                                                                |
| `awesome-ios` catalogue    | Not cloned                                   | Used as a _reference catalogue only_ (see §11). No dependency will be selected from it without passing the dependency checklist in `CLAUDE.md` §38.                                                                                                               |

### 0.3 Verification method for all version claims

Every version in this document was read from the live npm registry on **2026-08-24** via
`npm view <pkg> version`. Nothing here is recalled from model memory. Versions must be
re-verified at implementation time; the authoritative installer is `npx expo install`,
which resolves the SDK-compatible version rather than the newest published one.

---

## 1. Verified ecosystem baseline (2026-08-24)

### 1.1 Core runtime

| Package        | Version                | Notes                                                                                       |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `expo`         | **57.0.16** (`latest`) | SDK 57 is the current stable line. `next` also points at 57.0.16; 58 exists only as canary. |
| `react-native` | **0.86.2**             | The version SDK 57 pins — **not** npm's `latest` (0.87.0). See the warning below.           |
| `react`        | **19.2.3**             | Also SDK-pinned; npm `latest` was 19.2.8.                                                   |
| `expo-router`  | 57.0.16                | File-based routing, typed routes.                                                           |
| `typescript`   | **6.0.3**              | `strict: true` mandatory, plus `noUncheckedIndexedAccess`.                                  |

Expo dist-tags observed: `sdk-52 … sdk-56`, `latest: 57.0.16`, `canary: 58.0.0-canary-…`.
**We target SDK 57 and do not chase canaries.**

> **Correction recorded during Milestone 1.** The versions in this table were originally taken
> from npm `latest`, which turned out to be wrong for the SDK-managed packages: SDK 57 pins
> `react-native@0.86.2`, `react@19.2.3`, `react-native-gesture-handler@~2.32.0` and
> `react-native-svg@15.15.4`, while npm `latest` advertised 0.87.0, 19.2.8, 3.2.1 and 15.15.5
> respectively. Installing npm's newest would have produced a project that builds locally and
> fails on EAS. **The authority is `npx expo install` / the SDK template — not the registry.**
> The table below now reflects what is actually installed. (ADR-0023.)

### 1.2 Proposed dependencies (Milestone 1–2 set)

| Package                                       | Version seen                  | Purpose                                      | Verdict                                                                           |
| --------------------------------------------- | ----------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| `@supabase/supabase-js`                       | 2.112.3                       | Postgres/Auth/Storage/Functions client       | **Adopt**                                                                         |
| `@tanstack/react-query`                       | 5.102.2                       | Server state                                 | **Adopt**                                                                         |
| `@tanstack/react-query-persist-client`        | 5.102.2                       | Cache persistence across launches            | Adopt (M6)                                                                        |
| `zustand`                                     | 5.0.15                        | Ephemeral UI state only                      | **Adopt**                                                                         |
| `zod`                                         | 4.4.3                         | Boundary validation everywhere               | **Adopt**                                                                         |
| `react-hook-form`                             | 7.86.0                        | Forms                                        | **Adopt**                                                                         |
| `expo-sqlite`                                 | 57.0.1                        | Local-first store + outbox                   | **Adopt**                                                                         |
| `expo-secure-store`                           | 57.0.1                        | Session/secret material only                 | **Adopt**                                                                         |
| `expo-apple-authentication`                   | 57.0.1                        | Sign in with Apple                           | **Adopt** (M3)                                                                    |
| `expo-notifications`                          | 57.0.14                       | Local reminders                              | Adopt (M14)                                                                       |
| `expo-camera`                                 | 57.0.4                        | Meal photos                                  | Adopt (M7)                                                                        |
| `expo-image-manipulator`                      | 57.0.13                       | Resize/compress/strip metadata before upload | Adopt (M7)                                                                        |
| `expo-audio`                                  | 57.0.4                        | Voice capture                                | Adopt (M7)                                                                        |
| `expo-haptics`                                | 57.0.1                        | iOS feel                                     | Adopt (M2)                                                                        |
| `expo-print`                                  | 57.0.1                        | PDF reports (HTML→PDF, no extra dep)         | Adopt (M15)                                                                       |
| `react-native-reanimated`                     | **4.5.1** (SDK-pinned)        | Motion (Expo-managed version)                | **Adopt**                                                                         |
| `react-native-gesture-handler`                | **~2.32.0** (SDK-pinned)      | Sheets/gestures                              | **Adopt**                                                                         |
| `react-native-svg`                            | **15.15.4** (SDK-pinned)      | Charts, icons, illustrations                 | **Adopt**                                                                         |
| `react-native-purchases`                      | 10.7.2                        | Subscriptions                                | **Adopt** (M12)                                                                   |
| `react-native-purchases-ui`                   | 10.7.2                        | RevenueCat paywall/Customer Center           | Evaluate at M12 — custom paywall is likely, Customer Center is likely worth using |
| `@kingstinct/react-native-healthkit`          | 14.0.2 (published 2026-08-19) | HealthKit bridge                             | Adopt (M13) — actively maintained, verify Expo config plugin at implementation    |
| `@sentry/react-native`                        | 8.23.0                        | Crash monitoring with scrubbing              | Adopt (M16)                                                                       |
| `posthog-react-native`                        | 4.63.6                        | Privacy-constrained product analytics        | Adopt (M16), session replay **off**                                               |
| `jest-expo` + `@testing-library/react-native` | 57.0.4 / 14.0.1               | Unit + component tests                       | **Adopt** (M1)                                                                    |
| `eslint-config-expo`                          | 57.0.1                        | Lint baseline                                | **Adopt** (M1)                                                                    |
| `supabase` (CLI)                              | 2.115.0                       | Migrations, local stack, Edge Functions      | **Adopt** (M1)                                                                    |
| `eas-cli`                                     | 22.2.0                        | Remote iOS builds/submits                    | **Adopt** (M1)                                                                    |

### 1.3 Deferred / rejected for now

| Candidate                                                          | Verdict             | Reason                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle-orm` (0.45.2)                                             | **Deferred**        | Adds a schema/migration abstraction over SQLite for a local cache that has ~10 tables. Hand-written typed repositories over `expo-sqlite` are simpler to reason about and to test. Revisit if local query code becomes repetitive.           |
| `@op-engineering/op-sqlite` (18.1.4)                               | **Rejected for V1** | Faster, but `expo-sqlite` is first-party, Expo-Go-friendlier, and our write volume is a handful of rows per day per user. Performance is not the bottleneck.                                                                                 |
| `victory-native` (41.26.0) / `@shopify/react-native-skia` (2.11.1) | **Deferred to M9**  | Both are healthy. Our charts (§8 of the spec) are 5 simple forms. Start with `react-native-svg` primitives we control (accessible, printable, grayscale-safe); adopt Skia only if a chart genuinely needs it. Decision recorded as ADR-0012. |
| Barcode scanning / Open Food Facts                                 | **V1.1**            | Explicitly optional in the spec; adds a third-party data-quality surface.                                                                                                                                                                    |
| Redux, any DI framework, microservices                             | **Rejected**        | `CLAUDE.md` §52.                                                                                                                                                                                                                             |

### 1.4 Package facts still to verify before use

- Expo config-plugin support and iOS entitlement wiring for `@kingstinct/react-native-healthkit` v14 (M13).
- Whether `react-native-purchases-ui` v10 supports the paywall behaviour we want without fighting our design system (M12).
- `expo-audio` vs `expo-speech`/server transcription split for the voice flow (M7).

---

## 2. Architecture overview

```text
┌──────────────────────────── iPhone (Expo / React Native) ────────────────────────────┐
│                                                                                      │
│  app/  (Expo Router)          src/features/*          src/components/*               │
│         │                          │                        │                        │
│         ▼                          ▼                        ▼                        │
│  ┌────────────────┐   ┌──────────────────────┐   ┌────────────────────────┐          │
│  │ TanStack Query │   │  Zustand (ephemeral) │   │ theme/ design tokens   │          │
│  │  server state  │   │  drafts, sheets, UI  │   └────────────────────────┘          │
│  └───────┬────────┘   └──────────────────────┘                                       │
│          │                                                                           │
│          ▼                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐               │
│  │ src/services/*  — provider interfaces (platform-agnostic)         │               │
│  │  SupabaseClient · HealthDataProvider · SubscriptionProvider       │               │
│  │  NotificationProvider · SecureStorageProvider · AnalyticsProvider │               │
│  └───────┬───────────────────────────────────────────┬───────────────┘               │
│          │                                           │                               │
│          ▼                                           ▼                               │
│  ┌────────────────────┐                    ┌──────────────────────┐                  │
│  │ expo-sqlite        │  local-first       │ src/domain/*         │  pure TS,        │
│  │ logs + outbox      │  writes            │ pattern-engine,      │  no I/O,         │
│  └────────┬───────────┘                    │ scoring, safety      │  fully tested    │
│           │ sync engine                    └──────────────────────┘                  │
└───────────┼──────────────────────────────────────────────────────────────────────────┘
            │ authenticated HTTPS
            ▼
┌───────────────────────────────── Supabase ──────────────────────────────────────────┐
│  Postgres (RLS on every user table)   Auth (Apple, email OTP)   Storage (private)    │
│  Edge Functions:                                                                     │
│    ai-parse-meal-photo · ai-parse-text · ai-parse-journal · ai-explain-finding       │
│    ask-my-gut · pattern-analysis · account-delete · export · revenuecat-webhook      │
│  Scheduled jobs: nightly pattern refresh, weekly review generation                   │
└───────────┬───────────────────────────────────────────────┬─────────────────────────┘
            │ server-side only, keys never in the app        │
            ▼                                               ▼
     ┌──────────────┐                               ┌────────────────┐
     │ AI provider  │  (behind GutSignalAIProvider) │  RevenueCat    │  entitlement
     └──────────────┘                               └────────────────┘  authority
```

### 2.1 Layer rules

1. `src/domain/**` is **pure TypeScript**: no React, no network, no `Date.now()` hidden in
   logic (clock is injected). This is what makes the pattern engine testable and reproducible.
2. `src/services/**` owns all I/O and all platform APIs, exposed as interfaces so Android
   implementations can be added later without touching features.
3. `src/features/**` composes domain + services + components into screens.
4. `app/**` is routing only — screens are thin and delegate to features.
5. No `Platform.OS` checks in `src/domain/**`. Ever.

### 2.2 What runs where

| Work              | Location                                                                                                              | Why                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Logging writes    | Device (SQLite) then sync                                                                                             | Must work offline                                             |
| Timeline reads    | Device SQLite, hydrated from Postgres                                                                                 | Instant, offline-capable                                      |
| Pattern engine    | **Both** — same TS module, run on device for fast/local results; run in an Edge Function (Deno) for scheduled refresh | One implementation, one set of fixtures, one `engine_version` |
| AI calls          | Edge Function only                                                                                                    | Provider keys must never ship in the client                   |
| Entitlement check | RevenueCat SDK + server verification                                                                                  | Never a client boolean                                        |
| Report PDF        | Device (`expo-print`) from deterministic data                                                                         | Avoids shipping health data to a render service               |

---

## 3. Folder structure

```text
app/                                   # Expo Router — routing only
  _layout.tsx  index.tsx
  (auth)/ (onboarding)/ (tabs)/
  log/  insight/  reviews/  experiments/  ask/  reports/  settings/
  gut-map.tsx  paywall.tsx

src/
  components/       ui/ charts/ logging/ insights/     # shared, presentational
  features/         auth/ onboarding/ meals/ symptoms/ bowel/ wellbeing/
                    journal/ timeline/ insights/ patterns/ experiments/
                    ask-my-gut/ reports/ subscriptions/ notifications/ health/
  domain/           pattern-engine/  safety/  scoring/  time/  factors/
  services/         supabase/ ai/ analytics/ revenuecat/ health/
                    notifications/ storage/ sync/ db/
  hooks/  state/  theme/  types/  utils/

supabase/
  migrations/       # every schema change, in order, reviewable
  functions/        # Edge Functions (Deno)
  tests/            # pgTAP RLS tests — release blocking

tests/
  unit/ integration/ e2e/ fixtures/

docs/  assets/
```

Deviation from the spec's suggested tree: added `src/domain/time/` (timezone/day-boundary
logic is too important to scatter into `utils/`), `src/domain/factors/` (canonical factor
normalization), and `src/services/sync/` + `src/services/db/` (the outbox is a subsystem,
not a util).

---

## 4. Database design

### 4.1 Conventions

- UUID v4 primary keys, generated **on the device** so offline records have stable identity.
- Every user table: `id`, `user_id`, `created_at timestamptz`, `updated_at timestamptz`,
  and for event tables `occurred_at timestamptz`, `occurred_local_date date`,
  `occurred_tz text` (IANA zone, e.g. `Europe/London`), `occurred_utc_offset_minutes int`.
- `source` enum: `manual | ai_confirmed | healthkit | imported`.
  **Unconfirmed AI output is never written to a health table at all** — it lives in
  `ai_extraction_candidates` until the user confirms.
- Soft-delete (`deleted_at`) on user event tables so sync and pattern reproducibility survive
  a delete on one device; hard purge on account deletion.
- `updated_at` maintained by trigger, not by the client.

### 4.2 Why three timestamp columns

Storing only `timestamptz` makes "today" ambiguous after travel or DST; storing only local
time loses ordering. We store the instant (`occurred_at`), the **user's local calendar date at
the moment of logging** (`occurred_local_date`), and the zone. Day grouping and the pattern
engine's day boundaries use `occurred_local_date`. This is the single most likely source of
silent data corruption in this product (see risk R-02).

### 4.3 Tables

| Table                                                     | Purpose                                                                                           | Key constraints                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `profiles`                                                | display name, timezone, tracking_style, onboarding_completed_at                                   | `id` = `auth.uid()`                                            |
| `user_preferences`                                        | selected symptoms, notification prefs, keep_meal_photos, analytics_consent, ai_processing_consent | one row per user                                               |
| `meal_logs`                                               | occurred_*, title, meal_size, source, notes, photo_asset_id                                       |                                                                |
| `meal_items`                                              | meal_id, raw_name, canonical_factor_id, confidence, user_confirmed                                | `user_confirmed` default **false**; raw_name never overwritten |
| `meal_tags`                                               | normalized tag rows (caffeinated, restaurant, late_meal…)                                         | unique (meal_id, tag)                                          |
| `symptom_logs`                                            | symptom_type, severity, occurred_*                                                                | `severity between 1 and 10`                                    |
| `bowel_logs`                                              | bristol_type, urgency, difficulty, incomplete                                                     | `bristol_type between 1 and 7`                                 |
| `wellbeing_logs`                                          | explicit good/low-symptom observation                                                             | **the control group** — never inferred                         |
| `context_logs`                                            | stress, manual sleep, exercise                                                                    | typed `context_type` + `value_numeric`/`value_text`            |
| `journal_entries`                                         | raw text (if retention on), extraction_state, links to created records                            |                                                                |
| `ai_extraction_candidates`                                | unconfirmed AI output awaiting user review                                                        | TTL cleanup job                                                |
| `factor_catalog`                                          | canonical factors + hierarchy (`parent_factor_id`)                                                | global rows + per-user custom rows                             |
| `factor_aliases`                                          | raw string → canonical factor, versioned                                                          |                                                                |
| `pattern_findings`                                        | reproducible finding snapshots                                                                    | see §7.6                                                       |
| `experiments`, `experiment_phases`, `experiment_checkins` | structured self-experiments                                                                       |                                                                |
| `weekly_reviews`, `monthly_reviews`                       | deterministic metric snapshots + optional generated prose                                         |                                                                |
| `ai_usage_events`                                         | feature, provider, model, tokens, latency, est. cost, status                                      | **no health content**                                          |
| `revenuecat_webhook_events`                               | idempotent event log                                                                              | unique on provider event id                                    |

### 4.4 RLS pattern

Every user table, no exceptions:

```sql
alter table public.symptom_logs enable row level security;

create policy "own rows: select" on public.symptom_logs
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "own rows: insert" on public.symptom_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "own rows: update" on public.symptom_logs
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own rows: delete" on public.symptom_logs
  for delete to authenticated using ((select auth.uid()) = user_id);
```

Notes: `(select auth.uid())` is wrapped so Postgres evaluates it once per query rather than
per row; policies are scoped `to authenticated` so the `anon` role is never even considered.
Child tables (`meal_items`, `meal_tags`) carry their own `user_id` and are checked directly —
cheaper and safer than a join back to the parent. Each of these will be validated against the
`supabase-postgres-best-practices` skill before the migration lands.

### 4.5 Indexes (initial)

`(user_id, occurred_at desc)` on every event table (timeline pagination),
`(user_id, occurred_local_date)` (day grouping and engine windows),
`(meal_id)` on `meal_items`, `(user_id, factor_id, generated_at desc)` on `pattern_findings`,
`(user_id, canonical_factor_id)` on `meal_items` (exposure lookup).

### 4.6 Local SQLite mirror

Same table shapes, plus:

```text
sync_state:  record_id, table_name, op(insert|update|delete),
             payload, attempt_count, last_error, status(pending|syncing|synced|failed),
             created_at, updated_at
```

Sync is an **idempotent upsert keyed on the device-generated UUID**, so a retry after an
ambiguous network failure cannot duplicate a log.

---

## 5. Privacy model and threat model outline

### 5.1 Data classification

| Class                     | Examples                                                                                     | Rules                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C3 — Sensitive health** | symptoms, severity, Bristol type, meal contents, journal text, meal photos, HealthKit values | Private bucket / RLS-protected tables. Never in analytics, never in crash reports, never in logs. Leaves the device only to Supabase and (with consent, for specific features) the AI provider. |
| **C2 — Personal**         | email, display name, user id, timezone                                                       | Minimized; not sent to analytics beyond a pseudonymous id.                                                                                                                                      |
| **C1 — Operational**      | event names, latency, error codes, AI token counts                                           | Safe for analytics/telemetry.                                                                                                                                                                   |

### 5.2 Trust boundaries

1. Device ↔ Supabase — authenticated JWT; **RLS is the enforcement point**, not the UI.
2. Device ↔ Edge Function — JWT verified server-side; every input Zod-validated; rate limited.
3. Edge Function ↔ AI provider — the only place provider keys exist; only the minimum
   payload for the task is sent (never "the whole database").
4. Device ↔ RevenueCat — entitlement is read from RevenueCat, never asserted by the client.

### 5.3 Threat outline (STRIDE-lite)

| #   | Threat                                                       | Impact                     | Mitigation                                                                                                                         | Verified by                           |
| --- | ------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| T1  | User A reads User B's health data                            | Catastrophic               | RLS on every table; `anon` role excluded                                                                                           | pgTAP suite (release blocker)         |
| T2  | Meal photo URL leaks                                         | High                       | Private bucket, user-scoped paths, short-lived signed URLs                                                                         | Storage policy test                   |
| T3  | Service-role key ships in the app                            | Catastrophic               | Only publishable key in `EXPO_PUBLIC_*`; secret scan in CI                                                                         | CI secret scan                        |
| T4  | AI provider key extracted from the binary                    | High                       | No provider keys client-side, ever                                                                                                 | Code review + grep gate               |
| T5  | Health content lands in PostHog/Sentry                       | High (privacy + App Store) | Central `track()` wrapper with an allowlist of event names and **no free-form property passthrough**; Sentry `beforeSend` scrubber | Unit tests on the wrapper + M16 audit |
| T6  | Prompt injection via journal/meal text causing unsafe output | Medium                     | Model output is Zod-validated and passed through a deterministic safety filter; the model never writes to health tables directly   | AI schema tests                       |
| T7  | Fabricated finding (LLM invents a pattern)                   | High (product integrity)   | LLM cannot produce findings — only explain a finding object computed deterministically                                             | Pattern engine fixtures               |
| T8  | Timezone corruption silently invalidates analysis            | High                       | Explicit local-date column; DST/travel fixtures                                                                                    | Engine fixture suite                  |
| T9  | Offline log lost                                             | High (trust)               | SQLite-first write + durable outbox + idempotent upsert                                                                            | Airplane-mode test                    |
| T10 | Account deleted but data remains                             | High (legal)               | Server-side cascade delete + Storage purge + local wipe                                                                            | M16 deletion test                     |
| T11 | Premium unlocked by client tampering                         | Medium (revenue)           | Entitlement from RevenueCat; server-side check for AI/Edge features                                                                | M12 tests                             |
| T12 | Red-flag symptom text mishandled                             | High (safety)              | Deterministic, versioned rules from vetted sources; **not shipped until human-reviewed** (see risk R-05)                           | Human review gate                     |

### 5.4 Consent model

Separate, revocable consents: (a) AI processing of meal photos/text/journal, (b) product
analytics, (c) HealthKit read, (d) photo retention. Default for (a)–(d) is **off/minimal**, and
the app is fully usable with all of them off.

---

## 6. Offline strategy

```text
User taps Save
  → UUID generated on device
  → INSERT into SQLite (durable) inside a transaction with an outbox row
  → UI updates from SQLite (optimistic UI is not needed — SQLite *is* the source for the UI)
  → sync engine drains the outbox when connectivity returns
  → Supabase upsert on (id) — idempotent
  → outbox row marked synced; row marked synced for the timeline's sync badge
```

Rules:

- The UI never waits on the network for a log to "succeed".
- Nothing is deleted from the outbox until the server confirms.
- Conflict policy: **last-writer-wins per record on `updated_at`**, with the device's edit
  preserved locally until the server acknowledges. Logs are single-user, single-owner data,
  so multi-device conflicts are rare and record-level resolution is sufficient. Deletions are
  tombstoned, never "missing rows".
- Failed sync attempts back off exponentially and surface as a non-blocking timeline badge,
  never as a modal error.
- Free-tier history limits are a **display** rule, not a deletion rule.

---

## 7. Statistical analysis architecture

### 7.1 Non-negotiable shape

```text
structured logs → deterministic engine → structured finding → (optional) LLM explanation
```

The LLM never sees the diary in order to "find triggers". It receives a finding object
(counts, rates, effect sizes, confounders, confidence) and turns it into careful prose.

### 7.2 Module layout

```text
src/domain/pattern-engine/
  types.ts            Finding, Exposure, Outcome, Window, Confidence — all serializable
  normalization.ts    raw item → canonical factor (versioned alias map)
  exposures.ts        build exposure events per factor per user
  outcomes.ts         symptom events / severity / bowel / daily burden / wellbeing
  windows.ts          observation windows (shortly-after, same-day, next-morning, next-day)
  comparisons.ts      exposed vs comparison rates and severities
  confounders.ts      co-occurrence detection between candidate factors
  multiple-testing.ts family-wise / FDR handling for broad scans
  confidence.ts       sample size + consistency + completeness → status
  scoring.ts          GutSignal Score (deterministic, documented)
  engine.ts           orchestration; stamps engine_version
  fixtures/           the 15 synthetic datasets from spec §111
```

### 7.3 The three-state observation model (the crux)

```text
no_data              → excluded from both arms; increases missing-data ratio
explicit_good_state  → valid comparison observation
symptom_logged       → outcome observation
```

Blank days are **never** treated as symptom-free. This is why the one-tap "I'm feeling good"
control is a statistical feature, not a nicety.

### 7.4 Metrics computed per (factor, outcome, window)

exposure count · comparison count · outcome rate in each arm · absolute difference ·
relative difference · mean/median severity difference · per-week consistency ·
uncertainty interval on the rate difference · missing-data ratio · confounder overlap
(top co-occurring factors with their overlap coefficient).

### 7.5 Confidence and multiple comparisons

Status is assigned by a documented rule combining **minimum sample size**, **minimum effect
size**, **cross-period consistency**, and an **FDR-style adjustment across the factors scanned
in the same run** — not by a single p-value. Statuses are exactly:
`insufficient_data | emerging | moderate | stronger_recurring_signal | no_clear_pattern`.
There is no `confirmed_trigger`. Exact thresholds are provisional, must be tuned against the
fixtures, and will be documented (with their rationale and their limitations) in
`docs/PATTERN_ENGINE.md` during Milestone 8.

Confounding **reduces** confidence and is always surfaced in the explanation text.

### 7.6 Reproducibility

Every finding persists `engine_version`, `factor_id`, `outcome_type`, `analysis_start`,
`analysis_end`, `window_id`, `exposure_count`, `control_count`, effect metrics,
`confidence_score`, `confounders`, `tracking_completeness`, `generated_at`. Re-running
version _v_ over the same date range must reproduce the same numbers — this is enforced by a
test, not by convention.

---

## 8. AI architecture

### 8.1 Provider abstraction

```ts
interface GutSignalAIProvider {
  parseMealPhoto(input: MealPhotoInput): Promise<ParsedMealCandidate>;
  parseMealText(input: MealTextInput): Promise<ParsedMealCandidate>;
  parseJournal(input: JournalInput): Promise<ParsedJournalCandidate>;
  explainFinding(input: FindingExplanationInput): Promise<SafeExplanation>;
  answerPersonalDataQuestion(input: PersonalQuestionInput): Promise<SafePersonalAnswer>;
}
```

Implemented **only** inside Edge Functions. The client calls named functions; it has no
concept of a model or a vendor.

### 8.2 Request pipeline

```text
authenticated request
  → JWT verification
  → Zod input validation
  → quota / rate limit check (per user, per feature, per period)
  → provider call with structured output
  → Zod output validation  (malformed → retry once → fail cleanly, never partially save)
  → deterministic safety filter (no diagnosis, no causal claims, no medication advice)
  → response + ai_usage_events row (operational metrics only)
```

### 8.3 Confirmation rule

AI output is written to `ai_extraction_candidates`, rendered on a review screen with
low-confidence items visibly editable, and only becomes a health record — with
`source = 'ai_confirmed'` — after the user confirms. There is no code path from a model
response to a confirmed health row.

### 8.4 Ask My Gut

Intent classification → deterministic analytics tools (`getSymptomTrend`,
`compareFactorVsBaseline`, `getBestDays`, …) → structured results → explanation → safety
filter. The model receives aggregates, never the raw diary.

### 8.5 Cost control

Server-side quotas configurable without an app release; deterministic code for anything
computable; caching of repeated explanations keyed on `finding.id + engine_version`;
smallest capable model per task, multimodal only for photos; per-cohort cost tracking.
Provider/model selection happens at Milestone 7 after a benchmark of structured-output
reliability, multimodal accuracy on real meal photos, latency, cost and privacy terms —
**not now, from memory.**

---

## 9. Design interpretation (from the supplied reference image)

### 9.1 What the reference actually shows

Three iPhone screens: (1) a dark charcoal onboarding screen with a flat character
illustration, a very large bold two-line headline with a yellow marker underline, a lavender
pill CTA and a dark secondary pill; (2) a light neutral dashboard — small greeting line, very
large bold title, white rounded cards (a map card, a "Daily Steps" card with a lavender bar
chart), and a floating dark pill navigation bar with a lavender active indicator; (3) a
detail screen — back chevron + centered title, a row of pill filter chips, a card containing
a bar chart with one black emphasized bar and a dashed threshold line, a row of small metric
pills, and a schedule card with one lavender-tinted row.

### 9.2 Principles extracted (not artwork)

| Principle                                                 | How GutSignal applies it                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| One accent, used sparingly                                | A single lavender accent marks the active/primary action only. Never seven-colour charts.          |
| Dark cinematic entry, light calm interior                 | Charcoal welcome/onboarding hero; warm off-white app interior.                                     |
| Very large, tight, bold headlines over small muted labels | Typographic hierarchy carries the screen; no decorative chrome.                                    |
| Cards as the unit of content                              | Rounded white cards, soft shadow, generous padding, one idea per card.                             |
| Floating pill navigation                                  | Four destinations in a floating dark container; the Log action is a **separate** floating control. |
| Charts: one emphasized element, one reference line        | Symptom trend and exposure comparison highlight the point being made and drop the gridlines.       |
| Low information density                                   | Today shows ~4 blocks, not 12 metrics.                                                             |

### 9.3 What we deliberately do **not** take

The illustration style and character artwork, the "Set Your Goal, Crush Your Limit!"
motivational fitness voice, the Google-first auth ordering, and any exact layout. GutSignal's
voice is calm and evidence-first, not motivational. Illustrations will be original abstract
gut/food/sleep motifs commissioned or generated for this project.

### 9.4 Proposed token values (contrast-verified today)

Ratios below were computed, not estimated (WCAG relative luminance, 2026-08-24):

| Token                                     | Value                  | Contrast                                              |
| ----------------------------------------- | ---------------------- | ----------------------------------------------------- |
| `surface.primary` (light)                 | `#F5F4F7` warm neutral | —                                                     |
| `surface.card`                            | `#FFFFFF`              | —                                                     |
| `surface.inverse` (charcoal)              | `#17171C`              | —                                                     |
| `text.primary`                            | `#101014`              | **17.3:1** on `surface.primary` ✅                    |
| `text.secondary`                          | `#6B6B76`              | **4.80:1** ✅ AA                                      |
| `text.tertiary`                           | `#8E8E99`              | 2.96:1 — **decorative/large only**, never for meaning |
| `text.onInverse`                          | `#F7F7F9`              | **16.7:1** on charcoal ✅                             |
| `text.onInverse.secondary`                | `#A0A0AD`              | **6.91:1** on charcoal ✅                             |
| `accent.solid` (button fill, white label) | `#6D4AFF`              | **5.15:1** with white ✅ AA                           |
| `accent.text` (accent text on light)      | `#5B41D6`              | **6.62:1** ✅ AA                                      |
| `accent.onInverse` (accent on charcoal)   | `#A78BFA`              | **6.56:1** ✅ AA                                      |

Note the reference's lavender (`#A78BFA`) is only **2.72:1** on white — beautiful as a fill on
dark, unusable as text or as a small control on a light background. This is exactly the kind
of trap that turns "looks like the reference" into an accessibility failure, so the palette
splits the accent into three role-specific tokens instead of one hex value.

Radii: `sm 12 · md 16 · lg 22 · xl 28 · pill 999`. Spacing: 4-based scale (4/8/12/16/20/24/32/40/56).
Type ramp: `display 34/38 bold · title 28/32 bold · section 20/24 semibold · cardTitle 17/22
semibold · body 16/22 · caption 13/18 · metric 40/44 bold · button 17/22 semibold` — all
scaling with Dynamic Type.

**Confidence is never encoded by colour alone** — every status carries a label and an icon/shape.

---

## 10. Release workflow (summary)

```text
Windows PC → Claude Code → source → GitHub → EAS remote macOS build
          → development build on physical iPhone → TestFlight → App Store
```

Profiles: `development` (dev client, internal distribution), `preview` (release-mode internal
build for realistic testing), `production` (store build). Full step-by-step instructions,
including connecting a physical iPhone to the Windows-hosted Metro bundler and reading native
build failures without Xcode, are in [WINDOWS_IOS_WORKFLOW.md](WINDOWS_IOS_WORKFLOW.md).

CI (GitHub Actions) on every PR: install → lint → format check → typecheck → unit tests →
pattern-engine fixtures → migration validation → **secret scan**. RLS pgTAP tests run against
a preview database. Builds are triggered from `main` once the baseline stabilizes.

---

## 11. `awesome-ios` usage

Cloning is unnecessary for Milestone 0. It will be consulted as a _catalogue_ for the
following categories only, and nothing will be adopted from it without passing the dependency
checklist: chart presentation patterns, HealthKit usage conventions, App Store review
pitfalls for health apps, accessibility patterns, and permission-priming UX. It is an
Objective-C/Swift list — its libraries are largely inapplicable to an Expo project, and
importing native Swift architecture patterns here would be a mistake.

---

## 12. Implementation milestones

| #   | Milestone                                                                                                         | Acceptance                                                              | Owner action needed first?                |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| 0   | Technical audit                                                                                                   | These four documents accepted                                           | —                                         |
| 1   | Foundation: Expo+TS+Router, theme, EAS config, env validation, lint/test, error boundary, Supabase client, SQLite | App launches via a real iOS **development build** on the owner's iPhone | Apple Developer account, Supabase project |
| 2   | Design system + navigation shells + floating log action                                                           | Shell feels coherent on a physical iPhone                               | —                                         |
| 3   | Auth (Apple + email OTP), boot restoration, logout                                                                | Repeated login/logout survives restarts                                 | Apple Sign-In capability                  |
| 4   | Onboarding (all screens from spec §24–32)                                                                         | New user completes setup with no dead ends                              | —                                         |
| 5   | Core offline logging + outbox + sync                                                                              | Logs created in airplane mode sync correctly on reconnect               | —                                         |
| 6   | Timeline: pagination, filters, edit/delete, sync badges                                                           | Smooth with a large synthetic dataset                                   | —                                         |
| 7   | AI-assisted logging (photo/text/voice/journal)                                                                    | No confirmed health record is ever created without user confirmation    | AI provider account                       |
| 8   | Deterministic pattern engine + 15 fixtures                                                                        | All fixtures produce the expected classifications                       | —                                         |
| 9   | Insights, pattern detail, Gut Map, trends, weekly review                                                          | Every insight links to its evidence and its calculation                 | —                                         |
| 10  | Ask My Gut (tool-driven)                                                                                          | Answers are backed by deterministic tool results                        | —                                         |
| 11  | Experiments                                                                                                       | Confounders and uncertainty visibly represented                         | —                                         |
| 12  | RevenueCat: paywall, purchase, restore, gates                                                                     | Real iOS **sandbox** purchase succeeds                                  | RevenueCat + App Store Connect products   |
| 13  | HealthKit (sleep/activity, least privilege)                                                                       | Denied permission does not degrade the app                              | HealthKit capability                      |
| 14  | Notifications                                                                                                     | User can control every reminder; quiet hours work                       | —                                         |
| 15  | Reports + PDF/JSON/CSV export                                                                                     | Grayscale-printable, no diagnostic claims                               | —                                         |
| 16  | Privacy/security hardening: RLS, Storage, analytics, AI-data, deletion, export, secret scan, dep audit            | Every release blocker in `CLAUDE.md` §58 cleared                        | —                                         |
| 17  | Performance + accessibility                                                                                       | VoiceOver, Dynamic Type, reduced motion, chart descriptions pass        | —                                         |
| 18  | TestFlight beta                                                                                                   | Real-world crash/friction data captured                                 | TestFlight testers                        |
| 19  | App Store release                                                                                                 | `docs/APP_STORE_RELEASE.md` checklist passes                            | Owner submits                             |

### 12.1 Milestone 1 status (2026-08-24)

**Built and verified on Windows** — `npx expo-doctor` 21/21, `tsc --noEmit` clean, `eslint`
clean, 65 tests passing:

| Area           | Delivered                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| App shell      | Expo SDK 57 + Expo Router (root `app/`), typed routes, React Compiler enabled                             |
| TypeScript     | `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`; zero `any` in `src/`                        |
| Design system  | `src/theme/` — colours, typography, spacing, radius, shadows, motion, `ThemeProvider`, `useReducedMotion` |
| UI primitives  | `Text`, `Button`, `Card`, `Chip`, `Divider`, `Screen` — token-driven, ≥44pt targets, a11y roles/states    |
| Boot           | `useAppBoot` implements steps 1–2 of the spec §20 sequence (env → local DB) and reports honestly          |
| Config         | `app.config.ts`, `eas.json` (development/preview/production), `.env.example`, Zod-validated env           |
| Backend client | Supabase client with a chunked Keychain session store and foreground-bound token refresh                  |
| Local database | `expo-sqlite` with a versioned migration runner and the durable `sync_queue` outbox                       |
| Quality gates  | jest-expo + RNTL, ESLint (expo flat config), Prettier, `npm run verify`                                   |
| Assets         | Original placeholder app icon and splash mark (concentric "signal" rings)                                 |

**Not done — and why:**

- **Device verification of the acceptance criterion.** M1 is "the app launches through a real
  iOS development build". That needs an Apple Developer account, a bundle identifier and a
  registered iPhone, all deferred by the owner. Everything buildable on Windows is done and
  green; the build itself is the outstanding step.
- **`bundleIdentifier` is provisional** (`com.gutsignal.app`) and must be confirmed before the
  first build — it cannot change after a store release.
- **App icon and splash are placeholders**, deliberately marked as such.
- Steps 3–11 of the boot sequence (session restore, RevenueCat, profile, onboarding check,
  cache hydration, sync, analytics) land at their own milestones; `useAppBoot` is the single
  place ordering lives, so they slot in without a provider race.

### 12.2 Milestone 2 status (2026-08-24)

**Built and verified on Windows** — `expo-doctor` 21/21, `tsc --noEmit` clean, `eslint` clean,
97 tests passing, iOS Metro bundle builds (1857 modules):

| Area               | Delivered                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation         | Floating dark pill with the four destinations (JS tabs, not `NativeTabs`, because the pill must hover over content); the log action is a **separate** circular control beside it, never a fifth tab |
| Icons              | Original minimal-stroke SVG set (`src/components/ui/Icon.tsx`) — not SF Symbols, so geometry is identical when Android arrives                                                                      |
| Shells             | Today, Timeline (working filter row), Insights, You — each with designed empty states and real product copy                                                                                         |
| Sheet architecture | Log flow presented as a native `formSheet` with `fitToContents` detent, grabber and drag-to-dismiss; every future logging screen enters through it                                                  |
| Boot gate          | `app/index.tsx` routes once after boot resolves; distinct copy for configuration vs storage failure                                                                                                 |
| Safety             | `src/domain/patterns/status.ts` holds the five permitted pattern statuses and their copy, with a test that scans all shipped source for causal/diagnostic phrasing                                  |

**Deliberately not built:** GutSignal Score, quick-log tiles, timeline entries, findings. All of
them require data or the engine, and rendering them with invented numbers is the fake-data
placeholder the spec forbids. The log sheet's rows are visibly and accessibly disabled with an
honest note rather than silently doing nothing.

**Outstanding:** the acceptance criterion — "the shell feels coherent and polished on a
physical iPhone" — is unverified. Nothing has been seen on a device yet.

### 12.3 Milestone 3 status (2026-08-24)

Supabase project `mrqxmkxhyohlywiziofz` is live and carries the first migration.

| Area         | Delivered                                                                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema       | `public.profiles` with RLS, a sign-up trigger that creates the row, and a server-side `updated_at` trigger. Helpers live in a `private` schema with execute revoked. See [DATABASE.md](DATABASE.md) |
| Security     | Isolation test in `supabase/tests/rls_profiles.sql` — run against the live project, all checks passed, fixtures removed, security advisors clean                                                    |
| Auth service | Apple and email one-time code sign-in, sign-out, session restore. Returns typed results; provider error strings are never shown raw                                                                 |
| Session      | `AuthProvider` subscribes to `onAuthStateChange` and binds token refresh to app foreground state                                                                                                    |
| Screens      | Welcome (dark hero), sign-in, email entry (React Hook Form + Zod), code verification with resend cooldown                                                                                           |
| Routing      | The boot gate waits for session restore, then routes once — unauthenticated to welcome, authenticated to the tabs                                                                                   |
| Sign-out     | Real, confirmed, and reachable from You                                                                                                                                                             |

**Owner action required:** enable the Apple provider in the Supabase dashboard (see
[DATABASE.md](DATABASE.md) §4). Until then Sign in with Apple fails on a real device — handled
gracefully with a message pointing at email sign-in, but not functional.

**Not verified:** no sign-in has been performed on a device. The email flow is verified only as
far as the auth endpoint accepting the project credentials.

### 12.4 Milestone 4 status (2026-08-24)

| Area         | Delivered                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema       | `user_preferences`, `user_symptom_preferences`, `user_suspected_factors` — three tables, not one blob, with privacy flags defaulting to false                                                     |
| Security     | `supabase/tests/rls_isolation.sql` now covers every user-owned table; run against the live project, all checks passed, advisors clean                                                             |
| Vocabularies | `src/domain/onboarding/options.ts` holds the shared keys; a test reads the migration files and asserts the app's keys match the database check constraints exactly                                |
| Draft        | In-memory Zustand store — nothing about symptoms or suspected foods touches disk before the user has an account (ADR-0028)                                                                        |
| Screens      | Goals, symptoms, bowel pattern, suspected factors (with custom entry), tracking style, philosophy with acknowledgement, account, completion                                                       |
| Persistence  | One mutation writes preferences, symptoms and factors, then sets `onboarding_completed_at` **last**, so a partial failure returns the user to onboarding rather than into a half-personalized app |
| Routing      | The boot gate reads the profile and sends users with unfinished onboarding back into it — but an _unreadable_ profile falls through to the app, so a bad connection cannot trap a returning user  |

**Deviation from spec §19:** the Apple Health pre-permission screen is not in this flow. It
ships with HealthKit in Milestone 13, where it can actually request the permission — see
ADR-0029.

**Not verified:** no one has completed onboarding on a device. The flow is verified by unit
tests, the database is verified directly, but the two have never met.

Documents still to be written (at the milestone that needs them): `ARCHITECTURE.md`,
`TEST_PLAN.md`, `AI_ARCHITECTURE.md` (M7), `PATTERN_ENGINE.md` (M8),
`APP_STORE_RELEASE.md` (M12), `PRIVACY_SECURITY.md` (M16). `DATABASE.md` was written
alongside the first migration in M3.

---

## 13. Technical and product risks

| #    | Risk                                                                                                               | Likelihood | Impact                                  | Mitigation                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-01 | **Pattern quality**: real diaries are sparse and confounded; the engine may honestly have nothing to say for weeks | High       | High — this is the product's core value | Design for honest "not enough data yet" states; make tracking completeness a first-class visible metric; tune thresholds on fixtures _and_ real beta data before claiming signals                                                                |
| R-02 | **Timezone corruption** silently misgroups days                                                                    | Medium     | High                                    | Explicit `occurred_local_date` + zone; DST/travel/midnight fixtures written in M5, before analysis exists                                                                                                                                        |
| R-03 | **No Mac**: every native issue costs an EAS build cycle (minutes, and a queue)                                     | High       | Medium                                  | Keep native surface minimal; batch config-plugin changes; use `preview` profile builds; lean on EAS build logs and `expo-doctor`                                                                                                                 |
| R-04 | **App Store review** of a health app with AI features                                                              | Medium     | High                                    | Permission priming, account deletion, restore purchases, and non-diagnostic language built in from M1 — not retrofitted; `APP_STORE_RELEASE.md` tracked from M12                                                                                 |
| R-05 | **Red-flag safety system** cannot be built from model memory                                                       | Certain    | High                                    | Deferred by design: rules must come from a citable clinical source and be human-reviewed before release. Until then the app shows a static, general "seek medical advice" surface rather than fake triage. **Owner decision required** (see §14) |
| R-06 | **AI cost** per active subscriber exceeds margin                                                                   | Medium     | Medium                                  | Server-side quotas from day one; deterministic paths preferred; per-cohort cost dashboards in M16                                                                                                                                                |
| R-07 | **AI extraction accuracy** on real meal photos is worse than demos suggest                                         | Medium     | Medium                                  | Confirmation screen makes errors cheap to fix; benchmark before choosing a provider; always keep manual entry equally fast                                                                                                                       |
| R-08 | Free tier too generous / paywall too early                                                                         | Medium     | Medium                                  | Contextual paywall at first emerging insight; instrument the funnel; iterate post-beta                                                                                                                                                           |
| R-09 | Engine drift between device TS and Edge Function Deno runtime                                                      | Low        | High                                    | One shared module, no runtime-specific branches, fixtures run in both environments in CI                                                                                                                                                         |
| R-10 | Expo SDK 58 lands mid-project                                                                                      | Medium     | Low                                     | Pin SDK 57; upgrade deliberately between milestones with the Expo upgrade skill                                                                                                                                                                  |

---

## 14. Open questions for the project owner

These are decisions Claude should not make unilaterally; work continues on everything else
in the meantime.

1. **Red-flag safety (R-05)** — Ship V1 with a static, non-triaging safety message, or source
   and human-review a real red-flag ruleset before release? _(Recommendation: static message
   for V1; a symptom-triage feature is a separate, reviewed project.)_
2. **AI provider** — Any constraint on which provider/model may process meal photos and
   journal text (privacy terms, data residency, existing account)? Benchmarking happens at
   M7, but a hard constraint changes the shortlist.
3. **Expo agent skills** — Loading the Expo skill was declined this session. May it be used
   for Milestones 1, 12 and 13? Without it, EAS specifics rest on documentation lookups.
4. **Bundle identifier and App Store name** — e.g. `com.<owner>.gutsignal`. Needed at M1.
5. **Photo retention default** — Plan assumes photos are **not** retained by default
   (analyze → extract → delete), with retention opt-in. Confirm.
6. **Illustration source** — original commissioned art vs generated abstract motifs for the
   welcome/empty states.

---

## 15. Change log

| Date       | Change                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| 2026-08-24 | Initial Milestone 0 plan created; ecosystem versions verified against npm; palette contrast verified. |
