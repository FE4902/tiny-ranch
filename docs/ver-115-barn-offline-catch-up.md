# VER-115 Barn Offline Catch-Up

Barn jobs now participate in the existing boot-time offline hydration pass.

## Behavior

- Barn jobs advance to a ready state during `applyOfflineProgressCatchUp` when:
  - the save has been offline for at least `offlineProgressConfig.minimumElapsedMs`
  - the job `readyAtEpochMs` falls within the capped offline window
- Offline Barn catch-up sets `processedAtEpochMs` to the job `readyAtEpochMs` and persists that state on boot.
- Barn outputs are still granted only by `claimBarnJob`; hydration never adds Barn outputs to inventory.
- The return-session modal now calls out Barn jobs that finished while the player was away and lists the ready recipe labels.

## Guardrails

- Barn progression uses the same capped offline window as crop and animal catch-up:
  - `src/game/config/offlineProgress.ts`
  - current cap: `8 * 60 * 60 * 1000`
- There is no Barn-specific output grant cap because offline hydration never mints Barn outputs.
- Persisting `processedAtEpochMs` on the first hydrated boot makes the ready transition one-shot across reloads, so the same offline-ready Barn job is not re-announced every session.

## Deterministic Coverage

- `tests/smoke/barn-processing.spec.ts`
  - legacy Barn-less save compatibility
  - reload-safe Barn queue and claim flow
  - offline Barn completion through boot hydration
  - one-shot return-session summary behavior across repeated reloads
  - claim-only Barn output grant after offline completion

## Validation

- `pnpm run build`
- `pnpm run test:smoke tests/smoke/barn-processing.spec.ts`
