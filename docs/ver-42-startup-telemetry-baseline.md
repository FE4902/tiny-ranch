# VER-42 Startup Telemetry Baseline

## Scope

Define a minimal startup telemetry baseline for mobile-web cohorts and set one reporting surface for weekly review.

## Startup Events

The game emits telemetry via `window` events (`tiny-ranch:telemetry`) and mirrored console lines (`[tiny-ranch] ...`).

| Event | Trigger | Key fields |
| --- | --- | --- |
| `boot_completed` | Boot scene initialized | `cohort`, `width`, `height`, `touch` |
| `startup_first_playable` | First playable scene becomes active | `scene`, `bootToFirstPlayableMs`, `cohort`, `viewportWidth`, `viewportHeight` |
| `scene_first_frame` | First `requestAnimationFrame` after scene create | `scene`, `durationMs` |

## Sink Wiring

Telemetry transport is selected via env configuration. Gameplay call sites remain `services.telemetry.track(...)`.

- `VITE_TELEMETRY_SINK=console` (default): local debug transport (`window` event + console mirror).
- `VITE_TELEMETRY_SINK=posthog`: PostHog batch transport.
- `VITE_TELEMETRY_SINK=none`: disable delivery.

PostHog transport env vars:

- `VITE_POSTHOG_API_KEY` (required when sink is `posthog`)
- `VITE_POSTHOG_API_HOST` (optional, default `https://us.i.posthog.com`)
- `VITE_POSTHOG_BATCH_SIZE` (optional, default `20`)
- `VITE_POSTHOG_FLUSH_INTERVAL_MS` (optional, default `5000`)
- `VITE_POSTHOG_MAX_QUEUE_SIZE` (optional, default `200`)

Lifecycle flush behavior:

- Batches flush on interval/size thresholds during play.
- Final delivery attempts happen on `visibilitychange` and `pagehide` using `sendBeacon` first, then `fetch(..., { keepalive: true })` fallback.

Transport guardrails:

- payload key allowlist is enforced before enqueue
- direct PII-style keys are dropped at transport boundary
- `doNotTrack` short-circuits network delivery

## Cohort Rule

- `mobile_web` when touch is enabled or viewport width is <= `768`
- `desktop_web` otherwise

## Staging Validation

1. Open the staging build in a mobile emulator or physical device.
2. In DevTools console, run:

```js
window.addEventListener('tiny-ranch:telemetry', (event) => console.log(event.detail))
```

3. Reload once and confirm you see:
   - `boot_completed`
   - `startup_first_playable`
   - `scene_first_frame`

## Weekly Reporting Surface

- Canonical review location: this document (`docs/ver-42-startup-telemetry-baseline.md`).
- Weekly ritual: append the latest `startup_first_playable.bootToFirstPlayableMs` observations (mobile_web only) to the issue update on [VER-34](/VER/issues/VER-34), linking back to this document as the metric definition.

## Rollback Steps

1. Switch sink back to console:

```bash
VITE_TELEMETRY_SINK=console npm run build
```

2. Remove PostHog env vars from deployment secrets (`VITE_POSTHOG_API_KEY`, optional host/batch overrides).
3. Redeploy and verify `tiny-ranch:telemetry` window events in browser devtools (debug path remains unchanged).
