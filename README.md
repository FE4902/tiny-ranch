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

For failure triage:

1. Re-run only the touch suite on mobile:
   `npm run test:smoke -- --project=mobile-chromium tests/smoke/touch-path.spec.ts`.
2. Re-run a single project with fresh server startup when needed:
   `CI=1 npm run test:smoke -- --project=mobile-chromium`.
3. Open the latest trace:
   `npx playwright show-trace test-results/**/trace.zip`.
4. Capture an interactive repro and inspect smoke state in DevTools:
   `npm run test:smoke:debug` then `window.__TINY_RANCH_SMOKE__.getSnapshot()`.

Run the deterministic expansion pacing check with:

```bash
npm run balance:check
```

This script reports time-to-first-expansion and time-to-second-expansion checkpoints and fails when either checkpoint drifts outside the configured target range.
Tuning levers and targets are centralized in `src/game/config/expansionEconomyTuning.shared.js` and documented in `docs/ver-78-expansion-economy-pacing.md`.

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
