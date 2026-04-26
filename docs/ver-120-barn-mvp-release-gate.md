# VER-120 Barn MVP Release Gate

## Scope

This is the Barn lane closeout gate for the current MVP slice. It proves the completed Barn path
still works end to end before broader polish or launch work depends on it.

## Source Of Truth

- Gate command: `npm run gate:barn:mvp`
- Orchestrator script: `scripts/run-barn-mvp-release-gate.mjs`
- Summary artifacts: `artifacts/barn-mvp-release-gate/`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`barn-mvp-release-gate` job)

## Stage Order

The gate runs deterministic Playwright smoke stages in this order:

1. Fresh Barn handoff
   - Test: `first-run Barn handoff surfaces a reachable Cheese Press start and persists completion`
   - Covers fresh/early-session FTUE handoff, Cheese Press start, and handoff completion persistence.
2. Mobile recipe unlock
   - Test: `mobile Barn locked recipe feedback unlocks through expansion progression`
   - Covers locked-state copy, expansion-driven recipe unlock, and touch start after unlock.
3. Mobile processing, claim, order ship
   - Test: `mobile Barn scene touch flow emits lifecycle telemetry, preserves economy deltas, and persists claim state across reload`
   - Covers touch viability, processing, save/reload ready state, claim, market order shipment, post-ship persistence, and Barn lifecycle telemetry.
4. Market order reload claim guard
   - Test: `barn market order pays a deterministic premium and cannot be claimed again after reload`
   - Covers deterministic premium payout, fulfilled-order persistence, and duplicate order-claim protection.

Default mode is fail-fast. Later stages are marked `skipped` after the first failure so the summary
points to the first broken Barn milestone. For a broader local triage pass, run:

```bash
npm run gate:barn:mvp -- --no-fail-fast
```

## Artifacts

Running the gate writes:

- `artifacts/barn-mvp-release-gate/barn-mvp-release-gate-summary.json`
- `artifacts/barn-mvp-release-gate/barn-mvp-release-gate-summary.md`
- `artifacts/barn-mvp-release-gate/barn-mvp-release-gate-artifact-index.json`
- `artifacts/barn-mvp-release-gate/logs/<stage>.stdout.log`
- `artifacts/barn-mvp-release-gate/logs/<stage>.stderr.log`
- `artifacts/barn-mvp-release-gate/reports/<stage>.playwright.json`

The markdown summary is the first triage surface. It records stage status, coverage, test counts,
log paths, Playwright report paths, and the first captured failure message.

## Triage Order

1. Open `artifacts/barn-mvp-release-gate/barn-mvp-release-gate-summary.md`.
2. Start with the first failed stage in `Stage Summary`.
3. Open that stage's Playwright JSON report, then stdout/stderr logs.
4. Re-run the exact stage command listed in `barn-mvp-release-gate-summary.json` if the full gate is too slow.
5. Fix the owning Barn system, then re-run `npm run gate:barn:mvp`.

## Expected Release Use

Run this gate after Barn feature work lands and before closing the Barn lane under
[VER-70](/VER/issues/VER-70). A passing gate means the MVP Barn path is ready for broader product
polish dependencies. A failing gate keeps Barn closeout blocked until the failed stage is fixed.
