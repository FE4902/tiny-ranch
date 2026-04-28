# VER-114 Barn Loop Instrumentation + Smoke Baseline

This document defines the Barn telemetry and regression baseline introduced for [VER-114](/VER/issues/VER-114). Later Barn tasks should treat these contracts as the minimum safe coverage layer.

## Canonical Barn lifecycle telemetry

Barn loop instrumentation now emits one canonical event per lifecycle transition:

- `barn_job_aborted`
  - emitted when a Barn queue attempt fails before a job is created
  - current failure reasons: `insufficient_items`, `insufficient_funds`
- `barn_job_queued`
  - emitted after inputs/fees are committed and the Barn job is persisted
- `barn_job_processed`
  - emitted exactly once when a queued job first resolves into a ready state
  - `processedAtEpochMs` is persisted on the Barn job so reloads and UI polling do not duplicate the event
- `barn_job_claimed`
  - emitted when a ready job is claimed and outputs are granted to inventory

Shared payload fields across the canonical lifecycle events:

- `recipeId`
- `recipeLabel`
- `jobId`
- `inputLineItems`
- `outputLineItems`
- `missingLineItems`
- `fee`
- `durationMs`
- `activeJobCount`
- `balance`
- `source`
- `queuedAtEpochMs`
- `readyAtEpochMs`
- `processedAtEpochMs`
- `claimedAtEpochMs`
- `reason`
- `eventTimestampMs`

Compatibility events are still emitted for existing consumers:

- `barn_job_start_attempt`
- `barn_job_started`
- `barn_job_completed`

The executable telemetry contract lives in:

- `src/game/systems/telemetry.ts`
- `src/game/systems/runtime.ts`
- `tests/fixtures/analytics/retention-contract.fixture.json`

## Save/load contract

Barn jobs persist two extra fields to keep lifecycle telemetry deterministic across reload:

- `source`
  - preserves the original queue input source for later `processed` and `claimed` events
- `processedAtEpochMs`
  - records the first ready transition timestamp so `barn_job_processed` is only emitted once

Legacy Barn saves without these fields still hydrate safely:

- missing `source` defaults to `unspecified`
- missing or invalid `processedAtEpochMs` is normalized back to `null`

## Smoke contract

Primary regression path:

- `tests/smoke/barn-ui.spec.ts`

The mobile Barn smoke path must continue to prove:

1. Touch-first queue failure surfaces missing-input feedback and emits `barn_job_aborted`.
2. A touch queue action emits `barn_job_queued`, consumes the Barn inputs, and survives reload.
3. Reloading a ready Barn job emits `barn_job_processed` once and keeps the queue claimable.
4. A touch claim emits `barn_job_claimed`, clears the queue, grants outputs, and survives reload.

Expected canonical event order for the cheese-press path:

1. `barn_job_aborted`
2. `barn_job_queued`
3. `barn_job_processed`
4. `barn_job_claimed`

## Economy baseline

The smoke test also pins a concrete cheese-press economy contract:

- recipe: `cheese_press`
- inputs: `milk:2`
- outputs: `cheese:1`
- fee: `0`
- sell prices:
  - `milk = 28`
  - `cheese = 60`

Expected Barn value deltas:

- after queue: `-56` value relative to the seeded baseline
- after claim: `+4` net value relative to the seeded baseline

If Barn recipes or Barn output prices change intentionally, update:

- `src/game/config/barnRecipes.shared.js`
- `src/game/config/expansionEconomyTuning.shared.js`
- this document
- the smoke assertions in `tests/smoke/barn-ui.spec.ts`

## Validation

Run the Barn baseline checks with:

```bash
pnpm run test:telemetry:retention
pnpm run test:smoke --project=mobile-chromium tests/smoke/barn-ui.spec.ts
```
