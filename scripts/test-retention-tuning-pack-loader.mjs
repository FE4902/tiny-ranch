#!/usr/bin/env node

import process from 'node:process'

import {
  RETENTION_TUNING_SAFE_DEFAULT_PACK_ID,
  loadReturnObjectiveEconomyTuningPack,
  retentionTuningPacks,
} from '../src/game/config/returnObjectiveEconomyTuning.shared.js'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function runValidPackSelectionTest() {
  const alternatePack = retentionTuningPacks.find(
    (pack) => pack.id !== RETENTION_TUNING_SAFE_DEFAULT_PACK_ID,
  )
  assert(Boolean(alternatePack), 'Expected at least one non-default bundled tuning pack.')

  const result = loadReturnObjectiveEconomyTuningPack(alternatePack.id)
  assert(
    result.fallbackReason === null,
    `Expected no fallback for valid pack "${alternatePack.id}", got "${result.fallbackReason}".`,
  )
  assert(
    result.tuningPackId === alternatePack.id,
    `Expected selected pack "${alternatePack.id}", got "${result.tuningPackId}".`,
  )
  assert(
    result.tuningPackVersion === alternatePack.version,
    `Expected pack version ${alternatePack.version}, got ${result.tuningPackVersion}.`,
  )
}

function runInvalidPackFallbackTest() {
  const invalidPack = {
    id: 'broken-pack-v99',
    version: 'bad-version',
    rewardCaps: {
      maxObjectiveRewardAmount: 80,
      maxClaimRewardAmount: 90,
      maxRewardMultiplier: 2,
      maxStreakRewardBonusAmount: 16,
    },
    flagDefaults: {
      objectiveLoopUiEnabled: true,
      streakBonusEnabled: true,
      retentionKillSwitchEnabled: false,
    },
    tuning: {
      objectives: [],
      streak: {
        maxTier: 1,
        graceWindowMs: 86_400_000,
        tiers: [{ tier: 1, rewardMultiplier: 1, rewardBonus: 0 }],
      },
      deterministicBalanceCheck: {
        seed: 1,
        scenarios: [],
        guardrails: {
          maxRewardInflationDeltaPct: 10,
          maxNetInflationDeltaPct: 10,
          maxStreakBonusSharePct: 40,
        },
      },
    },
  }

  const result = loadReturnObjectiveEconomyTuningPack(invalidPack.id, {
    candidatePacks: [invalidPack],
  })

  assert(
    result.fallbackReason === 'invalid_pack',
    `Expected invalid pack fallback, got "${result.fallbackReason}".`,
  )
  assert(
    result.tuningPackId === RETENTION_TUNING_SAFE_DEFAULT_PACK_ID,
    `Expected fallback to "${RETENTION_TUNING_SAFE_DEFAULT_PACK_ID}", got "${result.tuningPackId}".`,
  )
}

function runNumericBoundsNormalizationTest() {
  const normalizationPack = {
    id: 'normalized-bounds-pack',
    version: 7,
    rewardCaps: {
      maxObjectiveRewardAmount: 40,
      maxClaimRewardAmount: 10,
      maxRewardMultiplier: 9,
      maxStreakRewardBonusAmount: 2_000,
    },
    flagDefaults: {
      objectiveLoopUiEnabled: true,
      streakBonusEnabled: true,
      retentionKillSwitchEnabled: false,
    },
    tuning: {
      objectives: [
        {
          id: 'objective_a',
          goalId: 'goal_a',
          title: 'Objective A',
          metric: 'harvest_count',
          targetValue: -8,
          rewardAmount: 9_999,
        },
      ],
      streak: {
        maxTier: 3,
        graceWindowMs: 100,
        tiers: [
          { tier: 1, rewardMultiplier: 1.5, rewardBonus: 0 },
          { tier: 2, rewardMultiplier: 8.5, rewardBonus: 9_999 },
          { tier: 3, rewardMultiplier: 12, rewardBonus: 4_000 },
        ],
      },
      deterministicBalanceCheck: {
        seed: -3,
        scenarios: [
          {
            id: 'scenario_a',
            label: 'Scenario A',
            sessionCount: 0,
            claimCadenceHours: [0.1, 400],
            spendAmountsBySessionCycle: [-10, 1_000_000],
            baseline: {
              currencyEarned: -10,
              currencySpent: -20,
              streakBonusTotal: -30,
            },
          },
        ],
        guardrails: {
          maxRewardInflationDeltaPct: -10,
          maxNetInflationDeltaPct: 150,
          maxStreakBonusSharePct: 200,
        },
      },
    },
  }

  const result = loadReturnObjectiveEconomyTuningPack(normalizationPack.id, {
    candidatePacks: [normalizationPack],
  })

  assert(
    result.fallbackReason === null,
    `Expected valid normalized pack load, got fallback "${result.fallbackReason}".`,
  )
  assert(result.normalizationCount > 0, 'Expected normalization count to be greater than zero.')
  assert(
    result.pack.rewardCaps.maxClaimRewardAmount === 40,
    `Expected maxClaimRewardAmount normalization to 40, got ${result.pack.rewardCaps.maxClaimRewardAmount}.`,
  )
  assert(
    result.pack.tuning.objectives[0].targetValue === 1,
    `Expected objective targetValue normalization to 1, got ${result.pack.tuning.objectives[0].targetValue}.`,
  )
  assert(
    result.pack.tuning.objectives[0].rewardAmount === 40,
    `Expected objective rewardAmount normalization to 40, got ${result.pack.tuning.objectives[0].rewardAmount}.`,
  )
  assert(
    result.pack.tuning.streak.graceWindowMs === 3_600_000,
    `Expected graceWindowMs normalization to 3600000, got ${result.pack.tuning.streak.graceWindowMs}.`,
  )
  assert(
    result.pack.tuning.streak.tiers[2].rewardMultiplier === 5,
    `Expected tier 3 rewardMultiplier normalization to 5, got ${result.pack.tuning.streak.tiers[2].rewardMultiplier}.`,
  )
  assert(
    result.pack.tuning.streak.tiers[2].rewardBonus === 1000,
    `Expected tier 3 rewardBonus normalization to 1000, got ${result.pack.tuning.streak.tiers[2].rewardBonus}.`,
  )
}

function run() {
  runValidPackSelectionTest()
  runInvalidPackFallbackTest()
  runNumericBoundsNormalizationTest()
  console.log('[retention-tuning-pack-loader] verified valid load, fallback, and normalization paths.')
}

try {
  run()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[retention-tuning-pack-loader] failed: ${message}`)
  process.exit(1)
}
