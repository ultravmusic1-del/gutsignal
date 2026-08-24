# GutSignal — Principal Engineer Master Build Specification

> **Source of truth.** This is the project owner's specification, recorded verbatim (formatting
> normalized only). It ranks above `ARCHITECTURE.md` and `DECISIONS.md` in the source-of-truth
> order defined in `CLAUDE.md` §2, and below the owner's current explicit instructions.
> Do not edit it to reflect implementation drift — record deviations in `DECISIONS.md` instead.
>
> Recorded: 2026-08-24.

---

You are the principal engineer and technical owner responsible for designing and implementing GutSignal, a production-grade consumer gut-health tracking application.

Act simultaneously as:

- principal React Native engineer
- senior iOS product engineer
- backend architect
- data engineer
- security/privacy engineer
- subscription-app engineer
- QA lead
- accessibility engineer
- release engineer
- technical product manager

This is not a hackathon project, prototype, proof of concept, or collection of attractive screens.

The expected result is a commercial-quality application suitable for real App Store distribution, real paid subscriptions, real health-related user data, thousands of users, future Android distribution, and multi-year maintenance.

Prioritize:

1. correctness
2. privacy
3. usability
4. maintainability
5. reliability
6. performance
7. visual quality
8. cost efficiency
9. future scalability

Do not sacrifice architecture and safety merely to generate code faster.

## 1. BEFORE WRITING CODE

Do not immediately scaffold the entire application.

First inspect all material provided to you.

The project owner will provide:

**Product specification** — this document.

**UI reference** — an image depicting a modern mobile fitness application with:

- dark cinematic onboarding
- black and white primary surfaces
- lavender/purple accent
- bold minimal typography
- rounded cards
- highly rounded pill buttons
- floating rounded navigation
- highly visual data cards
- clean charts
- low information density
- subtle shadows
- illustrations
- considerable whitespace

The supplied image is a visual reference only.

Do not copy:

- copyrighted illustrations
- branding
- names
- exact layouts
- proprietary visual assets

Instead extract its design principles and establish an original GutSignal design system.

**Reference repository** — `https://github.com/vsouza/awesome-ios.git`

Treat this repository as a reference catalogue, not as the application's codebase.

Use it only to investigate high-quality approaches to:

- iOS UX
- App Store distribution
- security
- charts
- notifications
- authentication
- accessibility
- testing
- deployment
- permissions
- hardware capabilities
- data visualization

Do not randomly install packages because they appear in an "awesome" list.

Packages must be current, actively maintained, Expo-compatible where necessary, and justified.

**Additional agent resources** — if installed, actively use:

- official Expo Claude Code plugin/skills
- Supabase Agent Skills
- Software Mansion React Native skills
- RevenueCat AI Toolkit/MCP
- relevant official documentation

Prefer official documentation and official agent skills over old blog posts or model memory.

Never invent a current API or package version.

Verify current APIs before implementing them.

## 2. INITIAL DELIVERABLE BEFORE IMPLEMENTATION

Before writing substantial feature code, create `docs/PROJECT_PLAN.md`.

Include:

- architecture
- dependency decisions
- proposed folder structure
- database design
- privacy model
- offline strategy
- AI architecture
- statistical analysis architecture
- release workflow
- implementation milestones
- technical risks
- design interpretation
- Windows-to-iOS workflow

Also create `docs/DECISIONS.md`.

Use it as a lightweight Architecture Decision Record.

Document material decisions such as:

- React Native + Expo instead of SwiftUI
- Supabase instead of custom backend
- RevenueCat instead of custom StoreKit layer
- deterministic statistical analysis instead of LLM inference
- SQLite offline cache
- EAS cloud builds because host environment is Windows

Do not begin large-scale feature generation until these have been produced.

## 3. PRODUCT DEFINITION

Working name: **GutSignal**

Primary promise: **Stop guessing what affects your gut.**

Secondary explanation: GutSignal helps users discover recurring associations between their meals, lifestyle, bowel patterns and symptoms.

The product exists primarily for users dealing with recurring gastrointestinal problems such as IBS-like symptoms.

The product should help users answer:

- What tends to happen after I drink coffee?
- What happens after late dinners?
- Did I have fewer symptoms during better-sleep weeks?
- Have my symptoms improved over the last month?
- What do my best days have in common?
- What do my worst days have in common?
- How often do I experience morning urgency?
- Does dairy consistently precede symptoms in my logs?
- Are restaurant meals associated with worse days?
- Is the pattern I'm noticing actually consistent?
- Is there currently insufficient evidence to implicate something I assumed was a trigger?

The application is fundamentally:

```text
tracking → structured data → longitudinal analysis → insights → experiments
```

It is NOT primarily:

```text
chatbot → generic health advice
```

## 4. PRODUCT SAFETY BOUNDARY

GutSignal is not a diagnostic medical device.

Never implement outputs such as:

- "You have IBS."
- "You have IBS-D."
- "You are lactose intolerant."
- "This proves dairy causes diarrhea."
- "You have Crohn's disease."
- "You should stop this medication."
- "Coffee causes your symptoms."
- "This will cure your IBS."
- "You should follow this restrictive diet."

Preferred terminology:

- observed association
- recurring association
- possible pattern
- emerging signal
- worth investigating
- frequently occurred together
- preceded more symptom events
- associated with higher reported severity
- insufficient evidence
- inconclusive
- no clear relationship yet
- other factors may be involved

**Strong product rule: correlation must never be presented as causation.**

BAD:

> Coffee is one of your IBS triggers.

GOOD:

> In your recent logs, urgency was recorded more frequently after coffee-containing entries.

Better:

> Across 18 recorded coffee exposures, urgency was reported more often within your configured observation window than during comparable non-coffee periods. Poor sleep also frequently occurred on coffee days, so the individual effect is uncertain.

The language layer must preserve this distinction everywhere.

## 5. CORE TECHNOLOGY STACK

The developer's primary computer runs Windows. There is no assumption of access to a Mac.

Therefore use:

**Mobile application** — React Native, at the version supported by the current stable Expo SDK.

**Expo** — the current stable Expo SDK verified at implementation time.

**TypeScript** — enable:

```json
{
  "strict": true
}
```

Avoid `any` except at well-documented third-party boundaries.

**Expo Router** — file-based routing. Use route groups, stacks, tabs, modals, sheets, and typed routes where available.

## 6. IOS BUILD STRATEGY FROM WINDOWS

The app will be coded on Windows. Do not design a workflow requiring local Xcode for routine development.

Use **EAS Build** for remote iOS compilation, **EAS Submit** for App Store Connect submission, **TestFlight** for beta distribution, and **Expo development builds** for physical-iPhone development.

Required development workflow:

```text
Windows PC
    ↓
Claude Code
    ↓
React Native / Expo source
    ↓
GitHub
    ↓
EAS remote macOS build
    ↓
iPhone development build / TestFlight
```

Development build command conceptually:

```bash
eas build --platform ios --profile development
```

Production:

```bash
eas build --platform ios --profile production
```

Submission:

```bash
eas submit --platform ios
```

Do not assume these commands remain byte-for-byte unchanged forever. Verify through installed Expo skills/current Expo documentation before executing.

Create `docs/WINDOWS_IOS_WORKFLOW.md`. It must explain exactly how the project owner can:

- install prerequisites on Windows
- run Claude Code
- install dependencies
- run Metro
- register an iPhone
- generate a development client
- install it
- connect the physical iPhone to the Windows-hosted Metro bundler
- create preview builds
- create production builds
- submit to TestFlight
- test subscriptions
- release to App Store
- inspect build failures without Xcode
- use EAS tooling to troubleshoot native build problems

## 7. BACKEND STACK

Use **Supabase**: PostgreSQL, Auth, Storage, Edge Functions, Row Level Security, migrations, scheduled jobs where appropriate.

Do not create an unnecessary custom Express/Node server.

Business logic should be divided appropriately between:

- **Client** — UI and local interactions.
- **Postgres** — structured persistent data.
- **Edge Functions** — sensitive server-side integrations and controlled computation.
- **Background/scheduled jobs** — pattern-analysis refreshes and weekly reviews where needed.

## 8. DATA FETCHING AND STATE

Use **TanStack Query** for server state: fetch, caching, mutations, invalidation, retry policies, optimistic changes where safe, pagination, background refetching.

Use **Zustand** only for ephemeral local application state: currently open log sheet, unsaved logging draft, modal state, selected timeline filter, local onboarding UI progress.

Do NOT mirror the Supabase database into a giant Zustand store.

## 9. FORMS AND VALIDATION

Use **React Hook Form** and **Zod**.

Every boundary must be validated: AI response, Edge Function request, Edge Function response, external API response, form submission, deep-link parameters, RevenueCat metadata where appropriate.

Do not assume external JSON is correct.

## 10. LOCAL STORAGE AND OFFLINE SUPPORT

Use **expo-sqlite** for the local structured cache/outbox.

Use **expo-secure-store** for credentials, secure session material, and small sensitive tokens/settings where appropriate. Do not use SecureStore as a general database.

GutSignal must support logging when internet connectivity is unavailable. Core logging interactions must be local-first.

```text
User submits log
↓
Generate UUID locally
↓
Write SQLite immediately
↓
Render successfully in UI
↓
Mark pending_sync
↓
Background synchronization
↓
Supabase upsert
↓
Mark synced
```

Never make someone lose a bowel/symptom/meal log because their internet dropped.

## 11. AUTHENTICATION

Use Supabase Auth.

Initial methods: **Sign in with Apple** (primary iOS social authentication) and **email magic link / OTP** (secondary).

Avoid traditional passwords unless a clear requirement arises.

Architect the provider layer so Google sign-in can be added for Android later.

Authentication flow must support: first account creation, login, persisted session, token refresh, logout, expired session, deleted account, RevenueCat user identity, and offline startup where a valid cached session exists.

RevenueCat's application user identity should be tied to the stable authenticated GutSignal user ID.

## 12. SUBSCRIPTIONS

Use **RevenueCat** (`react-native-purchases`, and `react-native-purchases-ui` if appropriate).

RevenueCat is source of truth for subscription entitlement.

Create one initial entitlement:

```text
premium
```

Products conceptually:

```text
gutsignal_monthly
gutsignal_annual
```

Initial pricing target: monthly **$9.99**, annual **$59.99**.

Do not hardcode localized prices in UI. Retrieve store pricing dynamically.

Implement: offering retrieval, paywall, annual/monthly selection, purchase, restore, entitlement refresh, subscription management, RevenueCat Customer Center where appropriate, trial state, billing-error states, graceful offline handling.

The app may show mock/preview subscription UI in Expo Go if supported, but real subscription testing must occur through an Expo development build / TestFlight sandbox.

## 13. AI ARCHITECTURE

The app includes AI-assisted functionality but must not be architected around arbitrary LLM responses.

Create a provider abstraction:

```ts
interface GutSignalAIProvider {
  parseMealPhoto(input: MealPhotoInput): Promise<ParsedMealCandidate>;
  parseMealText(input: MealTextInput): Promise<ParsedMealCandidate>;
  parseJournal(input: JournalInput): Promise<ParsedJournalCandidate>;
  explainFinding(input: FindingExplanationInput): Promise<SafeExplanation>;
  answerPersonalDataQuestion(input: PersonalQuestionInput): Promise<SafePersonalAnswer>;
}
```

AI provider calls occur SERVER SIDE:

```text
Mobile
↓
Authenticated Supabase Edge Function
↓
Input validation
↓
Rate limiting
↓
AI provider
↓
Schema validation
↓
Safety validation
↓
Response
```

Never put private provider keys in the mobile app.

Do not lock the architecture to a single AI vendor.

Select the initial provider/model after benchmarking: structured-output reliability, multimodal meal recognition, latency, cost, privacy terms, availability.

Use cheaper/smaller models for classification, text extraction, and summarization. Use multimodal capability only where image understanding is actually needed.

## 14. AI MUST NOT BE THE STATISTICS ENGINE

This is a hard requirement.

Do NOT perform:

```text
send six months of diary to LLM
↓
ask "what are my triggers?"
↓
display answer
```

Instead:

```text
Structured logs
↓
Deterministic statistical engine
↓
Structured finding
↓
Optional natural-language explanation
```

LLM role: **explain calculated findings**, not **invent findings**.

## 15. DESIGN SYSTEM

Interpret the supplied reference image carefully.

- **Primary surfaces** — warm off-white / very light neutral. Not sterile pure-white everywhere.
- **Primary text** — near-black.
- **Accent** — lavender/purple inspired by reference. Choose one accessible signature accent.
- **Dark mode / dark surfaces** — deep charcoal rather than pure black where appropriate.
- **Cards** — large rounded cards. Approximate visual radius family:

```text
small 10–12
medium 16
large 20–24
pill 999
```

Actual tokens should be centralized.

- **Buttons** — large, rounded and tactile.
- **Charts** — minimal. Avoid dense axes, spreadsheet aesthetics, excessive gridlines, seven competing colors.
- **Navigation** — a floating dark navigation container inspired by the reference. However: navigation icons are NAVIGATION ONLY. The logging action is a separate floating action control.
- **Typography** — a clean system-forward sans-serif. Prefer platform typography / appropriately licensed font. Establish: display, title, section heading, card title, body, caption, data metric, button.
- **Illustrations** — original only. A future custom illustration system can use abstract digestive/gut motifs, food, sleep, wellbeing, patterns. Do not copy the fitness illustration from the reference.

## 16. DESIGN TOKENS

Create:

```text
src/theme/
  colors.ts
  typography.ts
  spacing.ts
  radius.ts
  shadows.ts
  motion.ts
  theme.ts
```

Never scatter values like:

```tsx
borderRadius: 23;
marginTop: 17;
color: '#947AFF';
```

throughout random components.

Use semantic tokens:

```ts
colors.surface.primary;
colors.surface.elevated;
colors.text.primary;
colors.text.secondary;
colors.accent.primary;
colors.status.positive;
colors.status.caution;
colors.status.danger;
```

## 17. ACCESSIBILITY

Treat accessibility as a release requirement.

Support: VoiceOver, Dynamic Type, minimum touch target sizing, logical navigation order, keyboard awareness, adequate contrast, reduced motion, accessible chart descriptions, meaningful icon labels, screen-reader summaries for data visualizations.

Never communicate insight confidence solely through color.

## 18. MAIN INFORMATION ARCHITECTURE

Use FOUR primary navigation destinations:

- **Today** — daily dashboard.
- **Timeline** — historical diary.
- **Insights** — patterns, trends, experiments, reviews.
- **You** — profile, settings, reports, subscription, privacy.

Then provide a separate central/floating **+ Log** action.

Do NOT create "Log" as a fake fifth navigation tab.

## 19. APP ROUTE STRUCTURE

```text
app/
  _layout.tsx

  index.tsx

  (auth)/
    welcome.tsx
    sign-in.tsx
    email.tsx
    verify.tsx

  (onboarding)/
    index.tsx
    goals.tsx
    symptoms.tsx
    bowel-pattern.tsx
    suspected-factors.tsx
    tracking-style.tsx
    philosophy.tsx
    account.tsx
    healthkit.tsx
    complete.tsx

  (tabs)/
    _layout.tsx
    today.tsx
    timeline.tsx
    insights.tsx
    you.tsx

  log/
    index.tsx

    meal/
      index.tsx
      camera.tsx
      text.tsx
      voice.tsx
      barcode.tsx
      review.tsx

    symptoms.tsx
    bowel.tsx
    wellbeing.tsx
    journal.tsx
    context.tsx

  insight/
    [id].tsx

  gut-map.tsx

  reviews/
    weekly.tsx
    monthly.tsx

  experiments/
    index.tsx
    create.tsx
    [id].tsx
    results.tsx

  ask/
    index.tsx

  reports/
    index.tsx
    create.tsx
    preview.tsx

  settings/
    profile.tsx
    tracking.tsx
    notifications.tsx
    health.tsx
    privacy.tsx
    subscription.tsx
    support.tsx
    legal.tsx

  paywall.tsx
```

Adapt as implementation evolves, but preserve clear domain separation.

## 20. APPLICATION BOOT STATE

```ts
type AppBootState =
  'booting' | 'unauthenticated' | 'onboarding' | 'ready' | 'configuration_error' | 'maintenance';
```

Boot sequence:

1. validate environment
2. initialize local database
3. restore Supabase session
4. initialize RevenueCat
5. identify RevenueCat user if authenticated
6. load profile
7. evaluate onboarding completion
8. hydrate local cache
9. initialize sync engine
10. initialize privacy-safe analytics
11. route once

Avoid auth/navigation flicker.

## 21. SPLASH / LAUNCH

Keep launch fast. Use branded but restrained launch artwork. Do not perform blocking network requests unnecessarily. Use cached state where possible. Do not trap the user on an animated splash for aesthetics.

## 22. WELCOME / HERO SCREEN

This should borrow most strongly from the dark left-hand screen in the supplied reference: charcoal background, original GutSignal illustration, lavender accent, large title, large CTA, subtle secondary login action.

Suggested:

> Understand your gut.
> Stop guessing.

Body:

> Track what you eat, how you feel and what changes over time.

Primary CTA: **Get started**. Secondary: **I already have an account**.

Do not show subscription pricing here.

## 23. ONBOARDING PHILOSOPHY

Onboarding must accomplish three things:

1. personalize the app
2. teach the product model
3. avoid overwhelming someone already frustrated by symptoms

Keep each screen focused on one decision. Show progress discreetly. Do not request all system permissions immediately.

## 24. ONBOARDING SCREEN — PRIMARY GOAL

> What would you like to understand better?

Multi-select:

- My possible triggers
- Why symptoms feel unpredictable
- Which habits seem to affect me
- Whether dietary changes are helping
- My bowel patterns
- What to show at appointments
- Longer-term symptom trends

Store results. Use them for personalization.

## 25. ONBOARDING — SYMPTOMS

> What do you commonly experience?

Bloating · Abdominal pain · Cramping · Loose stool / diarrhea · Constipation · Urgency · Gas · Incomplete evacuation · Nausea · Heartburn · Other

These are user-selected tracking categories. Do not imply diagnosis. Allow **Skip / I'm not sure**.

## 26. ONBOARDING — GENERAL BOWEL PATTERN

> Which sounds most like your usual pattern?

Mostly loose stools · Mostly constipation · A mix · It varies a lot · I'm not sure

Do not label the user IBS-C / IBS-D / IBS-M based on this answer.

## 27. ONBOARDING — SUSPECTED FACTORS

> Anything you already suspect affects you?

Coffee · Other caffeine · Dairy · Alcohol · Onion · Garlic · Large meals · Late meals · Spicy foods · Restaurant meals · Poor sleep · Stress · Artificial sweeteners · Other

Prominent: **I'm not sure** — this is an important target user.

Allow custom factors.

## 28. ONBOARDING — TRACKING STYLE

> How much effort should tracking take?

- **Minimal** — around 30 seconds a day.
- **Balanced** — a few quick check-ins.
- **Detailed** — I want deeper tracking.

This setting controls defaults. Minimal users should not see ten fields every time they log.

## 29. ONBOARDING — HOW GUTSIGNAL WORKS

Teach:

- **Log normally** — food, symptoms and bowel patterns.
- **Find repeating signals** — GutSignal compares patterns over time.
- **Test assumptions** — explore suspected factors without jumping to conclusions.

Then explicitly state:

> GutSignal identifies associations in your data. It does not diagnose conditions or prove that one factor caused a symptom.

Require acknowledgment but do not turn this into a wall of legal text.

## 30. ONBOARDING — ACCOUNT

Offer **Continue with Apple** (primary) and **Continue with email** (secondary).

Use system-native Sign in with Apple styling requirements.

## 31. ONBOARDING — APPLE HEALTH PRE-PERMISSION

Do NOT trigger HealthKit immediately. Custom screen:

> **Less manual tracking**
> Connecting Apple Health can help GutSignal understand context such as sleep and activity without asking you to enter everything manually.

CTA: **Connect Apple Health**. Secondary: **Maybe later**.

Only after the user taps Connect should the OS permission sheet appear.

## 32. ONBOARDING — COMPLETION

> You're ready.
> The more consistently you log, the more useful your personal patterns can become.

Do not promise that an insight will definitely appear in X days.

CTA: **Log my first entry**. Optional secondary: **Explore GutSignal**.

## 33. TODAY SCREEN

This is the application's home dashboard. Visual treatment should reflect the middle device in the reference: clean neutral background, large greeting, strong title, modular cards, soft shadow, lavender accents, dark floating navigation.

```text
Good morning, Alex

How's your gut today?

[ Meal ] [ Symptoms ]
[ Bowel ] [ Feeling good ]

TODAY
GutSignal Score
72

Today's context
Sleep 6h 12m
Stress Moderate
Meals 2

Something we're watching
Late evening meals...
```

## 34. GUTSIGNAL SCORE

Optional but useful. It must be clearly an internal convenience metric, not a validated clinical scale.

Compute deterministically. Possible components: symptom severity, symptom count, urgency, bowel deviation, explicit wellbeing entry.

Do NOT include hidden AI intuition.

Display `72` with a textual explanation such as "A fairly settled day" or "Symptoms have been more noticeable today".

Allow: **How is this calculated?**

## 35. LOG ACTION SHEET

Floating + button opens a polished sheet.

Large actions: Meal · Symptoms · Bowel movement · Feeling good.

Secondary: Quick journal · Stress / context.

Show recently used action. Haptic feedback. Do not require navigating away from context unnecessarily.

## 36. MEAL LOGGING — FOUR MODES

**Photo** (take meal photo) · **Describe** (type naturally) · **Speak** (voice input) · **Repeat** (reuse previous meal).

Potential additional: **Barcode** (packaged food).

## 37. MEAL PHOTO FLOW

```text
Open camera
↓
Capture
↓
Local compression
↓
Preview
↓
Upload securely
↓
Server AI analysis
↓
Structured candidate
↓
User confirmation
↓
Persist
```

Never automatically save model guesses as confirmed meal components.

```json
{
  "items": [
    { "name": "grilled chicken", "confidence": 0.94 },
    { "name": "white rice", "confidence": 0.91 },
    { "name": "garlic sauce", "confidence": 0.63 }
  ]
}
```

UI should make low-confidence items visibly editable.

## 38. MEAL TEXT FLOW

User can type: _Chicken shawarma with fries and garlic sauce._

Extract candidates. Review screen:

> I found: Chicken · Flatbread · Fries · Garlic sauce

Allow edit/delete/add. Never pretend the extraction is perfect.

## 39. MEAL VOICE FLOW

User: _I had two eggs, toast, a banana and coffee with milk._

Flow: record → transcribe → structure → review → confirm.

Do not retain raw voice indefinitely unless necessary and disclosed. Prefer deleting temporary audio after successful structured extraction.

## 40. REPEAT MEALS

This will likely have excellent real-world usage.

Show **Recent**, **Favorites**, **Same as yesterday**.

A single interaction should duplicate meal components and allow editing time/quantity/context.

## 41. MEAL METADATA

Store: timestamp, title, meal items, meal size, source, tags, optional note, photo reference if retained.

Useful tags: caffeinated · alcoholic · restaurant · spicy · large meal · rich/high-fat · late meal · homemade.

Do not force calorie tracking.

## 42. BARCODE SCANNING

Optional V1.1 feature. Use Open Food Facts where practical.

Flow: barcode → lookup → display product → user confirms → store product/ingredient information.

Open Food Facts data must be treated as third-party/community data. Do not make medical conclusions from the database.

Handle: unknown barcode, incomplete ingredients, stale data, API unavailable, incorrect product.

## 43. SYMPTOM LOGGING

Must be extremely fast. Target: **<10 seconds** for common symptom entry.

Display personalized common symptoms first.

```text
How are you feeling?

Bloating      6
Urgency       8
Cramping      3

[ Save ]
```

Severity 1–10. Also allow timestamp change, note, additional symptom. Do not force text entry.

## 44. FEELING GOOD

This feature is statistically essential.

Provide **I'm feeling good** as one tap.

Why: absence of a symptom log does NOT equal absence of symptoms. An explicit low/no-symptom entry creates useful comparison data.

Store separately as a wellbeing/control observation.

## 45. BOWEL MOVEMENT LOGGING

Use Bristol Stool Scale Types 1–7. Use original/licensed representations. Do not copy copyrighted stool illustrations.

Fields:

- **Bristol Type** — 1–7
- **Urgency** — None / Low / Moderate / High
- **Difficulty** — Easy / Moderate / Difficult
- **Incomplete feeling** — Yes / No
- Optional note

Default timestamp = now. Make logging possible in seconds.

## 46. QUICK JOURNAL

User may type or speak:

> Woke up bloated and went twice before work. Slept badly. Had curry really late last night but felt much better after lunch.

The application extracts candidate events:

```text
I understood:

✓ Morning bloating
✓ Two bowel movements
✓ Poor sleep
✓ Late dinner
✓ Curry meal
✓ Felt better after lunch
```

User confirms. Only confirmed information enters structured logs.

## 47. CONTEXT LOG

Allow contextual observations:

- **Stress** — 1–5 or simple low/moderate/high
- **Sleep quality** — optional manual entry if HealthKit unavailable
- **Exercise** — optional
- **Travel** — optional later
- **Menstrual-cycle context** — potential later opt-in feature if relevant, but do not ask all users

Do not create an overwhelming universal health diary.

## 48. TIMELINE

The Timeline is a chronological personal gut diary.

```text
TODAY

8:10 AM   Bowel movement    Type 6 • High urgency
8:35 AM   Symptoms          Bloating 6 • Urgency 7
9:15 AM   Breakfast         Eggs • Toast • Coffee
1:20 PM   Lunch             Rice • Chicken • Vegetables
4:30 PM   Feeling good      Low symptom burden
```

Capabilities: infinite/paginated scrolling, day grouping, filters, search where useful, edit, delete, offline rendering, sync state, smooth performance.

Filters: All · Meals · Symptoms · Bowel · Wellbeing · Context · Journal.

## 49. INSIGHTS HOME

Use visual inspiration from the right-hand reference screen. This should feel like an elegant health-progress dashboard.

Sections: **Your Gut Map** (current high-level pattern landscape) · **What stands out** (2–4 highest-value findings) · **Worth investigating** (emerging patterns) · **Trends** · **Experiments** · **Weekly review**.

Avoid presenting twenty charts simultaneously.

## 50. PATTERN STATES

```ts
type PatternStatus =
  'insufficient_data' | 'emerging' | 'moderate' | 'stronger_recurring_signal' | 'no_clear_pattern';
```

Avoid the label `confirmed_trigger` — it implies causality.

## 51. PATTERN DETAIL PAGE

> **Coffee** — Emerging signal — 18 recorded exposures
>
> **What we observed:** Urgency was recorded more frequently after coffee-containing entries than during comparable observation periods.
>
> After coffee **46%** · Comparison **27%**
>
> **Things to consider:** Short sleep occurred frequently on coffee days too.
>
> **Confidence:** Moderate
>
> **Next step:** Keep tracking — or — Start an experiment

Provide **How this was calculated**. Transparency is a feature.

## 52. GUT MAP

Create visually distinct groups:

- **Stronger signals** — e.g. Poor sleep, Late meals
- **Worth investigating** — e.g. Coffee, Large meals
- **No clear pattern** — e.g. Dairy, Exercise
- **Not enough data** — e.g. Alcohol

Each opens detail. Do not make Gut Map look like medical diagnosis output.

## 53. DETERMINISTIC PATTERN ENGINE

```text
src/domain/pattern-engine/
  exposures.ts
  outcomes.ts
  windows.ts
  normalization.ts
  comparisons.ts
  confidence.ts
  confounders.ts
  scoring.ts
  multiple-testing.ts
  types.ts
  fixtures/
  tests/
```

Potential server counterpart:

```text
supabase/functions/pattern-analysis/
```

Document in `docs/PATTERN_ENGINE.md`.

## 54. EXPOSURE NORMALIZATION

Foods vary linguistically. `latte`, `espresso`, `americano`, `coffee` may all contribute to `coffee` / `caffeine`.

Maintain **raw item** (what the user actually entered) and **canonical factor** (normalized analytical category). Never destroy raw values.

Potential factor hierarchy:

```text
Food
 └ Coffee
    └ Caffeine
```

Allow user corrections.

## 55. OUTCOMES

Analytical outcomes include: symptom event occurrence, symptom severity, bowel urgency, stool pattern, daily symptom burden, morning symptom burden, explicit wellbeing.

Keep symptom-specific and global outcomes separate.

## 56. OBSERVATIONAL WINDOWS

Support configurable observation windows: shortly after · later same day · next morning · next day.

Do not claim these windows represent medically validated causal latency unless supporting evidence exists. They're analysis windows. Version them.

## 57. STATISTICS

At minimum calculate appropriate versions of: exposure count, control/comparison count, outcome frequency, absolute difference, relative difference, mean/median severity difference, consistency across weeks, confidence/uncertainty intervals, missing-data ratio, explicit good-state availability, confounder overlap.

Statistical methods must be documented. Never use a single p-value as user-facing truth.

## 58. SAMPLE-SIZE SAFETY

Never show "Strong signal" because something happened twice. Make thresholds configurable.

- **Insufficient** — not enough comparable observations.
- **Emerging** — early difference worth watching.
- **Moderate** — repeated association with reasonable coverage.
- **Stronger recurring signal** — consistent association across sufficient repeated observations.

Exact thresholds need testing and review. Do not invent medical validation claims around these labels.

## 59. MISSING-DATA HANDLING

A blank day does not mean a symptom-free day. Distinguish:

```text
no_data
explicit_good_state
symptom_logged
```

This is crucial. Pattern confidence should decline when tracking completeness is poor.

## 60. CONFOUNDERS

The system must detect common co-occurrence. If `coffee ↔ poor sleep` are highly correlated, do not confidently attribute effects independently.

User output:

> Coffee and short sleep frequently occurred together in your records, which makes their individual relationships harder to separate.

## 61. MULTIPLE COMPARISON CONTROL

If the app checks dozens of foods and behaviors, random correlations will appear. Implement conservative safeguards: false discovery controls, stronger confidence requirements for broad scans, repeated-week consistency, minimum effect sizes, shrinkage/down-weighting, explicit exploratory status.

Document chosen methodology.

## 62. FINDING REPRODUCIBILITY

Every displayed finding should store:

```text
engine_version
factor_id
analysis_start
analysis_end
outcome
exposure_count
control_count
effect_metrics
confidence
confounders
tracking_completeness
generated_at
```

A finding must be reproducible later.

## 63. WEEKLY REVIEW

> **Your Gut Week**
> Overall symptoms ↓ 14%
> Best day: Thursday
> Most difficult day: Monday
> Average sleep: 6h 41m
> Bowel movements: 18
>
> **Something interesting:** Your lowest-symptom mornings frequently followed longer recorded sleep.
>
> **Worth watching:** Late dinners.

If insufficient tracking: show useful tracking feedback rather than fabricating insight.

## 64. MONTHLY REVIEW

Premium. Include: symptom trend, bowel distribution, wellbeing days, logging completeness, strongest patterns, emerging factors, experiments, changes from previous month.

Make it visually shareable but private by default.

## 65. ASK MY GUT

Premium flagship feature. This is NOT an unrestricted medical chatbot — it is a natural-language interface to the user's own data.

Example questions: What usually happens after coffee? · What were my best five days? · What changed last week? · Is my bloating improving? · How often do I have urgency in the morning? · Do restaurant meals look worse? · Does dairy consistently precede symptoms? · What factors currently have insufficient evidence?

## 66. ASK MY GUT TOOL ARCHITECTURE

```ts
getSymptomTrend();
getFactorExposureSummary();
compareFactorVsBaseline();
getBestDays();
getWorstDays();
comparePeriods();
getBowelSummary();
getSleepAssociation();
getMealTimingAnalysis();
getExperimentSummary();
getTrackingCompleteness();
```

Flow:

```text
Question
↓
Intent classification
↓
Call analytics tools
↓
Structured results
↓
Generate natural-language explanation
↓
Safety validation
↓
Render
```

Do not send the entire raw database to a model.

## 67. ASK MY GUT SAFETY

If the user asks _"Do I definitely have lactose intolerance?"_ reply conceptually:

> GutSignal can't determine whether you have lactose intolerance. Your logs currently show [data-backed observation].

If the user asks _"Should I stop taking my medication?"_ — do not provide personalized medication instruction. Stay within product scope.

## 68. PERSONAL EXPERIMENTS

Allow structured experiments around user-selected lifestyle factors. Low-risk examples: coffee, late meals, meal size, restaurant meals, alcohol, custom suspected food.

States:

```text
draft
baseline
change_period
follow_up
complete
cancelled
```

Do not automatically prescribe extreme elimination diets.

## 69. EXPERIMENT RESULTS

> **Coffee experiment**
> Baseline symptom score: 6.3
> Selected change period: 4.2
> Follow-up: 5.8
>
> Your recorded symptoms were lower during the selected change period. Sleep duration was also higher during that period, so this result can't confidently be attributed to coffee alone.

This is the standard of caution expected.

## 70. REPORTS

Support 30-day, 90-day, and custom periods. Create appointment-friendly reports.

Include: tracking completeness, bowel frequency, Bristol distribution, symptom frequency, symptom severity, trends, experiments, observed associations, and medications/supplements only if the user explicitly logs them in a later module.

Avoid generic AI conclusions.

## 71. PDF EXPORT

Generate a clean PDF: legible, printable, concise, accessible, visually professional, low ink usage, no diagnostic claims.

Charts should work even when printed grayscale.

## 72. HEALTHKIT

Integrate through `@kingstinct/react-native-healthkit` or the best current maintained Expo-compatible HealthKit bridge after verification.

```ts
interface HealthDataProvider {
  requestPermissions(): Promise<PermissionResult>;
  getSleep(...): Promise<SleepRecord[]>;
  getActivity(...): Promise<ActivityRecord[]>;
}
```

iOS implementation: `IOSHealthKitProvider`. Future: `AndroidHealthConnectProvider`.

The core app must not depend directly on HealthKit types everywhere.

## 73. HEALTHKIT DATA

Initially consider reading only data genuinely useful to pattern discovery: sleep duration, workouts, activity/steps.

Do not request broad health permissions because they are available. Least privilege.

Never request HealthKit authorization before contextual pre-permission UI. Permission denial must never break the application.

## 74. NOTIFICATIONS

Use `expo-notifications`. Initial notifications can mostly be local/scheduled.

- Morning — _Quick gut check-in?_
- Evening — _Anything worth logging today?_
- Experiment — _Day 4 of your coffee experiment._
- Weekly — _Your weekly review is ready._

Do not spam users. Adapt reminders to tracking preference. Ask OS notification permission only after explaining value.

## 75. NOTIFICATION SETTINGS

Granular toggles: morning check-in, evening check-in, experiment reminders, weekly review, product updates. Allow quiet hours.

## 76. DATABASE SCHEMA

Use UUID identifiers. All user-event tables include:

```text
id
user_id
occurred_at
created_at
updated_at
timezone_offset
source
sync metadata where appropriate
```

Sources:

```text
manual
ai_confirmed
healthkit
imported
```

AI-generated but unconfirmed data must NOT use `ai_confirmed`.

## 77. PROFILES

`profiles`:

```text
id
display_name
timezone
tracking_style
onboarding_completed_at
created_at
updated_at
```

## 78. USER PREFERENCES

`user_preferences`:

```text
user_id
selected_symptoms
suspected_factor_preferences
notification_preferences
keep_meal_photos
analytics_consent
ai_processing_preferences
```

Use normalized tables where relational behavior requires it rather than dumping everything into JSON.

## 79. MEALS

`meal_logs`:

```text
id
user_id
occurred_at
title
meal_size
source
notes
photo_asset_id
created_at
updated_at
```

`meal_items`:

```text
id
meal_id
user_id
raw_name
canonical_factor_id
confidence
user_confirmed
source
```

`meal_tags` — normalized.

## 80. SYMPTOMS

`symptom_logs`:

```text
id
user_id
symptom_type
severity
occurred_at
note
source
```

Enforce valid severity range.

## 81. BOWEL LOGS

`bowel_logs`:

```text
id
user_id
occurred_at
bristol_type
urgency
difficulty
incomplete
note
source
```

Validate Bristol range 1–7.

## 82. WELLBEING

`wellbeing_logs` — used for explicit feeling good / low symptom state.

Do not infer this from missing symptom logs.

## 83. CONTEXT

`context_logs` — possible factor types: stress, manual sleep quality, exercise context, other custom context.

## 84. JOURNAL

`journal_entries` — store original entry if retention enabled, timestamp, extraction state, created-records references where useful.

Do not keep raw voice by default after successful transcription.

## 85. FACTOR CATALOG

`factor_catalog` — store canonical analysis concepts:

```text
coffee
caffeine
dairy
late_meal
large_meal
alcohol
poor_sleep
high_stress
```

Support hierarchy.

## 86. PATTERN FINDINGS

`pattern_findings`:

```text
id
user_id
factor_id
outcome_type
status
engine_version
analysis_start
analysis_end
metrics jsonb
confidence_score
generated_at
```

Index carefully.

## 87. EXPERIMENT TABLES

`experiments`, `experiment_phases`, `experiment_checkins` — store configuration and reproducible result metrics.

## 88. REVIEWS

`weekly_reviews`, `monthly_reviews` — prefer storing deterministic metric snapshots and generation metadata rather than only AI prose.

## 89. AI USAGE

`ai_usage_events` — store non-sensitive operational metrics: feature, provider, model, approximate tokens, image used, latency, estimated cost, result status.

Avoid storing health text redundantly.

## 90. SUBSCRIPTION EVENTS

RevenueCat remains source of truth. If webhook events are stored, `revenuecat_webhook_events` requires: unique event ID, received timestamp, processed timestamp, idempotency, safe event subset.

Do not trust arbitrary client subscription flags.

## 91. ROW LEVEL SECURITY

RLS is mandatory. Every user-owned record must be private by default.

```sql
auth.uid() = user_id
```

Implement appropriate relational policies for children. Test with at least User A and User B.

Automated security test must prove User A cannot SELECT, INSERT under B, UPDATE, or DELETE User B's records.

**This is a release blocker.**

## 92. STORAGE SECURITY

Meal photos use a PRIVATE bucket:

```text
meal-photos/{userId}/{uuid}.webp
```

Use signed URLs where necessary. Never expose a public health-photo bucket. Remove unnecessary EXIF metadata. Compress images before upload.

## 93. PHOTO RETENTION

Default design should minimize unnecessary sensitive media retention.

Option: **Keep meal photos in my timeline**. If disabled: analyze → extract structured food data → delete original after a controlled temporary period → preserve structured confirmed log.

Clearly disclose behavior.

## 94. PRIVACY PRINCIPLES

- **Data minimization** — collect only what the product needs.
- **Purpose limitation** — health logs are for the user's product experience.
- **Least privilege** — permissions minimal.
- **User control** — export and delete.
- **Clear AI disclosure** — explain which data may be sent to AI processing providers.
- **No advertising based on health data** — never build health-based ad targeting.

## 95. PRODUCT ANALYTICS

Use privacy-conscious analytics such as PostHog if configured appropriately.

Allowed events:

```text
app_opened
onboarding_started
onboarding_completed
log_sheet_opened
meal_log_completed
symptom_log_completed
bowel_log_completed
insights_viewed
pattern_opened
experiment_started
paywall_viewed
trial_started
purchase_completed
report_exported
```

Never send food name, symptom name, symptom severity, Bristol type, journal text, AI question, HealthKit value, experiment factor, or medical information to analytics.

Prefer event counts and funnel-state analytics only. No sensitive session replay — default to session replay disabled.

## 96. CRASH MONITORING

Use Sentry or a suitable equivalent. Configure scrubbing.

Do not transmit health log bodies, access tokens, email where unnecessary, AI prompts, images, or journal content.

Create safe structured breadcrumbs.

## 97. ACCOUNT DELETION

Implement in-app: You → Privacy & Data → Delete account.

Flow: explain → confirm → reauthenticate if needed → delete database records → delete Storage assets → clear local database → unlink identity → log out.

Explain separately:

> Deleting your GutSignal account does not automatically cancel an Apple subscription.

Provide subscription-management access.

## 98. DATA EXPORT

Allow the user to request/download structured JSON, CSV where useful, and PDF reports.

Export should include meaningful human-readable timestamps.

## 99. RED-FLAG SAFETY SYSTEM

Architect a deterministic safety mechanism for user-entered symptom information.

**DO NOT invent red-flag criteria from model memory.**

Create `src/domain/safety/`. Rules must be derived from explicit vetted medical sources and be versioned/reviewable. An LLM cannot be the only detector. Before release, criteria need human review.

## 100. ERROR STATES

Every asynchronous feature needs: loading, empty, success, offline, permission denied, retryable failure, non-retryable failure.

- **AI failed** — _We couldn't analyze that meal. You can still add it manually._
- **HealthKit unavailable** — _Apple Health isn't connected. Manual tracking still works normally._
- **No insight** — _Not enough information yet. Keep logging normally._
- **Subscription unavailable** — _Plans couldn't be loaded right now._

Never expose raw stack traces.

## 101. PERFORMANCE

Smooth 60fps baseline · no giant synchronous JS work · timeline virtualization · image compression · paginated queries · sensible database indexes · memoization only where justified · avoid N+1 queries · avoid unnecessary rerenders · avoid loading entire history on every screen.

Use profiling before complex optimization.

## 102. TIMEZONE SAFETY

Critical. Store canonical timestamp in UTC. Preserve relevant timezone/offset. "Today" is based on the user's current local timezone.

Test: midnight, travel, DST, timezone change, late dinner, HealthKit timestamps.

Do not group days solely by UTC calendar date.

## 103. VISUAL CHARTS

Use a proven React Native chart solution or Skia/SVG where justified. Before selecting, verify accessibility, maintenance, Expo compatibility, performance.

Charts needed: symptom trend · Bristol distribution · exposed vs comparison · weekly GutSignal Score · tracking completeness.

Charts must prioritize comprehension.

## 104. PAYWALL STRATEGY

Do not paywall onboarding. Do not ask someone to pay before they understand the product.

Preferred contextual trigger: the user has logged enough information for a first meaningful/emerging result.

> **Something is starting to emerge.**
> We've found a pattern worth investigating in your recent logs.
> **Unlock my insights**

Then paywall. Also make Upgrade available under **You**.

## 105. FREE TIER

Manual meal logging · symptom logging · bowel logging · wellbeing logs · timeline · limited history · limited AI-assisted entries · basic weekly summary.

Free tier should prove utility.

## 106. PREMIUM TIER

Unlimited history · AI photo logging · expanded AI text/voice logging · full pattern engine · Gut Map · Ask My Gut · experiments · weekly review · monthly review · advanced reports · HealthKit-derived insights · advanced exports.

Feature gates must be centralized.

## 107. COST CONTROLS

AI usage can become a large variable cost. Implement quotas/configuration remotely: photo parses per period, Ask My Gut requests, journal parses.

Avoid punitive UX. Cache reusable results. Do not call AI for deterministic calculations. Track cost per subscriber cohort.

## 108. ENVIRONMENT VARIABLES

Create `.env.example`. Public client configuration may include only intentionally public project keys:

```text
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

EXPO_PUBLIC_REVENUECAT_IOS_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=

EXPO_PUBLIC_POSTHOG_KEY=
EXPO_PUBLIC_SENTRY_DSN=
```

Server-only:

```text
AI_PROVIDER_API_KEY
REVENUECAT_WEBHOOK_SECRET
OTHER_PRIVATE_KEYS
```

Store server secrets in secure platform secret storage. Never prefix secrets with `EXPO_PUBLIC_`.

## 109. REPOSITORY STRUCTURE

```text
app/

src/
  components/
    ui/
    charts/
    logging/
    insights/

  features/
    auth/
    onboarding/
    meals/
    symptoms/
    bowel/
    wellbeing/
    journal/
    timeline/
    insights/
    patterns/
    experiments/
    ask-my-gut/
    reports/
    subscriptions/
    notifications/
    health/

  domain/
    pattern-engine/
    safety/
    scoring/

  services/
    supabase/
    ai/
    analytics/
    revenuecat/
    health/
    notifications/
    storage/

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
  unit/
  integration/
  e2e/
  fixtures/

docs/

assets/
```

Prefer feature/domain boundaries over a massive `components` directory.

## 110. TESTING STACK

Use current Expo-compatible testing recommendations. At minimum:

- **Unit** — pure business logic
- **Integration** — services and database
- **UI/component** — React Native Testing Library
- **E2E** — Maestro or currently recommended alternative
- **RLS tests** — mandatory
- **Pattern engine fixtures** — extensive

## 111. PATTERN ENGINE TEST FIXTURES

Create synthetic datasets for:

1. strong genuine association
2. no association
3. apparent association caused by tiny sample
4. heavy missing data
5. explicit good-state controls
6. perfect confounding
7. recurring association across weeks
8. association existing in only one week
9. opposite associations across periods
10. time-zone boundary
11. many foods simultaneously
12. custom factor
13. no symptoms
14. very high baseline symptom rate
15. retrospective edit/delete changing finding

Do not ship pattern detection without these.

## 112. AUTH TESTS

Apple sign-in · email auth · restore session · logout · expired JWT · failed refresh · deleted user · duplicate auth attempt · RevenueCat identity assignment.

## 113. PURCHASE TESTS

Free · monthly subscription · annual subscription · trial if enabled · restore purchase · expiration · cancellation · billing grace · network failure · RevenueCat unavailable · offering unavailable · user logs out · user signs into another account.

Use actual sandbox/TestFlight testing before release.

## 114. IOS PHYSICAL DEVICE TESTS

Because no local iOS simulator exists on Windows, establish physical-device QA early.

Test on a real iPhone: camera · photo upload · microphone · Sign in with Apple · HealthKit · RevenueCat · notifications · SecureStore · network changes · backgrounding · deep links · accessibility · Dynamic Type · offline queue.

Do not wait until release week.

## 115. ANDROID FUTURE-PROOFING

Android is expected relatively early after iOS product validation. Therefore avoid iOS-specific business logic.

Use service interfaces:

```text
HealthDataProvider
NotificationProvider
SubscriptionProvider
SecureStorageProvider
```

UI may be iOS-first but should not require a rewrite. Future Android health data: Health Connect. Future billing: Google Play through RevenueCat.

## 116. IOS-FIRST POLISH

Cross-platform does not mean generic. On iOS support: native-style sheets · haptics · safe areas · SF Symbols where appropriate · native-feeling navigation · correct keyboard behavior · swipe-back expectations · system permission conventions · proper Apple login · Dynamic Type.

The app should feel designed for iPhone.

## 117. MOTION

Use animations sparingly.

Good: card appearance · number transitions · sheet transitions · save confirmation · chart state change.

Bad: constant floating effects · decorative loading delays · unnecessary confetti · motion-heavy medical data.

Honor Reduced Motion.

## 118. EMPTY STATES

Design every empty state.

- Timeline — _Nothing logged yet._
- Insights — _We need more information before looking for patterns._
- Experiments — _No experiments yet._
- Reports — _Your first report becomes useful after you've logged some history._

Do not render blank screens.

## 119. APP STORE REQUIREMENTS

Create `docs/APP_STORE_RELEASE.md`. Track: Apple Developer enrollment · bundle identifier · App Store Connect creation · certificates/signing through EAS · In-App Purchase capability · HealthKit capability · RevenueCat products · privacy policy · terms · support URL · account deletion · restore purchases · permission strings · App Privacy answers · screenshots · App Store description · review notes · TestFlight · subscription metadata · health-related claims · accessibility · age rating.

## 120. IOS PERMISSION COPY

Write human-readable usage descriptions:

- **Camera** — Used to quickly identify meal components from photos.
- **Microphone** — Used when you choose to describe meals or journal entries by voice.
- **Health** — Used to reduce manual tracking by importing selected health context such as sleep.

Do not say vague things like "Camera required."

## 121. PRIVACY POLICY REQUIREMENTS

Before release the Privacy Policy must clearly explain: categories collected · purpose · storage · AI processing · subprocessors · retention · HealthKit · analytics · deletion · export · subscription processing.

Engineering must make actual behavior match policy.

## 122. ANALYTICS DASHBOARD REQUIREMENTS

Build instrumentation around the funnel:

```text
App Store download
↓
onboarding started
↓
onboarding completed
↓
first log
↓
3 logs
↓
first useful insight
↓
paywall
↓
trial
↓
paid
↓
week 1 retained
↓
month 1 retained
```

Do not instrument health content.

Product metrics: activation · logging frequency · insight engagement · trial conversion · paid conversion · churn · AI cost · report usage · experiment completion.

## 123. OBSERVABILITY

Create meaningful logs for: authentication · sync failure · Edge Function failure · AI malformed output · AI timeout · RevenueCat failure · HealthKit permission failure · database migration issues.

Never log sensitive record content unnecessarily.

## 124. CI

GitHub pull request pipeline should run:

```text
install
lint
format
typecheck
unit tests
integration tests where practical
```

Migrations should be validated. Main branch can trigger preview/build workflows after baseline stabilizes.

## 125. GIT DISCIPLINE

Use small conventional commits:

```text
feat(logging): add bowel movement entry flow
feat(patterns): implement exposure comparison
feat(auth): add Sign in with Apple
test(rls): validate user isolation
fix(sync): prevent duplicate offline meal uploads
```

Before commit: lint, typecheck, tests, `git diff`.

Never commit `.env` or secrets.

## 126. CLAUDE CODE OPERATING RULES

These rules are mandatory.

**A. Plan before large changes.** For each milestone: inspect current state → summarize implementation plan → identify dependencies → implement incrementally → validate → summarize result.

**B. Do not hallucinate APIs.** If uncertain about Expo, RevenueCat, Supabase, React Native or HealthKit, consult installed current skills/documentation before coding.

**C. Do not install abandoned libraries casually.** Before adding a material dependency check maintenance, compatibility, license, necessity, native requirements.

**D. Do not solve everything with dependencies.** Prefer platform/Expo capabilities where reasonable.

**E. Do not generate the entire application in one pass.** Use milestones.

**F. Avoid placeholders in completed milestones.** No dead buttons. No fake API responses presented as production behavior.

**G. Keep documentation synchronized.** When architecture changes, update docs.

**H. Make progress autonomously.** Do not repeatedly ask the user questions Claude can resolve from the repository, product spec, docs, reference image, or installed skills. Ask only when genuinely blocked by a product decision, account credential, irreversible external action, or ambiguity with material consequences.

**I. Separate user-required setup.** When Apple/Supabase/RevenueCat configuration must be performed externally, create an exact checklist. Then continue implementing everything possible independently.

## 127. IMPLEMENTATION MILESTONES

**Milestone 0 — Technical audit.** Produce `PROJECT_PLAN.md`, `DECISIONS.md`, reference-image analysis, repo/resource analysis, dependency proposal, threat model outline. No major implementation.

**Milestone 1 — Foundation.** Expo, TypeScript, Expo Router, theme, reusable UI primitives, EAS configuration, environment validation, lint, testing, error boundary, Supabase client, SQLite foundation. _Acceptance: app launches through a real iOS development build._

**Milestone 2 — Design system and navigation.** Reference-inspired design system, Today/Timeline/Insights/You shells, floating log action, modal/sheet architecture. _Acceptance: the entire shell feels coherent and polished on a physical iPhone._

**Milestone 3 — Authentication.** Supabase Auth, Apple, email, boot restoration, logout, error states. _Acceptance: repeated login/logout survives restarts correctly._

**Milestone 4 — Onboarding.** Complete onboarding. _Acceptance: a new user can complete setup without dead ends._

**Milestone 5 — Core offline logging.** Manual meal, symptom, bowel, feeling-good, context, SQLite queue, Supabase sync. _Acceptance: create logs in airplane mode, reconnect, verify sync._

**Milestone 6 — Timeline.** Pagination, local cache, filters, edit, delete, sync status. _Acceptance: a large dataset remains smooth._

**Milestone 7 — AI-assisted logging.** Photo, text, voice, journal parsing, strict schemas, confirmation, cost telemetry. _Acceptance: AI never creates a confirmed health log without user confirmation._

**Milestone 8 — Pattern engine.** Deterministic analytical engine and extensive fixtures. _Acceptance: synthetic datasets produce expected classifications._

**Milestone 9 — Insights.** Insight cards, pattern details, Gut Map, trends, weekly review. _Acceptance: every insight links to understandable evidence._

**Milestone 10 — Ask My Gut.** Tool-driven personal query system. _Acceptance: questions about the user's data produce deterministic-data-backed answers._

**Milestone 11 — Experiments.** Experiments and results. _Acceptance: confounders and uncertainty are visibly represented._

**Milestone 12 — RevenueCat.** Subscription setup, paywall, entitlement, purchase, restore, management, feature gates. _Acceptance: an actual iOS sandbox purchase works._

**Milestone 13 — HealthKit.** Permissions and selected imports. _Acceptance: permission denied does not damage the app._

**Milestone 14 — Notifications.** Adaptive reminders. _Acceptance: the user can control all reminders._

**Milestone 15 — Reports and export.** PDF, JSON/CSV export, appointment report.

**Milestone 16 — Privacy and security hardening.** RLS audit, Storage audit, analytics audit, AI-data audit, account deletion testing, export testing, secret scan, dependency audit.

**Milestone 17 — Performance/accessibility.** Launch, navigation, timeline, image handling, Dynamic Type, VoiceOver, reduced motion, chart accessibility.

**Milestone 18 — TestFlight.** Production-like candidate; real-world beta testing. Capture crashes, onboarding drop-off, logging friction, AI errors, pattern misunderstandings, subscription issues.

**Milestone 19 — App Store release.** Release only when the checklist passes.

## 128. DEFINITION OF DONE

GutSignal is NOT production-ready if any of these remain:

fake buttons · hardcoded subscription state · missing restore purchase · no account deletion · missing RLS · public health-data bucket · secrets committed · AI output saved without confirmation · patterns generated directly by an LLM · poor offline behavior · HealthKit crash after denied permission · major accessibility failures · placeholder copy · untested sandbox purchase · broken timezone grouping · unsafe diagnostic wording · missing privacy policy · unresolved high-severity security issue.

## 129. FIRST TASK

Begin with Milestone 0 only. Do not generate the whole application yet.

Perform:

1. inspect repository
2. inspect supplied UI reference
3. inspect installed skills
4. research current stable Expo ecosystem through official skills/docs
5. assess `awesome-ios` for useful reference categories
6. propose final dependencies
7. design final architecture
8. design folder structure
9. design database schema
10. identify risks
11. create development milestones
12. create Windows → iOS workflow

Then produce `docs/PROJECT_PLAN.md`, `docs/DECISIONS.md`, `docs/WINDOWS_IOS_WORKFLOW.md`, and an initial `CLAUDE.md`.

Stop after Milestone 0 and report **Completed** (what was created), **Decisions** (material technical choices), **Risks** (unresolved technical/product risks), **External setup needed from project owner** (only items genuinely requiring the owner's accounts/credentials/actions), and **Recommended next step** (Milestone 1).

Do not begin Milestone 1 until Milestone 0 has been inspected and accepted.
