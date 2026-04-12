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

## Schema Governance

Schema registry lives in `src/game/systems/telemetry.ts` as `TELEMETRY_EVENT_SCHEMA`.

- Only events defined in `TELEMETRY_EVENT_SCHEMA` are accepted for delivery.
- Each event has an explicit payload-key allowlist.
- Unknown keys are dropped before sink delivery.
- Unknown events are dropped before sink delivery.
- In development builds, dropped event/key violations log one warning per unique violation signature.

Schema change policy:

- Additive-first changes only for active analytics events.
- If a breaking event shape change is needed, run dual-write migration first and explicitly review with governance owner.

## Retention Contract Gate (VER-90)

Retention objective/streak lifecycle events now ship with fixture-driven contract checks.

Contract fixture:

- `tests/fixtures/analytics/retention-contract.fixture.json`

Validation command:

```bash
npm run test:telemetry:retention
```

Cohort export utility command:

```bash
npm run analytics:retention:cohort -- --input tests/fixtures/analytics/retention-cohort-events.sample.json --format table
```

Deterministic fixture test for export utility:

```bash
npm run test:analytics:retention-cohort
```

CI expectation:

- `.github/workflows/bundle-budget-gate.yml` runs `npm run test:analytics:retention` on every PR and `main` push.
- Retention contract/event-shape regressions must fail before smoke/performance rollout checks continue.

## Privacy Constraints

Telemetry is anonymous-by-default:

- `distinct_id` is generated from local anonymous install state (`tiny-ranch:telemetry:distinct-id`).
- No direct PII fields are allowed through transport validation.
- Browser `doNotTrack` disables PostHog network emission.

Explicit disallowed payload fields (case-insensitive):

- `address`
- `birthdate`
- `city`
- `country`
- `dob`
- `email`
- `first_name`
- `firstname`
- `full_name`
- `fullname`
- `ip`
- `ip_address`
- `last_name`
- `lastname`
- `name`
- `password`
- `phone`
- `postal_code`
- `postcode`
- `social_security_number`
- `ssn`
- `state`
- `street`
- `tax_id`
- `user_email`
- `username`

## Cohort Rule

- `mobile_web` when touch is enabled or viewport width is <= `768`
- `desktop_web` otherwise

## Owner Model

- Delivery owner: [Web Game Engineer](/VER/agents/web-game-engineer)
  - maintains transport adapters, schema coverage for emitted events, and rollout execution
- Governance owner: [CTO](/VER/agents/cto)
  - approves schema changes, privacy constraints, and rollout/rollback gates

Weekly responsibilities:

- Delivery owner verifies event emission health in staging and reports regressions.
- Governance owner reviews startup KPI trend deltas and approves any schema modifications.

## Retention and Deletion Runbook

Retention targets:

- Raw event horizon: 180 days
- Aggregate KPI horizon: 24 months

Operational process:

1. Weekly: verify retention settings in PostHog project configuration still match targets.
2. Monthly: audit event volume for deprecated keys/events and queue cleanup work if needed.
3. Deletion request handling:
   - identify anonymous install id (`distinct_id`) from support/debug context
   - delete matching user/event stream in PostHog
   - record request date, requestor, and completion timestamp in ops notes
4. After major schema rollout, confirm no stale dual-write fields remain past migration window.

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

## Rollout Checklist

1. Validate `npm run build` passes with current telemetry schema changes.
2. Run `npm run test:analytics:retention` and confirm retention contract/export checks pass.
3. Verify local console sink still emits startup baseline events with no gameplay regressions.
4. Deploy to staging with `VITE_TELEMETRY_SINK=posthog`.
5. Confirm PostHog receives startup baseline events and no unknown-key warnings appear for expected payloads.
6. Confirm `doNotTrack` behavior by setting browser DNT and verifying no PostHog network sends.
7. Confirm fallback path by backgrounding/closing tab and verifying final batch attempts via `sendBeacon`/`keepalive`.
8. Announce rollout in the active implementation issue and link this document for metric definitions.

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
