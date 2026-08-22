# ESP32 visual scheduler

This is the GPIO2 development build of the production-oriented BLE protocol. It computes two independent logical eye timelines but mirrors either active eye onto the built-in LED. Keep the board off your face. Set `BUILTIN_LED_TEST` to `false` only after GPIO18/19 output hardware is wired and reviewed.

## Build, flash, and inspect

```powershell
& "C:\Program Files\Arduino CLI\arduino-cli.exe" compile --fqbn esp32:esp32:esp32:UploadSpeed=921600 .\firmware\esp32-ble-led
& "C:\Program Files\Arduino CLI\arduino-cli.exe" upload -p COM3 --fqbn esp32:esp32:esp32:UploadSpeed=921600 .\firmware\esp32-ble-led
& "C:\Program Files\Arduino CLI\arduino-cli.exe" monitor -p COM3 -c baudrate=115200
```

Consumer pairing uses LE Secure Connections "Just Works": the link is encrypted and bonded, and phones pair straight from the Chrome device picker with no code. Set `DEV_PASSKEY_PAIRING` to `1` in the sketch to restore per-unit six-digit passkey entry for dev boards. Hold BOOT while pressing reset to remove bonded phones.

## Safety behavior

- Both outputs are dark on boot, disconnect, reset, malformed active-session traffic, queue overflow, missed scheduler deadline, late/uncommitted start, heartbeat timeout, completion, and firmware fault.
- No schedule or arm survives reset/disconnect. Reconnection never resumes light.
- The diagnostic flash is capped at 1.5 seconds, 5 Hz, and 10% logical intensity.
- Sessions use a verified preloaded schedule, future monotonic start, explicit commit, and a 3–5 second heartbeat watchdog.
- Control and event characteristics require a bonded encrypted connection (LE Secure Connections). Just Works trades MITM protection for consumer-friendly pairing — acceptable because the protocol carries only light schedules, never personal data; the fail-dark watchdogs bound the worst-case hijack impact.
- While disconnected, the board runs at 80 MHz and advertises every 100–200 ms for one minute, then every 750–1000 ms. It returns to 240 MHz immediately after connection—before clock synchronization—and enables the 2 kHz scheduler only for a test or armed/running session, so active waveform quality is unchanged.

GPIO2 validates framing, state transitions, heartbeat, and single-output timing only. Release hardware still needs fail-dark drivers/pulldowns, characterized optical limits, bilateral photodiode/logic-analyzer measurements, audio-to-light latency and drift measurements, brownout/reset testing, and representative Android phone testing.
