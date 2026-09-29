# Ringaway — handoff

What was actually run, and what is still unknown. **Unverified is `UNKNOWN`,
never a pass** — a green build is not a verification.

Last updated: 2026-09-15

## Verification state

| Gate | State | Evidence |
|---|---|---|
| Lint | ✅ | `npm run verify` 2026-09-15 |
| Typecheck | ✅ | `npm run verify` 2026-09-15 |
| Unit tests | ✅ | `npm run verify` 2026-09-15 |
| i18n completeness (14 locales) | ✅ | `npm run check:i18n`, 14 locales complete |
| UI rules (colour tokens, `t()`) | ✅ | `npm run check:ui` |
| iOS + Android bundle export | ✅ | `expo export` both platforms, 2026-09-15 |
| CI green on a self-hosted runner | ✅ | success — run 34977775492, 2026-09-15 |
| `check:release` with real identifiers | ✅ | passed in CI with the real identifiers (same run) |
| Builds, installs, launches on the iOS simulator | ⬜ | not run here; device passes belong to dev-7b |
| Renders in light **and** dark on device | ⬜ | not run here |
| Every feature driven on the Android emulator | ⬜ | not run here |
| Purchase flow exercised against a real offering | ⬜ | needs a build on hardware |
| Ads served under real consent | ⬜ | needs a build on hardware |

`check:release` fails in a normal shell on purpose: the identifiers are GitHub
Actions secrets, never files in the repo. A local failure means "this shell has
no secrets", not "the app is misconfigured". CI is where that gate means
something, because CI is where the values are.

## Store and service state

| | State | Id |
|---|---|---|
| Bundle id registered | ✅ | `com.altixcode.ringaway` |
| App Store Connect record | ✅ | `6812380813` — store name "Ringaway" |
| App Store category | ✅ | UTILITIES / ENTERTAINMENT |
| Reviewer contact and notes | ✅ | set 2026-09-15, notes written for this app |
| App Store availability (territories) | ✅ | all 175 territories |
| iOS IAP created and priced | ✅ | remove-ads non-consumable, $3.99, localised |
| Play Console app | ⛔ | blocked: account quota, `429 RESOURCE_EXHAUSTED` at 15 apps; support request filed |
| AdMob app — iOS | ✅ | `ca-app-pub-2504845459806550~6966099647` |
| AdMob app — Android | ✅ | `ca-app-pub-2504845459806550~6393972743` |
| AdMob ad units (6) | ✅ | iOS banner/interstitial/rewarded `9466113786` / `8153032112` / `6255653207`; Android `1362419176` / `2094056071` / `6839950442` |
| AdMob ids wired into CI | ✅ | all ten secrets present on the repo |
| AdMob GDPR + US-states messages published | ✅ | published account-wide, covers every app |
| App Store content rights declaration | ✅ | DOES_NOT_USE_THIRD_PARTY_CONTENT |
| App Store listing copy | ✅ | description, keywords and promotional text, written for this app |
| App Store screenshots | ❌ | **none** — needs the app running on hardware |
| RevenueCat project, apps, entitlement, offering | ✅ | project `projbebed405`, entitlement `entlad499e51ff`, offering `ofrngc33cd71062` |
| RevenueCat In-App Purchase Key | ❌ | missing account-wide — see below |

## Decisions the owner owns

- Publish on altixcode.com and itsata.com? **Not yet asked.**

## 2026-09-29 — TestFlight feedback round: no ring, no wake-from-lock, frozen call screen

Four reports converged on one shape: the call screen only ever appeared while the app was
already open in the foreground — nothing rang or woke the screen from locked/backgrounded,
and when a call *did* land mid-unlock the screen dimmed/flashed with dead buttons. Root
causes found by reading the actual code (not guessed):

1. **The whole "call" flow was pure foreground JS.** No `expo-notifications`, no background
   task, `UIBackgroundModes: []`. A countdown elapsing while the phone was locked or the app
   backgrounded did nothing until the user manually reopened the app — which is what the
   dimming/flashing/unresponsive-buttons reports actually were: the app's own vibration and
   call UI landing mid-fight with the OS's own lock/unlock chrome, not a JS freeze.
2. **A separate, real bug in React Native's own `Vibration` module.** On iOS,
   `Vibration.vibrate(pattern, true)` drives playback through JS-module-level singleton state
   (`_vibrating` / `_id` in RN's `Vibration.js`, shared by the whole app). A second call
   before a prior one's `cancel()` has landed is silently dropped, leaving the stale loop
   running with nothing able to stop it — a stuck, sometimes-wrong-sounding, uncancellable
   vibration. Confirmed by reading `node_modules/react-native/Libraries/Vibration/Vibration.js`
   directly, not assumed.

### What changed

- `src/logic/vibrationLoop.ts` (new, tested): turns a pattern into explicit on/off phases.
  `app/call.tsx` uses it on iOS to drive single-shot `Vibration.vibrate()` calls off a timer
  the screen owns and can always clear — Android is untouched, since its native
  `vibrateByPattern` has no such bug.
- `src/logic/callNotificationContent.ts` (new, tested) + `src/notifications/
  callNotifications.ts` (new, untested native adapter, same pattern as `src/monetization/
  ads.ts`): schedules a real local notification at ring time, using the device's own
  ringtone sound (`defaultRingtone` on iOS; a ringtone-audio-attributes Android channel), so
  a call genuinely makes sound even while the app is backgrounded, and taps through to
  `/call`. Wired into `app/index.tsx` (schedule on start, cancel on cancel) and
  `app/_layout.tsx` (notification handler + response listener).
- `silentNote` (all 14 locales) no longer claims "no audio" — it now says the call is not a
  real one, which is still true, without claiming there is no ring.

### Verified vs. not

| | State |
|---|---|
| `vibrationPhases` pure logic, `callNotificationPlan` pure logic | ✅ unit tests |
| iOS single-shot vibration loop starts/stops correctly under fake timers | ✅ `app/__tests__/call.test.tsx` |
| tsc, lint, full jest suite (330 tests), coverage thresholds | ✅ all pass |
| i18n completeness, UI rules, paywall-copy, ad-wiring checks | ✅ all pass |
| `expo export` (iOS + Android bundle) with `expo-notifications` in the plugin graph | ✅ resolves and exports cleanly |
| **A real device actually rings, wakes, and shows the call screen from locked/backgrounded** | ⬜ **UNKNOWN** — needs a hardware pass |
| iOS `interruptionLevel: 'timeSensitive'` actually breaking through Focus/silencing | ⬜ **UNKNOWN** — needs the `com.apple.developer.usernotifications.time-sensitive` entitlement provisioned, which was deliberately *not* added here (see below) |
| Android heads-up notification actually lighting the screen on real OEM skins | ⬜ **UNKNOWN** |

### What is deliberately *not* implemented, and why

A true lock-screen call UI — full-screen, answerable without unlocking — needs either
Android's full-screen-intent notification category (a custom native `Notification.Builder`
call; `expo-notifications` does not expose this) or, on iOS, CallKit backed by a VoIP push
server. Both are real, multi-day native features that cannot be built and left unverified
here without real risk of a broken native build that this environment cannot compile or run
on a device to catch. What *is* implemented — a real scheduled notification with a genuine
ringtone sound and a tap-through to the call screen — is a substantial, honest improvement
over "nothing happens at all," but it is not equivalent to a real incoming-call experience on
a locked device. The iOS `timeSensitive` interruption level was also left without its
entitlement added to `ios.entitlements`/the provisioning profile, deliberately: adding an
entitlement not yet enabled on the Apple Developer portal risks failing code signing on the
next EAS build, which this environment cannot test.

## Known UNKNOWNs

- **Nothing on this app has run on real hardware.** Launch, the core flow, the
  purchase and the ads are unverified, and the rows above say so.
- **RevenueCat has no In-App Purchase Key**, account-wide across all 44 apps.
  Without it StoreKit 2 validation is degraded, which shows up as a purchase
  that succeeds on device and never grants the entitlement — the user pays and
  the ads stay. Being handled by dev-3a.
- **The iOS record now needs only two things: a build, and screenshots.**
  Both require the app running on real hardware, which is also what keeps
  the IAP at MISSING_METADATA — its review screenshot must show the real
  paywall. Everything else on the App Store side is done.
