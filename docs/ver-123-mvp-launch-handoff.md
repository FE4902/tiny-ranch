# VER-123 MVP Launch Handoff

## Scope

This is the final Tiny Ranch MVP launch handoff layer after [VER-122](/VER/issues/VER-122). It
keeps [VER-121](/VER/issues/VER-121) as the unified release-candidate gate and packages the
launch-shell validation evidence into a board-readable handoff summary.

## Command

Run the full handoff package with:

```bash
npm run release:handoff
```

By default, the command:

1. Runs `npm run gate:mvp:release` with nested output at
   `artifacts/mvp-launch-handoff/mvp-release-candidate-gate/`.
2. Runs the production launch-shell metadata and boot smoke from
   `tests/smoke/launch-shell.spec.ts` with a JSON report.
3. Writes the final handoff artifacts under `artifacts/mvp-launch-handoff/`.

For a fast packaging pass after a separate release-candidate gate run, use:

```bash
npm run gate:mvp:release
npm run release:handoff -- --use-existing-gate --gate-output-dir=artifacts/mvp-release-candidate-gate
```

## Artifacts

The handoff command writes:

- `artifacts/mvp-launch-handoff/mvp-launch-handoff-summary.json`
- `artifacts/mvp-launch-handoff/mvp-launch-handoff-summary.md`
- `artifacts/mvp-launch-handoff/mvp-launch-handoff-artifact-index.json`
- `artifacts/mvp-launch-handoff/logs/release_candidate_gate.stdout.log`
- `artifacts/mvp-launch-handoff/logs/release_candidate_gate.stderr.log`
- `artifacts/mvp-launch-handoff/logs/launch_shell_preview_smoke.stdout.log`
- `artifacts/mvp-launch-handoff/logs/launch_shell_preview_smoke.stderr.log`
- `artifacts/mvp-launch-handoff/reports/launch_shell_preview_smoke.playwright.json`

The markdown summary links to:

- the unified MVP release-candidate gate from [VER-121](/VER/issues/VER-121)
- the nested retention release gate artifacts
- the nested Barn MVP gate artifacts
- the launch-shell metadata smoke evidence from [VER-122](/VER/issues/VER-122)

## Go/No-Go Criteria

Launch is a `GO` only when all criteria are true:

- `npm run build` passes for the current commit.
- `npm run gate:mvp:release` passes with no failed or skipped stages.
- `npm run release:handoff` passes and recommends `GO`.
- The handoff summary links to MVP, retention, Barn, and launch-shell evidence.
- Production telemetry envs are intentionally configured or intentionally omitted.
- Rollback owner and commands are understood before deployment.

Any failed stage, missing artifact, or unreviewed production env change is a `NO-GO` until fixed and
rerun.

## Rollback Paths

### Build Profile

Use this if the default Phaser `core` build profile blocks production boot:

```bash
npm run build:rollback
npm run bundle:measure:rollback
```

Deployment equivalent: set `VITE_EXPERIMENT_PHASER_BUILD=package`, rebuild, redeploy, and rerun
`npm run test:smoke:launch-shell`.

Owner docs:

- `README.md`
- `package.json`

### Telemetry Sink

Telemetry is safe by default and does not require production envs to build or boot.

Production options:

- `VITE_TELEMETRY_SINK=console` for local debug events and console lines.
- `VITE_TELEMETRY_SINK=none` to disable delivery.
- `VITE_TELEMETRY_SINK=posthog` with `VITE_POSTHOG_API_KEY` to enable PostHog delivery.

Optional PostHog envs:

- `VITE_POSTHOG_API_HOST`
- `VITE_POSTHOG_BATCH_SIZE`
- `VITE_POSTHOG_FLUSH_INTERVAL_MS`
- `VITE_POSTHOG_MAX_QUEUE_SIZE`

Rollback:

```bash
VITE_TELEMETRY_SINK=none npm run build
npm run test:smoke:launch-shell
```

Also remove `VITE_POSTHOG_API_KEY` and optional PostHog overrides from deployment secrets before
redeploying with `none` or `console`.

Owner docs:

- `docs/ver-122-production-launch-shell.md`
- `docs/ver-42-startup-telemetry-baseline.md`

### Retention Tuning And Flags

Production tuning rollback:

```bash
VITE_RETENTION_TUNING_PACK=safe-default-v1 npm run build
npm run gate:retention:release
npm run gate:mvp:release
```

Smoke-only isolation query flags remain available for local reproduction:

- `?smokeTest=1&retentionKillSwitch=1`
- `?smokeTest=1&retentionObjectiveUi=0`
- `?smokeTest=1&retentionStreakBonus=0`

Owner docs:

- `docs/ver-97-retention-tuning-pack-loader.md`
- `docs/ver-102-retention-release-gate-orchestrator.md`

### Barn Release State

Barn MVP has no production env kill switch in this build. Rollback is source-controlled:

```bash
git revert <barn-lane-commit>
npm run gate:barn:mvp
npm run gate:mvp:release
```

If a narrower rollback is approved, source-disable the Barn entry or Barn recipe/order config, then
rerun the Barn and MVP gates before redeploying.

Owner docs:

- `docs/ver-120-barn-mvp-release-gate.md`
- `docs/ver-118-barn-mobile-qa.md`

## Owner Follow-Ups

Before deployment:

1. Board or CTO reviews `artifacts/mvp-launch-handoff/mvp-launch-handoff-summary.md`.
2. Release owner confirms the target commit matches the reviewed handoff.
3. Release owner confirms telemetry envs are set intentionally.
4. Release owner confirms rollback commands and owner coverage.

After deployment:

1. Run the launch-shell smoke against the deployed preview or production target.
2. Monitor first-session boot, first harvest/sell, retention assignment/claim, Barn processing/order,
   and telemetry delivery signals.
3. Keep the handoff summary attached to the launch decision record.
