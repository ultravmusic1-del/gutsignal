# GutSignal — UI development workflow

How to look at the UI without a phone in your hand, and where that stops being trustworthy.

GutSignal is an iOS app. Everything here exists so that layout, spacing, typography and component
states can be iterated on quickly in a browser — **not** so the app can run on the web.

---

## 1. The three surfaces

| Surface       | Command                     | Port | What it is for                                         |
| ------------- | --------------------------- | ---- | ------------------------------------------------------ |
| Native dev    | `npm start` / `npm run ios` | 8081 | The real app. The only place native behaviour is real. |
| Expo Web      | `npm run web`               | 8082 | Whole screens, in navigation context, with real data.  |
| Storybook Web | `npm run storybook:web`     | 6006 | One component, its states and variants, in isolation.  |
| `/dev/ui`     | (a route on Expo Web)       | 8082 | Every primitive on one screen, to catch drift.         |

Web runs on **8082 rather than 8081 on purpose**, so it can run at the same time as the dev server
a phone is connected to. Neither disturbs the other.

### Starting normal Expo development

```bash
npm start
```

Development build on a device. `npm run start:go` for Expo Go, `npm run ios` to open a simulator.
Unchanged by any of this.

### Starting Expo Web

```bash
npm run web
```

Then open <http://localhost:8082>. Routes work as URLs — `/today`, `/timeline`, `/dev/ui`.

### Starting Storybook

```bash
npm run storybook:open
```

Opens a browser at <http://localhost:6006>. `npm run storybook:web` is the same without opening a
browser, which is what an agent wants. `npm run storybook:build` produces a static bundle in
`storybook-static/`.

There is **no on-device Storybook**. `@storybook/react-native` requires replacing the app's entry
point, and GutSignal's entry is `expo-router/entry`, which owns routing — trading the production
router for a story browser is not a good deal. The web framework renders the same components
through `react-native-web` and leaves the app alone.

---

## 2. How Claude inspects the UI

The agent drives a real Chromium instance: navigate, resize the viewport, screenshot, read the
console, read the accessibility tree, click and type.

A normal loop:

1. `npm run web` (or `storybook:web`)
2. Navigate to the screen or story
3. Resize to 393 × 852
4. Screenshot, and **read the console**
5. Critique, edit, refresh, look again
6. Repeat until it is actually good

For a single component, address the story's iframe directly so the canvas fills the viewport
instead of sitting inside Storybook's chrome:

```text
http://localhost:6006/iframe.html?id=insights-findingcard--with-limitations&viewMode=story
```

Append `&globals=scheme:dark` to switch colour scheme without touching the toolbar.

### Viewports

| Size       | What it is           | Status                                        |
| ---------- | -------------------- | --------------------------------------------- |
| 393 × 852  | iPhone 15 / 16       | **The default.** Check everything here.       |
| 430 × 932  | iPhone 15/16 Pro Max | Check anything responsive.                    |
| 820 × 1180 | iPad                 | Informational only — `supportsTablet: false`. |

At 820 the layout stretches to full width and line lengths get long. That is not a bug to fix; iPad
is not a target. If it ever becomes one, this is where the work would start.

### Rules

The binding ones live in `CLAUDE.md` §62. The short version: **never say a UI looks good without
having looked at it**, and check the console every time — a React warning about an unrecognised
prop will not appear in a screenshot.

---

## 3. Expo Web vs Storybook vs a real iPhone

- **Expo Web** is the rapid design-iteration surface. Whole screens, real navigation, real local
  database, real query layer.
- **Storybook** is the isolated component surface. Every state of one component side by side,
  including the ones that are hard to reach in the running app — an error, a three-limitation
  finding, a label long enough to wrap.
- **A physical iPhone is the final verification surface** for anything native. Nothing on this page
  changes that.

---

## 4. Known incompatibilities

Found by running the app on web, not predicted.

### Fixed with a web fallback

| What                | What happens on web                                                                                                                          | How it is handled                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo-secure-store` | No web implementation. Every call throws `getValueWithKeyAsync is not a function`, taking down the auth provider and every screen behind it. | `src/services/supabase/secureStore.web.ts` backs the same seam with `localStorage`. **Not secure storage** — acceptable only because web is never shipped. |
| `expo-sqlite`       | Works, via wa-sqlite compiled to WebAssembly in a worker — but Metro does not resolve `.wasm`, and OPFS needs cross-origin isolation.        | `metro.config.js` adds `wasm` to `assetExts` and sets COOP/COEP headers on the dev server. Dev-server only; iOS is untouched.                              |

### Live constraints

- **One tab at a time.** wa-sqlite's OPFS backend allows a single writer, so a second tab with the
  app open fails with `NoModificationAllowedError: Access Handles cannot be created…`. Close the
  other tab. This is a web storage constraint, not an app bug.
- **`expo-notifications`** warns that push token listening is unsupported. Local scheduling is not
  exercised on web at all — reminders are verified on a device.
- **Console noise from `react-native-web`.** `"shadow*" style props are deprecated` and
  `props.pointerEvents is deprecated`, both from library internals and both cosmetic on web.

  The `accessibilityElementsHidden` warning that used to be listed here was **ours**: `Divider`,
  `Icon` and `StatusPill` passed the iOS/Android prop pair straight through to the DOM. They now
  use `aria-hidden`, which React Native maps to both on native. The console is clean, which is the
  point — noise you have learned to ignore is noise that hides the next real warning.

### Cannot be judged on web at all

Native sheets and detents · haptics · Sign in with Apple · Keychain · notification delivery ·
HealthKit · the share sheet and printing · Reanimated gesture edge cases · real scroll and list
performance · anything about launch time.

### Not incompatibilities, but worth knowing

- **Signed out, the data screens show their empty state rather than their content.** Their queries
  are `enabled: Boolean(userId)`, so opening a URL directly gets you the layout without the data —
  useful for spacing and typography, and not a state a real user reaches.

  They used to show a spinner forever instead, because they gated on `isPending`, which is true for
  a query that is disabled and never going to run. `isLoading` is the one that means "fetching".
  Fixed — and found by this surface within an hour of it existing.

- **The stack header renders light on a dark screen.** A react-navigation web default; the native
  header follows the system appearance.
- **An "off" `ToggleRow` switch renders as a bare circle with no track.** `ToggleRow` sets
  `trackColor={{ true: … }}` only, and `react-native-web` supplies no default for the false track,
  so on a dark surface there is nothing behind the thumb. iOS draws its own grey track, so this is
  very likely web-only — but it has **not** been confirmed on a device, and if it turns out to be
  real it is a §36 problem rather than a cosmetic one. Check it on the next device pass.

---

## 5. Storybook conventions

Stories are **colocated**, next to the component they describe, matching how `__tests__` already
sit beside the code: `src/components/ui/Button.stories.tsx`.

`.storybook/preview.tsx` wraps every story in the app's real `ThemeProvider` and real safe-area
metrics, and defines no colours, radii or spacing of its own. A story that renders on an invented
canvas agrees with itself and disagrees with the app.

Current coverage — the reusable primitives and the one component where the wording carries real
risk:

| Story                      | Why it exists                                                     |
| -------------------------- | ----------------------------------------------------------------- |
| `Design system/Typography` | The whole ramp at once — the only way to see two variants drift.  |
| `UI/Metric`                | A number set as the point of its card. `Grid` is the one to open. |
| `UI/SectionHeader`         | `AsAPage` — a heading is judged by what it separates.             |
| `UI/StatusPill`            | Every tone together, to check none of them shouts.                |
| `UI/Button`                | Five variants, loading, disabled, a label that cannot fit.        |
| `UI/Card`                  | Three elevations together, where a wrong choice shows.            |
| `UI/Chip`                  | Filter row and symptom multi-select, at real wrapping widths.     |
| `UI/EmptyState`            | The state a new user sees for weeks, with the real §32 copy.      |
| `UI/TextField`             | Error as text rather than a red border (§36).                     |
| `UI/SelectCard`            | Onboarding options with descriptions of uneven length.            |
| `UI/ToggleRow`             | Including "on, and will never fire" — the §75 warning state.      |
| `Insights/FindingCard`     | Every status, three limitations, long factors, and as a list.     |
| `Reports/WeeklySummary`    | The screen that needs a session and a full database to see.       |

---

## 6. A note on the design tokens

`src/theme/` holds colours, typography, spacing, radius, shadows and motion, and the gallery and
Storybook both read from it rather than restating values. That was already true before this
tooling existed; nothing here changed a token.

One observation from looking at the gallery on a dark background: `flat`, `card` and `raised` are
nearly indistinguishable, because shadows do almost nothing on a dark surface. That is a design
question rather than a bug, and it is recorded here rather than acted on — this was infrastructure
work, and redesigning during it is how infrastructure work goes wrong.
