# VER-100 Mobile Retention Memory-Drift Gate

## Scope

Add a mobile-web memory stability guardrail for long-run retention objective sessions so
objective/streak evolution does not silently regress heap behavior.

## Source Of Truth

- Gate command: `pnpm run test:soak:retention:memory`
- Gate spec: `tests/smoke/retention-memory-gate.spec.ts`
- Threshold fixture: `tests/fixtures/save/retention-memory-gate-thresholds.fixture.json`
- CI hook: `.github/workflows/bundle-budget-gate.yml` (`retention-memory-gate` job)

## What The Gate Measures

For each source-controlled rollout mode on mobile Chromium:

- objective-enabled path
- streak-enabled path
- retention kill-switch path

the gate executes deterministic retention claim loops with periodic reload boundaries and samples:

- JS heap used bytes (CDP `Performance.getMetrics` / fallback `performance.memory`)
- frame-spike metrics from the smoke harness frame sampler

The gate computes and validates per-case metrics:

- net heap drift across the full window
- peak heap drift across the full window
- long-frame ratio (`longFrameCount / frameSampleCount`)
- correlation between per-window heap deltas and per-window frame spikes

## Failure Diagnostics

When thresholds are exceeded, failure output is JSON keyed by `caseKey` and includes:

- `sampleWindow` (`sessionStart`, `sessionEnd`, `sampleWindowMs`)
- `driftMetrics` (heap/frame values)
- `thresholdExceeded` (metric, actual, maxAllowed)
- `recentWindowSamples` for quick triage

This JSON is emitted in test logs and attached as Playwright artifacts.

## Triage Workflow

1. Re-run only the gate:
   - `pnpm run test:soak:retention:memory`
2. If failure reproduces, inspect the emitted JSON:
   - identify failing `caseKey`
   - review `thresholdExceeded` metrics first
   - check `recentWindowSamples` for drift shape and frame-spike bursts
3. Open Playwright trace for runtime context:
   - `pnpm exec playwright show-trace test-results/**/trace.zip`
4. If behavior change is unintentional, fix runtime memory/perf regression and re-run.
5. If behavior change is intentional and reviewed, update only
   `tests/fixtures/save/retention-memory-gate-thresholds.fixture.json` with a clear rationale.

## Threshold Update Policy

- Treat threshold edits as product-risk changes.
- Keep deltas small and tied to intentional feature/perf changes.
- Include before/after metric evidence in issue comments when thresholds change.
- Do not loosen multiple metrics without concrete supporting data.
