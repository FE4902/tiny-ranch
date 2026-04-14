# Tiny Ranch

Tiny Ranch is a Phaser foundation for a mobile-first ranch simulation prototype on the open web.

## Stack

- Phaser 3 for rendering and scene management
- Vite for dev/build flow
- TypeScript for strict runtime contracts

## Getting Started

```bash
npm install
npm run dev
```

Build a production bundle with:

```bash
npm run build
```

`npm run build` now defaults to the Phaser `core` build profile for production bundle size.
If you need an immediate rollback to the full Phaser package path, run:

```bash
npm run build:rollback
```

Measure production JS bundle size (raw/minified/gzip) against the mobile-web budget gates with:

```bash
npm run bundle:measure
```

To compare against the rollback path, run:

```bash
npm run bundle:measure:rollback
```

CI enforces the same bundle ceilings on every PR and `main` push via
`.github/workflows/bundle-budget-gate.yml`.

Run the smoke suite locally with:

```bash
npm run test:smoke
```

The smoke run serves the app with `VITE_EXPERIMENT_PHASER_BUILD=package` and starts the
game with `?smokeTest=1`, which exposes a test harness on `window.__TINY_RANCH_SMOKE__`.

Current suites:

- `tests/smoke/core-loop.spec.ts`: deterministic harness-driven core loop regression on desktop + mobile.
- `tests/smoke/touch-path.spec.ts`: mobile-only real touch-path regression that uses `page.touchscreen.tap(...)` for move -> plant -> harvest -> sell -> expansion, then verifies save persistence after reload.
- `tests/smoke/save-migration-matrix.spec.ts`: fixture-driven save migration compatibility matrix for retention objective/streak evolution and fallback flags.

For failure triage:

1. Re-run only the touch suite on mobile:
   `npm run test:smoke -- --project=mobile-chromium tests/smoke/touch-path.spec.ts`.
2. Re-run a single project with fresh server startup when needed:
   `CI=1 npm run test:smoke -- --project=mobile-chromium`.
3. Open the latest trace:
   `npx playwright show-trace test-results/**/trace.zip`.
4. Capture an interactive repro and inspect smoke state in DevTools:
   `npm run test:smoke:debug` then `window.__TINY_RANCH_SMOKE__.getSnapshot()`.

### Save migration compatibility matrix

Run the retention save migration matrix gate with:

```bash
npm run test:smoke:save-migration
```

This gate replays representative legacy save fixtures (`pre_objective`, `objective_only`,
`streak_enabled`, `kill_switch_fallback`) from
`tests/fixtures/save/save-migration-matrix.fixture.json`, validates runtime retention defaults,
and verifies re-save compatibility through `debugSaveGameState`.

CI runs the same command in `.github/workflows/bundle-budget-gate.yml` (`save-migration-smoke` job).

For fixture updates and migration-failure triage, see
`docs/ver-93-save-migration-compatibility-matrix.md`.

### Retention telemetry contract checks

Validate retention objective/streak telemetry contracts with:

```bash
npm run test:telemetry:retention
```

This fixture-driven gate validates required payload keys for:

- `return_objective_assigned`
- `return_objective_progressed`
- `return_objective_completed`
- `return_objective_claimed`
- `streak_started`
- `streak_advanced`
- `streak_reset`
- `streak_claim_bonus`

It compares the fixture contract in `tests/fixtures/analytics/retention-contract.fixture.json`
against both:

- `src/game/systems/telemetry.ts` (`TELEMETRY_EVENT_SCHEMA`)
- `src/game/systems/runtime.ts` (`telemetry.track(...)` payload literals)

Run deterministic cohort export fixture verification with:

```bash
npm run test:analytics:retention-cohort
```

Run both retention analytics checks together (this is what CI runs):

```bash
npm run test:analytics:retention
```

Export cohort retention indicators from captured events:

```bash
npm run analytics:retention:cohort -- --input tests/fixtures/analytics/retention-cohort-events.sample.json --format table
```

### Frame-health gate triage

`tests/smoke/core-loop.spec.ts` now samples runtime frame pacing via the smoke harness and
enforces per-project budgets defined in `tests/smoke/frameHealthBudgets.ts`.

If CI fails on frame-health:

1. Re-run only the gated core-loop smoke for the failing project:
   `npm run test:smoke -- --project=mobile-chromium tests/smoke/core-loop.spec.ts`
   or
   `npm run test:smoke -- --project=desktop-chromium tests/smoke/core-loop.spec.ts`
2. Read the test log line prefixed with `[frame-health][<project>]` for p95, long-frame count,
   long-frame threshold, and max-frame duration.
3. Open Playwright artifacts for the failed run:
   `npx playwright show-trace test-results/**/trace.zip`
4. Adjust budget thresholds only through `tests/smoke/frameHealthBudgets.ts` when an intentional
   performance target change is approved.

Run the deterministic expansion pacing check with:

```bash
npm run balance:check
```

This script reports time-to-first-expansion and time-to-second-expansion checkpoints and fails when either checkpoint drifts outside the configured target range.
Tuning levers and targets are centralized in `src/game/config/expansionEconomyTuning.shared.js` and documented in `docs/ver-78-expansion-economy-pacing.md`.

Run the deterministic return objective/streak economy check with:

```bash
npm run balance:check:return-objectives
```

This script replays configured objective claim scenarios and reports earned/spent/net currency,
streak bonus contribution, and reward inflation deltas vs baseline. Guardrail thresholds and
scenario baselines are source-controlled in `src/game/config/returnObjectiveEconomyTuning.shared.js`
and documented in `docs/ver-91-objective-streak-economy-guardrails.md`.

Run the deterministic retention soak matrix (save/load + flag permutations) with:

```bash
npm run test:soak:retention
```

This gate replays long-run retention sessions across all rollout-flag permutations, enforces
invariants (no stuck objective state, no negative currency drift across save/load), and compares
per-case replay digests against source-controlled baselines in
`tests/fixtures/save/retention-soak-baseline.fixture.json`. CI runs the same command in
`.github/workflows/bundle-budget-gate.yml`.

Run the mobile retention memory-drift gate (heap + frame-spike correlation) with:

```bash
npm run test:soak:retention:memory
```

This gate runs deterministic retention loops on the mobile Chromium profile, enforces
source-controlled memory/frame thresholds, and emits JSON diagnostics on failures
(`caseKey`, sample window, drift metrics, threshold exceeded). For triage and threshold-update
policy, see `docs/ver-100-mobile-memory-drift-gate.md`.

Run the retention health snapshot report (aggregated deterministic readiness view) with:

```bash
npm run report:retention:health
```

This generates machine-readable + human-readable artifacts at:

- `artifacts/retention-health/retention-health-summary.json`
- `artifacts/retention-health/retention-health-summary.md`

For CI-equivalent output that also includes Playwright migration + memory checks:

```bash
npm run report:retention:health -- --run-playwright
```

Thresholds are source-controlled in
`tests/fixtures/analytics/retention-health-thresholds.fixture.json`. Ownership mapping and triage
workflow are documented in `docs/ver-101-retention-health-snapshot-gate.md`.

Run the retention baseline diff gate (baseline-vs-current regression layer) with:

```bash
npm run gate:retention:baseline-diff
```

This command compares retention health summary metrics against source-controlled baseline fixtures
and emits diff artifacts:

- `artifacts/retention-baseline-diff/retention-baseline-diff.json`
- `artifacts/retention-baseline-diff/retention-baseline-diff.md`

Baseline fixtures and drift thresholds live in
`tests/fixtures/analytics/retention-gate-baseline.fixture.json`.
For intentional tuning updates, refresh baseline values with:

```bash
npm run gate:retention:baseline-diff -- --update-baseline
```

Baseline diff policy and workflow are documented in
`docs/ver-103-retention-gate-baseline-diff.md`.

Run the one-command retention release gate orchestrator with:

```bash
npm run gate:retention:release
```

This command runs balance, migration smoke, soak, memory, and health snapshot gates in one
deterministic order, fails fast on hard blockers, and writes aggregate release-readiness artifacts:

- `artifacts/retention-release-gate/retention-release-gate-summary.json`
- `artifacts/retention-release-gate/retention-release-gate-summary.md`

For full release workflow and fallback procedure when one sub-gate fails, see
`docs/ver-102-retention-release-gate-orchestrator.md`.

## Project Structure

- `src/game/config` contains the Phaser runtime configuration
- `src/game/assets` contains typed spritesheet manifests and preload helpers
- `src/game/maps` contains typed map contracts (spawn, zones, collisions, landmarks)
- `src/game/scenes` contains boot, preload, playable scenes, and the HUD scene
- `src/game/ui` contains reusable in-game UI components
- `src/game/systems` contains telemetry and performance helpers
- `src/assets/tiny-ranch` stores the imported Tiny Ranch sprite sheets by category
- `docs/tiny-ranch-asset-inventory.md` documents available sheets and the MVP art cut
- `docs/ver-42-startup-telemetry-baseline.md` defines startup metric events and weekly review flow

## Current Foundation

- Responsive Phaser bootstrap with mobile-web-friendly resize defaults
- Boot -> Preload -> Ranch flow with a persistent HUD scene
- Scene routing between Ranch and Barn shell scenes
- Lightweight startup telemetry for boot, first playable scene, and scene first-frame timing
- Imported Tiny Ranch spritesheets ready for scene integration
- First playable ranch map contract with named interaction zones and collision metadata
