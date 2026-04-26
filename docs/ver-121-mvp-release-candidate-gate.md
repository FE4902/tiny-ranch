# VER-121 MVP Release-Candidate Gate

## Scope

This is the top-level Tiny Ranch launch-candidate gate for the current MVP. Run it after the
Barn lane closeout gate passes and before final launch signoff or polish work depends on the
current build.

## Source Of Truth

- Gate command: `npm run gate:mvp:release`
- Orchestrator script: `scripts/run-mvp-release-candidate-gate.mjs`
- Summary artifacts: `artifacts/mvp-release-candidate-gate/`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`mvp-release-candidate-gate` job)

## Stage Order

The gate runs existing project gates in this deterministic order:

1. Production build
   - Command: `npm run build`
   - Owner docs: `README.md`, `docs/ver-40-core-default-rollout.md`
2. Bundle budget
   - Command: `npm run bundle:measure`
   - Owner docs: `docs/ver-38-bundle-prototypes.md`, `docs/ver-40-core-default-rollout.md`
3. Desktop core smoke
   - Command: `npx playwright test --project=desktop-chromium tests/smoke/core-loop.spec.ts --reporter=json`
   - Owner docs: `README.md`, `docs/ver-42-startup-telemetry-baseline.md`
4. Mobile core and touch smoke
   - Command: `npx playwright test --project=mobile-chromium tests/smoke/core-loop.spec.ts tests/smoke/touch-path.spec.ts --reporter=json`
   - Owner docs: `README.md`, `docs/ver-42-startup-telemetry-baseline.md`
5. Save migration smoke
   - Command: `npx playwright test --project=desktop-chromium tests/smoke/save-migration-matrix.spec.ts --reporter=json`
   - Owner docs: `docs/ver-93-save-migration-compatibility-matrix.md`
6. Retention release gate
   - Command: `npm run gate:retention:release`
   - Owner docs: `docs/ver-102-retention-release-gate-orchestrator.md`
7. Barn MVP gate
   - Command: `npm run gate:barn:mvp`
   - Owner docs: `docs/ver-120-barn-mvp-release-gate.md`

Default mode is fail-fast. Later stages are marked `skipped` after the first failure so the
summary points to the first launch blocker. For a broader local triage pass, run:

```bash
npm run gate:mvp:release -- --no-fail-fast
```

## Artifacts

Running the gate writes:

- `artifacts/mvp-release-candidate-gate/mvp-release-candidate-gate-summary.json`
- `artifacts/mvp-release-candidate-gate/mvp-release-candidate-gate-summary.md`
- `artifacts/mvp-release-candidate-gate/mvp-release-candidate-gate-artifact-index.json`
- `artifacts/mvp-release-candidate-gate/logs/<stage>.stdout.log`
- `artifacts/mvp-release-candidate-gate/logs/<stage>.stderr.log`
- `artifacts/mvp-release-candidate-gate/reports/<stage>.playwright.json`
- nested retention artifacts under `artifacts/mvp-release-candidate-gate/retention-release-gate/`
- nested Barn artifacts under `artifacts/mvp-release-candidate-gate/barn-mvp-release-gate/`

The markdown summary is the first triage surface. It records stage status, command, owner,
owner docs, log paths, report paths, and nested gate artifact paths.

## Triage Order

1. Open `artifacts/mvp-release-candidate-gate/mvp-release-candidate-gate-summary.md`.
2. Start with the first failed row in `Failures`.
3. Open the listed owner doc, then the first artifact/log path for that stage.
4. Re-run the exact failed command from the summary if the full gate is too slow.
5. Fix the owning subsystem and rerun `npm run gate:mvp:release`.

## Expected Release Use

Run this command as the top-level closeout gate after [VER-120](/VER/issues/VER-120). A passing
summary means the current MVP candidate has cleared the production build, bundle budget,
core/mobile smoke, save migration, retention release, and Barn MVP gate layers. A failing summary
keeps release signoff blocked until the failed stage passes.
