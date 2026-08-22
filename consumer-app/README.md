# Listening Room consumer app

A dependency-free, local-first Progressive Web App. Audio sessions work on Android and iPhone; the optional BLE goggles integration is Android-first because Safari does not provide Web Bluetooth. The app creates sample-accurate isochronic timelines, imports data-only JSON session profiles, repeats the same before/after question, stores notes and delivered outputs, and draws real progress charts.

No account, cloud server, analytics, or app store is required. Data stays in browser storage until the user exports or restores a JSON backup.

## Run it

From `C:\entrainment`:

```powershell
python -m http.server 4173
```

Open `http://localhost:4173/consumer-app/`. Do not open `index.html` directly: offline installation, profile loading, and wake lock require a web origin.

To try audio from a phone on the same Wi-Fi, open `http://YOUR-PC-IP:4173/consumer-app/`. Installation, wake lock, and Web Bluetooth require HTTPS or localhost. Test goggles from Chrome on Android using an HTTPS deployment.

## Checks

```powershell
node .\consumer-app\core.test.js
node .\consumer-app\goggles.test.js
cmd /c "set ELECTRON_RUN_AS_NODE=&& .\desktop\node_modules\.bin\electron.cmd .\consumer-app\e2e.test.js --no-sandbox"
```

The end-to-end check creates a goal, validates the optional-goggles preparation flow, imports a custom profile, builds the real AudioWorklet timeline, saves before/after ratings and delivered outputs, draws progress, renders history, and reloads the app offline.

## Profile files
`profile.example.json` is a legacy version-1 audio profile and exercises automatic migration. `profile.visual.example.json` documents the canonical version-2 audio-plus-visual format and is deliberately an off-face development check, not a wellness protocol. Built-ins remain audio-only unless their visual parameters are actually known.

Version 2 has optional `audio` and `visual` objects plus `requiredOutputs`. A described output not listed as required can be omitted before a session; a required missing output blocks Start. An active output may never disappear mid-session: audio interruption or goggles failure stops the complete session. Each output has independent left/right delays, initial phase, segments, ramps, duty, and level. Visual intensity is further restricted by the connected device's immutable firmware limit.

Profiles are strict JSON: URLs, scripts, unknown fields, unsafe frequency ranges, excessive level, and sessions over three hours are rejected. Existing version-1 files migrate to required audio only; visual values are never invented.

## Mobile audio boundary

The app requests a screen wake lock. Audio-only sessions pause with the audio clock. Visual sessions use a shared future epoch and stop completely if audio suspends, BLE fails, the page is hidden, or the firmware heartbeat expires. Keep the session screen visible. BLE setup delay does not set onset timing; the app synchronizes clocks, uploads and verifies the full visual plan, arms a future device timestamp, schedules Web Audio against the same epoch, then commits both.

## Hidden hardware lab

Tap the "Private" pill on the Sessions screen five times to reveal a flash phase calibration tool. It runs a 5 Hz test pattern on connected goggles, watches the LEDs through the rear camera, and measures how late the flashes arrive relative to the session clock. The measured offset is stored locally and applied when arming: the device starts that many milliseconds early, and running drift corrections account for the shift so the two systems never fight. A manual 0-250 ms override is included. This exists for hardware bring-up; most devices measure single-digit milliseconds and need nothing.
