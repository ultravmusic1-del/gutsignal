# GutSignal — Windows → iOS Development and Release Workflow

**Audience:** the project owner, developing on Windows 11 with no Mac and no Xcode.
**Created:** 2026-08-24 · **Applies to:** Expo SDK 57, `eas-cli` 22.2.0 (version verified on npm 2026-08-24)

> **Before running any `eas` command for the first time, confirm its flags with
> `eas <command> --help`.** EAS CLI evolves; this document describes the workflow, and the CLI
> is the authority on exact syntax. Where a step is version-sensitive it is marked ⚠.

---

## 0. The loop, in one picture

```text
Windows PC ── Claude Code ──► source ──► GitHub
                                          │
                                          ▼
                              EAS (hosted macOS) builds .ipa
                                          │
              ┌───────────────────────────┼────────────────────────┐
              ▼                           ▼                        ▼
     development build            preview build              production build
     (dev client, Metro)      (release, internal)          (TestFlight → App Store)
              │
              ▼
        iPhone loads JS from Metro running on your Windows PC over Wi-Fi
```

Native code is compiled **only** on EAS. Your PC runs the JavaScript bundler, the tests, and
the database tooling. You will never be asked to open Xcode.

---

## 1. One-time prerequisites on Windows

### 1.1 Software

| Tool         | How                                                  | Check                |
| ------------ | ---------------------------------------------------- | -------------------- |
| Node.js LTS  | winget/nvm-windows                                   | `node -v`            |
| Git          | winget                                               | `git --version`      |
| Claude Code  | already installed                                    | —                    |
| EAS CLI      | `npm i -g eas-cli` (or run via `npx eas-cli@latest`) | `eas --version`      |
| Supabase CLI | `npm i -g supabase` (2.115.0)                        | `supabase --version` |
| Watchman     | **not needed** on Windows                            | —                    |

Android Studio is optional and only useful for local Android testing later; it is not required
for the iOS workflow.

### 1.2 Accounts (owner action — Claude cannot do these)

1. **Expo account** — free; `eas login`.
2. **Apple Developer Program** — $99/year. Required before the first iOS build. Enrollment can
   take 24–48h, so start it early.
3. **App Store Connect** — create the app record and the bundle identifier
   (e.g. `com.<owner>.gutsignal`).
4. **Supabase** — create the project; note the project URL and the _publishable_ key.
5. **RevenueCat** — create the project and the iOS app; needed at Milestone 12.

EAS handles certificates and provisioning profiles for you — let it. Do not hand-manage
signing unless something is genuinely broken.

---

## 2. Day-to-day development

```bash
npm install
```

```bash
npx expo start --dev-client
```

Metro runs on your PC (port 8081). The iPhone running the development build connects to it
over Wi-Fi and loads JavaScript live. Edit a file in Claude Code → the app reloads. **No build
is needed for JavaScript changes.**

A build _is_ needed only when native config changes: adding a native module, changing
`app.json`/`app.config.ts` plugins, permissions strings, entitlements, icons, or the SDK.

### 2.1 Making the iPhone reach Metro on Windows

This is the one genuinely Windows-specific friction point.

1. iPhone and PC must be on the **same Wi-Fi network**, and the network profile on Windows
   must be **Private**, not Public.
2. Windows Firewall must allow Node.js inbound on private networks. If the app cannot connect,
   this is almost always why. Allow `node.exe` in
   _Windows Security → Firewall & network protection → Allow an app through firewall_.
3. Corporate/guest Wi-Fi with client isolation will block it entirely. Fallback:

```bash
npx expo start --dev-client --tunnel
```

Tunnel mode routes through Expo's servers — slower, but it works on hostile networks.

4. If the dev client opens but shows no bundle, shake the device (or use the dev menu) and set
   the bundler URL manually to `http://<your-PC-LAN-IP>:8081`.

---

## 3. Registering your iPhone (once per device)

Internal-distribution iOS builds only install on devices listed in the provisioning profile.

```bash
eas device:create
```

Follow the prompts; EAS gives you a link/QR to open **on the iPhone**, which installs a
registration profile and records the device UDID. Do this before the first development build —
otherwise the build succeeds but refuses to install. Repeat for every new test device. ⚠ Flag
names vary by CLI version; confirm with `eas device:create --help`.

---

## 4. Build profiles

`eas.json` (created at Milestone 1) will define three profiles:

| Profile       | Purpose                                  | Distribution | JS source                     |
| ------------- | ---------------------------------------- | ------------ | ----------------------------- |
| `development` | Daily work                               | internal     | Metro on your PC (dev client) |
| `preview`     | Realistic testing, sharing with a tester | internal     | bundled (release mode)        |
| `production`  | Store builds                             | store        | bundled, optimized            |

Use `preview` before every TestFlight round: release-mode builds catch problems that never
appear in the dev client (minification, missing assets, release-only native config).

---

## 5. Creating builds

First-time setup in the repo:

```bash
eas init
```

```bash
eas build:configure
```

Development build (the one you install on your iPhone and keep for weeks):

```bash
eas build --platform ios --profile development
```

Preview build:

```bash
eas build --platform ios --profile preview
```

Production build:

```bash
eas build --platform ios --profile production
```

Each command prints a build URL. When it finishes, open that URL **on the iPhone** and install
via the QR code / install link. The device must already be registered (§3).

> `eas build:run` installs a build into a **simulator** and therefore requires macOS. On
> Windows, always install to a physical device from the build page.

Builds queue on shared infrastructure — expect minutes, not seconds. Batch native-config
changes rather than iterating one plugin at a time.

---

## 6. Environment variables and secrets

- Client-visible values only: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SENTRY_DSN`.
- **Never** prefix a secret with `EXPO_PUBLIC_` — anything so prefixed is embedded in the app
  binary and is readable by anyone who downloads it.
- Server secrets (`AI_PROVIDER_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, Supabase service role)
  live **only** in Supabase Edge Function secrets — never in `app.config.ts`, never in EAS
  client env vars, never in the repo.
- Build-time environment values are managed with the EAS environment-variable commands ⚠
  (`eas env --help` — this area changed across CLI versions; check before use).
- `.env` is git-ignored. `.env.example` documents the _names_ only, never values.

---

## 7. TestFlight and the App Store

```bash
eas submit --platform ios
```

Submits the latest production build to App Store Connect. On first run it will ask for your
Apple credentials and app identifiers, and can create an App Store Connect API key for
repeatable submissions.

Then, in App Store Connect (owner action, browser only — no Mac needed):

1. Wait for processing (usually minutes).
2. Complete **Export Compliance** answers.
3. Add internal testers → they install via the TestFlight app.
4. For external testers, submit for Beta App Review.
5. For release: complete App Privacy answers, screenshots, description, review notes,
   age rating, and the subscription metadata, then submit for review.

Screenshots can be captured on the physical iPhone and cropped on Windows — no simulator
needed.

---

## 8. Testing subscriptions without a Mac

Sandbox purchases require a real build (dev client, preview or TestFlight) — they never work in
Expo Go.

1. In App Store Connect, create a **Sandbox tester** account (use a fresh email alias).
2. On the iPhone: _Settings → App Store → Sandbox Account_ → sign in with the sandbox tester.
   Do **not** sign your real Apple ID out of the device.
3. Create the subscription products (`gutsignal_monthly`, `gutsignal_annual`) in App Store
   Connect, then map them to the `premium` entitlement in RevenueCat.
4. Install a development or TestFlight build and run through: purchase monthly, purchase
   annual, **restore purchases**, cancel, expiry, and offline behaviour.
5. Sandbox subscription periods are heavily accelerated, which makes renewal and expiry
   testable in one sitting.

Restore Purchases must be reachable at all times — it is an App Store review requirement and a
release blocker in `CLAUDE.md` §58.

---

## 9. Diagnosing native build failures without Xcode

In rough order of usefulness:

1. **Read the EAS build logs.** The build page shows each phase (Install dependencies, Prebuild,
   Install pods, Xcode build). The failing phase usually names the offending module.

```bash
eas build:list --platform ios --limit 10
```

```bash
eas build:view <build-id>
```

2. **Check the project locally first** — this catches most failures before you spend a build:

```bash
npx expo-doctor
```

```bash
npx expo install --check
```

`--check` reports dependencies whose versions don't match SDK 57 and offers to fix them. Most
"mysterious" native failures are a version mismatch.

3. **Inspect the generated native config on Windows.** You cannot compile iOS locally, but you
   _can_ generate the native project to read what a config plugin actually produced:

```bash
npx expo prebuild --platform ios --no-install --clean
```

Open `ios/GutSignal/Info.plist` and the `.entitlements` file to verify permission strings,
HealthKit entitlements, and associated domains. Then **delete the `ios/` directory** —
GutSignal stays on Continuous Native Generation and `ios/` must never be committed.

4. **Bisect plugins.** If a build breaks after adding native modules, remove them from
   `app.config.ts` one at a time and rebuild. This is why batching is worth it.

5. **Check the module's Expo compatibility** before blaming EAS: an SDK 57 project needs
   SDK-57-compatible native modules.

---

## 10. Physical-device QA checklist (start at Milestone 1)

Because there is no simulator, these are only ever testable on the iPhone. Run them each
milestone, not at release:

camera capture and upload · microphone/voice · Sign in with Apple · HealthKit permission
grant **and denial** · RevenueCat purchase/restore · notifications (permission, delivery,
quiet hours) · SecureStore persistence across relaunch · airplane-mode logging and later sync ·
backgrounding mid-log · deep links · VoiceOver · Dynamic Type at the largest sizes ·
Reduced Motion.

---

## 11. Common Windows-specific gotchas

| Symptom                               | Cause                                                           | Fix                                                                   |
| ------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Dev client can't reach Metro          | Windows Firewall blocking `node.exe`, or Public network profile | Allow Node on private networks; set network to Private; or `--tunnel` |
| Build installs but immediately closes | Device not registered in the provisioning profile               | `eas device:create`, then rebuild                                     |
| `eas build:run` fails                 | Simulator builds require macOS                                  | Install to the physical device from the build page                    |
| Path/line-ending noise in git         | CRLF vs LF                                                      | `.gitattributes` normalizing to LF (added at Milestone 1)             |
| Long-path errors on install           | Windows MAX_PATH                                                | Enable long paths, or keep the repo near the drive root               |
| A shell script in docs fails          | PowerShell ≠ bash                                               | Use the Bash shell (Git Bash) for POSIX snippets                      |

---

## 12. What genuinely requires the owner

Claude Code handles code, migrations, tests, docs and configuration. These need a human with
account access:

- Apple Developer Program enrollment and App Store Connect app creation
- Approving/creating Apple signing credentials when EAS prompts
- Creating Supabase and RevenueCat projects and supplying the public keys
- Storing server secrets in Supabase (Claude will never ask for the secret values themselves)
- Creating subscription products and sandbox testers
- Installing builds on the physical iPhone and running device QA
- Submitting to TestFlight/App Store and answering App Privacy questions

Everything else proceeds without you.
