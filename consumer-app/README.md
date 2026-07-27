# Listening Room consumer app

A dependency-free, local-first Progressive Web App for Android and iPhone. It creates isochronic tones, imports data-only JSON session profiles, repeats the same before/after question, stores notes and session history, and draws real progress charts.

No account, cloud server, analytics, or app store is required. Data stays in browser storage until the user exports or restores a JSON backup.

## Run it

From `C:\entrainment`:

```powershell
python -m http.server 4173
```

Open `http://localhost:4173/consumer-app/`. Do not open `index.html` directly: offline installation, profile loading, and wake lock require a web origin.

To try it from a phone on the same Wi-Fi, open `http://YOUR-PC-IP:4173/consumer-app/`. Audio works over the local network, but installation, offline caching, and wake lock require HTTPS or localhost. A production deployment should therefore use HTTPS.

## Checks

```powershell
node .\consumer-app\core.test.js
node .\desktop\tests\isochronic.test.js
cmd /c "set ELECTRON_RUN_AS_NODE=&& .\desktop\node_modules\.bin\electron.cmd .\consumer-app\e2e.test.js --no-sandbox"
```

The end-to-end check creates a goal, imports a silent custom profile, builds the real Web Audio graph, saves before/after ratings and notes, draws progress, renders history, and reloads the app offline.

## Profile files

`profile.example.json` documents the version-1 format. Built-ins are ordinary profile files listed in `protocols/index.json`; the app validates and stores any missing ones at startup. It provides independent `left` and `right` timelines with separate delays and segment schedules. Each segment can ramp its carrier frequency, pulse frequency, duty cycle, and relative volume. `phaseDeg: 180` offsets one ear by half a pulse cycle for alternating stimulation. `pulseHz: 0` produces a continuous carrier, so different left/right carriers can form a binaural pair.

Profiles are strict JSON: URLs, scripts, unknown fields, unsafe frequency ranges, excessive volume, and sessions over three hours are rejected. Study-derived profiles identify any unsupported visual component or unspecified audio setting in their description rather than presenting an approximation as an exact reproduction.

## Mobile audio boundary

The app requests a screen wake lock and uses the audio clock so interruptions do not falsely advance a session. Keep the session screen open while the phone lies down. iPhone Web Audio may still pause after screen lock or app switching; a native wrapper is only necessary if reliable locked-screen playback becomes mandatory.
