const RETENTION_METRICS = Object.freeze(['harvest_count', 'sell_value'])

const OBJECTIVE_TARGET_BOUNDS = Object.freeze({
  min: 1,
  max: 5000,
})
const OBJECTIVE_REWARD_BOUNDS = Object.freeze({
  min: 1,
  max: 2000,
})
const STREAK_MAX_TIER_BOUNDS = Object.freeze({
  min: 1,
  max: 10,
})
const STREAK_GRACE_WINDOW_BOUNDS = Object.freeze({
  min: 60 * 60 * 1000,
  max: 14 * 24 * 60 * 60 * 1000,
})
const REWARD_MULTIPLIER_BOUNDS = Object.freeze({
  min: 1,
  max: 5,
})
const REWARD_BONUS_BOUNDS = Object.freeze({
  min: 0,
  max: 1000,
})
const BALANCE_SEED_BOUNDS = Object.freeze({
  min: 0,
  max: 1_000_000,
})
const BALANCE_SESSION_COUNT_BOUNDS = Object.freeze({
  min: 1,
  max: 10_000,
})
const BALANCE_CADENCE_HOURS_BOUNDS = Object.freeze({
  min: 1,
  max: 7 * 24,
})
const BALANCE_SPEND_BOUNDS = Object.freeze({
  min: 0,
  max: 100_000,
})
const BALANCE_BASELINE_VALUE_BOUNDS = Object.freeze({
  min: 0,
  max: 1_000_000,
})
const BALANCE_GUARDRAIL_PCT_BOUNDS = Object.freeze({
  min: 0,
  max: 100,
})

const RETENTION_TUNING_PACK_FALLBACK_REASONS = Object.freeze({
  missingPack: 'missing_pack',
  invalidPack: 'invalid_pack',
})

const RETENTION_TUNING_SAFE_DEFAULT_PACK_ID = 'safe-default-v1'

const BUILT_IN_RETENTION_TUNING_PACKS = Object.freeze([
  {
    id: RETENTION_TUNING_SAFE_DEFAULT_PACK_ID,
    version: 1,
    rewardCaps: {
      maxObjectiveRewardAmount: 120,
      maxClaimRewardAmount: 180,
      maxRewardMultiplier: 2,
      maxStreakRewardBonusAmount: 24,
    },
    flagDefaults: {
      objectiveLoopUiEnabled: true,
      streakBonusEnabled: true,
      retentionKillSwitchEnabled: false,
    },
    tuning: {
      objectives: [
        {
          id: 'harvest_turnips_4',
          goalId: 'harvest_count_goal',
          title: 'Harvest 4 crops',
          metric: 'harvest_count',
          targetValue: 4,
          rewardAmount: 32,
        },
        {
          id: 'sell_value_56',
          goalId: 'sell_value_goal',
          title: 'Sell goods worth 56 coins',
          metric: 'sell_value',
          targetValue: 56,
          rewardAmount: 40,
        },
      ],
      streak: {
        maxTier: 5,
        graceWindowMs: 24 * 60 * 60 * 1000,
        tiers: [
          { tier: 1, rewardMultiplier: 1, rewardBonus: 0 },
          { tier: 2, rewardMultiplier: 1.1, rewardBonus: 2 },
          { tier: 3, rewardMultiplier: 1.2, rewardBonus: 4 },
          { tier: 4, rewardMultiplier: 1.35, rewardBonus: 8 },
          { tier: 5, rewardMultiplier: 1.5, rewardBonus: 12 },
        ],
      },
      deterministicBalanceCheck: {
        seed: 691,
        scenarios: [
          {
            id: 'daily_claim_streak',
            label: 'Daily claim cadence inside grace window',
            sessionCount: 28,
            claimCadenceHours: [20, 22, 19, 21],
            spendAmountsBySessionCycle: [0, 18, 0, 12],
            baseline: {
              currencyEarned: 1764,
              currencySpent: 210,
              streakBonusTotal: 756,
            },
          },
          {
            id: 'lapse_recovery_streak',
            label: 'Lapse-and-recovery cadence with streak decay',
            sessionCount: 28,
            claimCadenceHours: [20, 20, 52, 20, 44],
            spendAmountsBySessionCycle: [0, 14, 0, 0, 22],
            baseline: {
              currencyEarned: 1609,
              currencySpent: 194,
              streakBonusTotal: 601,
            },
          },
        ],
        guardrails: {
          maxRewardInflationDeltaPct: 12,
          maxNetInflationDeltaPct: 15,
          maxStreakBonusSharePct: 45,
        },
      },
    },
  },
  {
    id: 'growth-push-v2',
    version: 2,
    rewardCaps: {
      maxObjectiveRewardAmount: 150,
      maxClaimRewardAmount: 225,
      maxRewardMultiplier: 2.25,
      maxStreakRewardBonusAmount: 30,
    },
    flagDefaults: {
      objectiveLoopUiEnabled: true,
      streakBonusEnabled: true,
      retentionKillSwitchEnabled: false,
    },
    tuning: {
      objectives: [
        {
          id: 'harvest_turnips_5',
          goalId: 'harvest_count_goal',
          title: 'Harvest 5 crops',
          metric: 'harvest_count',
          targetValue: 5,
          rewardAmount: 36,
        },
        {
          id: 'sell_value_64',
          goalId: 'sell_value_goal',
          title: 'Sell goods worth 64 coins',
          metric: 'sell_value',
          targetValue: 64,
          rewardAmount: 46,
        },
      ],
      streak: {
        maxTier: 5,
        graceWindowMs: 24 * 60 * 60 * 1000,
        tiers: [
          { tier: 1, rewardMultiplier: 1, rewardBonus: 0 },
          { tier: 2, rewardMultiplier: 1.15, rewardBonus: 3 },
          { tier: 3, rewardMultiplier: 1.3, rewardBonus: 6 },
          { tier: 4, rewardMultiplier: 1.45, rewardBonus: 10 },
          { tier: 5, rewardMultiplier: 1.65, rewardBonus: 15 },
        ],
      },
      deterministicBalanceCheck: {
        seed: 733,
        scenarios: [
          {
            id: 'daily_claim_streak',
            label: 'Daily claim cadence inside grace window',
            sessionCount: 28,
            claimCadenceHours: [20, 22, 19, 21],
            spendAmountsBySessionCycle: [0, 20, 0, 16],
            baseline: {
              currencyEarned: 2107,
              currencySpent: 252,
              streakBonusTotal: 915,
            },
          },
          {
            id: 'lapse_recovery_streak',
            label: 'Lapse-and-recovery cadence with streak decay',
            sessionCount: 28,
            claimCadenceHours: [20, 20, 52, 20, 44],
            spendAmountsBySessionCycle: [0, 16, 0, 0, 24],
            baseline: {
              currencyEarned: 1894,
              currencySpent: 224,
              streakBonusTotal: 722,
            },
          },
        ],
        guardrails: {
          maxRewardInflationDeltaPct: 14,
          maxNetInflationDeltaPct: 17,
          maxStreakBonusSharePct: 48,
        },
      },
    },
  },
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.freeze(value)

  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry)
    }
    return value
  }

  for (const entry of Object.values(value)) {
    deepFreeze(entry)
  }

  return value
}

function normalizeNonEmptyString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`)
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${fieldName} must not be empty`)
  }

  return normalized
}

function normalizeInteger(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`)
  }

  const normalized = Math.floor(value)
  if (!Number.isFinite(normalized)) {
    throw new Error(`${fieldName} must be an integer`)
  }

  return normalized
}

function normalizeFiniteNumber(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`)
  }

  return value
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeIntegerInBounds(value, fieldName, bounds, context) {
  const normalized = normalizeInteger(value, fieldName)
  const clamped = clamp(normalized, bounds.min, bounds.max)
  if (clamped !== normalized) {
    context.normalizationCount += 1
  }

  return clamped
}

function normalizeFiniteNumberInBounds(value, fieldName, bounds, context) {
  const normalized = normalizeFiniteNumber(value, fieldName)
  const clamped = clamp(normalized, bounds.min, bounds.max)
  if (clamped !== normalized) {
    context.normalizationCount += 1
  }

  return clamped
}

function normalizeBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`)
  }

  return value
}

function normalizeRewardCaps(rawRewardCaps, context) {
  if (!isPlainObject(rawRewardCaps)) {
    throw new Error('rewardCaps must be an object')
  }

  const maxObjectiveRewardAmount = normalizeIntegerInBounds(
    rawRewardCaps.maxObjectiveRewardAmount,
    'rewardCaps.maxObjectiveRewardAmount',
    OBJECTIVE_REWARD_BOUNDS,
    context,
  )
  const maxClaimRewardAmount = normalizeIntegerInBounds(
    rawRewardCaps.maxClaimRewardAmount,
    'rewardCaps.maxClaimRewardAmount',
    OBJECTIVE_REWARD_BOUNDS,
    context,
  )
  const maxRewardMultiplier = normalizeFiniteNumberInBounds(
    rawRewardCaps.maxRewardMultiplier,
    'rewardCaps.maxRewardMultiplier',
    REWARD_MULTIPLIER_BOUNDS,
    context,
  )
  const maxStreakRewardBonusAmount = normalizeIntegerInBounds(
    rawRewardCaps.maxStreakRewardBonusAmount,
    'rewardCaps.maxStreakRewardBonusAmount',
    REWARD_BONUS_BOUNDS,
    context,
  )

  const effectiveMaxClaimRewardAmount = Math.max(
    maxClaimRewardAmount,
    maxObjectiveRewardAmount,
  )
  if (effectiveMaxClaimRewardAmount !== maxClaimRewardAmount) {
    context.normalizationCount += 1
  }

  return {
    maxObjectiveRewardAmount,
    maxClaimRewardAmount: effectiveMaxClaimRewardAmount,
    maxRewardMultiplier,
    maxStreakRewardBonusAmount,
  }
}

function normalizeFlagDefaults(rawFlagDefaults) {
  if (!isPlainObject(rawFlagDefaults)) {
    throw new Error('flagDefaults must be an object')
  }

  return {
    objectiveLoopUiEnabled: normalizeBoolean(
      rawFlagDefaults.objectiveLoopUiEnabled,
      'flagDefaults.objectiveLoopUiEnabled',
    ),
    streakBonusEnabled: normalizeBoolean(
      rawFlagDefaults.streakBonusEnabled,
      'flagDefaults.streakBonusEnabled',
    ),
    retentionKillSwitchEnabled: normalizeBoolean(
      rawFlagDefaults.retentionKillSwitchEnabled,
      'flagDefaults.retentionKillSwitchEnabled',
    ),
  }
}

function normalizeObjective(rawObjective, index, rewardCaps, context) {
  if (!isPlainObject(rawObjective)) {
    throw new Error(`tuning.objectives[${index}] must be an object`)
  }

  const metric = normalizeNonEmptyString(rawObjective.metric, `tuning.objectives[${index}].metric`)
  if (!RETENTION_METRICS.includes(metric)) {
    throw new Error(`tuning.objectives[${index}].metric "${metric}" is not supported`)
  }

  const rewardBounds = {
    min: OBJECTIVE_REWARD_BOUNDS.min,
    max: Math.min(OBJECTIVE_REWARD_BOUNDS.max, rewardCaps.maxObjectiveRewardAmount),
  }

  return {
    id: normalizeNonEmptyString(rawObjective.id, `tuning.objectives[${index}].id`),
    goalId: normalizeNonEmptyString(rawObjective.goalId, `tuning.objectives[${index}].goalId`),
    title: normalizeNonEmptyString(rawObjective.title, `tuning.objectives[${index}].title`),
    metric,
    targetValue: normalizeIntegerInBounds(
      rawObjective.targetValue,
      `tuning.objectives[${index}].targetValue`,
      OBJECTIVE_TARGET_BOUNDS,
      context,
    ),
    rewardAmount: normalizeIntegerInBounds(
      rawObjective.rewardAmount,
      `tuning.objectives[${index}].rewardAmount`,
      rewardBounds,
      context,
    ),
  }
}

function normalizeStreakTier(rawTierConfig, index, maxTier, rewardCaps, context) {
  if (!isPlainObject(rawTierConfig)) {
    throw new Error(`tuning.streak.tiers[${index}] must be an object`)
  }

  return {
    tier: normalizeIntegerInBounds(
      rawTierConfig.tier,
      `tuning.streak.tiers[${index}].tier`,
      { min: 1, max: maxTier },
      context,
    ),
    rewardMultiplier: normalizeFiniteNumberInBounds(
      rawTierConfig.rewardMultiplier,
      `tuning.streak.tiers[${index}].rewardMultiplier`,
      { min: REWARD_MULTIPLIER_BOUNDS.min, max: rewardCaps.maxRewardMultiplier },
      context,
    ),
    rewardBonus: normalizeIntegerInBounds(
      rawTierConfig.rewardBonus,
      `tuning.streak.tiers[${index}].rewardBonus`,
      { min: REWARD_BONUS_BOUNDS.min, max: rewardCaps.maxStreakRewardBonusAmount },
      context,
    ),
  }
}

function normalizeStreakConfig(rawStreak, rewardCaps, context) {
  if (!isPlainObject(rawStreak)) {
    throw new Error('tuning.streak must be an object')
  }

  const maxTier = normalizeIntegerInBounds(
    rawStreak.maxTier,
    'tuning.streak.maxTier',
    STREAK_MAX_TIER_BOUNDS,
    context,
  )
  const graceWindowMs = normalizeIntegerInBounds(
    rawStreak.graceWindowMs,
    'tuning.streak.graceWindowMs',
    STREAK_GRACE_WINDOW_BOUNDS,
    context,
  )

  if (!Array.isArray(rawStreak.tiers) || rawStreak.tiers.length === 0) {
    throw new Error('tuning.streak.tiers must be a non-empty array')
  }

  const normalizedTiers = rawStreak.tiers.map((tierConfig, index) =>
    normalizeStreakTier(tierConfig, index, maxTier, rewardCaps, context),
  )

  const uniqueTierCount = new Set(normalizedTiers.map((tierConfig) => tierConfig.tier)).size
  if (uniqueTierCount !== normalizedTiers.length) {
    throw new Error('tuning.streak.tiers must not contain duplicate tier values')
  }

  for (let tier = 1; tier <= maxTier; tier += 1) {
    if (!normalizedTiers.some((tierConfig) => tierConfig.tier === tier)) {
      throw new Error(`tuning.streak.tiers is missing tier ${tier}`)
    }
  }

  const sortedTiers = [...normalizedTiers].sort((left, right) => left.tier - right.tier)

  return {
    maxTier,
    graceWindowMs,
    tiers: sortedTiers,
  }
}

function normalizeBalanceScenario(rawScenario, index, context) {
  if (!isPlainObject(rawScenario)) {
    throw new Error(`tuning.deterministicBalanceCheck.scenarios[${index}] must be an object`)
  }

  if (!Array.isArray(rawScenario.claimCadenceHours) || rawScenario.claimCadenceHours.length === 0) {
    throw new Error(`tuning.deterministicBalanceCheck.scenarios[${index}].claimCadenceHours must be a non-empty array`)
  }

  if (
    !Array.isArray(rawScenario.spendAmountsBySessionCycle) ||
    rawScenario.spendAmountsBySessionCycle.length === 0
  ) {
    throw new Error(`tuning.deterministicBalanceCheck.scenarios[${index}].spendAmountsBySessionCycle must be a non-empty array`)
  }

  if (!isPlainObject(rawScenario.baseline)) {
    throw new Error(`tuning.deterministicBalanceCheck.scenarios[${index}].baseline must be an object`)
  }

  return {
    id: normalizeNonEmptyString(
      rawScenario.id,
      `tuning.deterministicBalanceCheck.scenarios[${index}].id`,
    ),
    label: normalizeNonEmptyString(
      rawScenario.label,
      `tuning.deterministicBalanceCheck.scenarios[${index}].label`,
    ),
    sessionCount: normalizeIntegerInBounds(
      rawScenario.sessionCount,
      `tuning.deterministicBalanceCheck.scenarios[${index}].sessionCount`,
      BALANCE_SESSION_COUNT_BOUNDS,
      context,
    ),
    claimCadenceHours: rawScenario.claimCadenceHours.map((hours, cadenceIndex) =>
      normalizeFiniteNumberInBounds(
        hours,
        `tuning.deterministicBalanceCheck.scenarios[${index}].claimCadenceHours[${cadenceIndex}]`,
        BALANCE_CADENCE_HOURS_BOUNDS,
        context,
      ),
    ),
    spendAmountsBySessionCycle: rawScenario.spendAmountsBySessionCycle.map((amount, spendIndex) =>
      normalizeIntegerInBounds(
        amount,
        `tuning.deterministicBalanceCheck.scenarios[${index}].spendAmountsBySessionCycle[${spendIndex}]`,
        BALANCE_SPEND_BOUNDS,
        context,
      ),
    ),
    baseline: {
      currencyEarned: normalizeIntegerInBounds(
        rawScenario.baseline.currencyEarned,
        `tuning.deterministicBalanceCheck.scenarios[${index}].baseline.currencyEarned`,
        BALANCE_BASELINE_VALUE_BOUNDS,
        context,
      ),
      currencySpent: normalizeIntegerInBounds(
        rawScenario.baseline.currencySpent,
        `tuning.deterministicBalanceCheck.scenarios[${index}].baseline.currencySpent`,
        BALANCE_BASELINE_VALUE_BOUNDS,
        context,
      ),
      streakBonusTotal: normalizeIntegerInBounds(
        rawScenario.baseline.streakBonusTotal,
        `tuning.deterministicBalanceCheck.scenarios[${index}].baseline.streakBonusTotal`,
        BALANCE_BASELINE_VALUE_BOUNDS,
        context,
      ),
    },
  }
}

function normalizeDeterministicBalanceCheck(rawBalanceCheck, context) {
  if (!isPlainObject(rawBalanceCheck)) {
    throw new Error('tuning.deterministicBalanceCheck must be an object')
  }

  if (!Array.isArray(rawBalanceCheck.scenarios) || rawBalanceCheck.scenarios.length === 0) {
    throw new Error('tuning.deterministicBalanceCheck.scenarios must be a non-empty array')
  }

  if (!isPlainObject(rawBalanceCheck.guardrails)) {
    throw new Error('tuning.deterministicBalanceCheck.guardrails must be an object')
  }

  return {
    seed: normalizeIntegerInBounds(
      rawBalanceCheck.seed,
      'tuning.deterministicBalanceCheck.seed',
      BALANCE_SEED_BOUNDS,
      context,
    ),
    scenarios: rawBalanceCheck.scenarios.map((scenario, index) =>
      normalizeBalanceScenario(scenario, index, context),
    ),
    guardrails: {
      maxRewardInflationDeltaPct: normalizeFiniteNumberInBounds(
        rawBalanceCheck.guardrails.maxRewardInflationDeltaPct,
        'tuning.deterministicBalanceCheck.guardrails.maxRewardInflationDeltaPct',
        BALANCE_GUARDRAIL_PCT_BOUNDS,
        context,
      ),
      maxNetInflationDeltaPct: normalizeFiniteNumberInBounds(
        rawBalanceCheck.guardrails.maxNetInflationDeltaPct,
        'tuning.deterministicBalanceCheck.guardrails.maxNetInflationDeltaPct',
        BALANCE_GUARDRAIL_PCT_BOUNDS,
        context,
      ),
      maxStreakBonusSharePct: normalizeFiniteNumberInBounds(
        rawBalanceCheck.guardrails.maxStreakBonusSharePct,
        'tuning.deterministicBalanceCheck.guardrails.maxStreakBonusSharePct',
        BALANCE_GUARDRAIL_PCT_BOUNDS,
        context,
      ),
    },
  }
}

function normalizeTuning(rawTuning, rewardCaps, context) {
  if (!isPlainObject(rawTuning)) {
    throw new Error('tuning must be an object')
  }

  if (!Array.isArray(rawTuning.objectives) || rawTuning.objectives.length === 0) {
    throw new Error('tuning.objectives must be a non-empty array')
  }

  const objectives = rawTuning.objectives.map((objective, index) =>
    normalizeObjective(objective, index, rewardCaps, context),
  )

  const uniqueObjectiveIdCount = new Set(objectives.map((objective) => objective.id)).size
  if (uniqueObjectiveIdCount !== objectives.length) {
    throw new Error('tuning.objectives must not contain duplicate objective ids')
  }

  return {
    objectives,
    streak: normalizeStreakConfig(rawTuning.streak, rewardCaps, context),
    deterministicBalanceCheck: normalizeDeterministicBalanceCheck(
      rawTuning.deterministicBalanceCheck,
      context,
    ),
  }
}

function normalizeRetentionTuningPack(rawPack) {
  if (!isPlainObject(rawPack)) {
    throw new Error('Retention tuning pack must be an object')
  }

  const context = {
    normalizationCount: 0,
  }

  const id = normalizeNonEmptyString(rawPack.id, 'id')
  const version = normalizeIntegerInBounds(rawPack.version, 'version', { min: 1, max: 9999 }, context)
  const rewardCaps = normalizeRewardCaps(rawPack.rewardCaps, context)
  const flagDefaults = normalizeFlagDefaults(rawPack.flagDefaults)
  const tuning = normalizeTuning(rawPack.tuning, rewardCaps, context)

  return {
    pack: deepFreeze({
      id,
      version,
      rewardCaps,
      flagDefaults,
      tuning,
    }),
    normalizationCount: context.normalizationCount,
  }
}

function resolvePackId(rawValue) {
  if (typeof rawValue !== 'string') {
    return RETENTION_TUNING_SAFE_DEFAULT_PACK_ID
  }

  const normalized = rawValue.trim()
  if (normalized.length === 0) {
    return RETENTION_TUNING_SAFE_DEFAULT_PACK_ID
  }

  return normalized
}

function resolveCandidatePacks(options) {
  if (!options || !Array.isArray(options.candidatePacks) || options.candidatePacks.length === 0) {
    return BUILT_IN_RETENTION_TUNING_PACKS
  }

  return options.candidatePacks
}

const normalizedBuiltInPackEntries = BUILT_IN_RETENTION_TUNING_PACKS.map((pack) => {
  const normalized = normalizeRetentionTuningPack(pack)
  return {
    id: normalized.pack.id,
    pack: normalized.pack,
  }
})

const retentionTuningPacks = deepFreeze(
  normalizedBuiltInPackEntries.map((entry) => entry.pack),
)

const retentionTuningPackById = normalizedBuiltInPackEntries.reduce((map, entry) => {
  map.set(entry.id, entry.pack)
  return map
}, new Map())

const safeDefaultRetentionTuningPack = retentionTuningPackById.get(RETENTION_TUNING_SAFE_DEFAULT_PACK_ID)

if (!safeDefaultRetentionTuningPack) {
  throw new Error(
    `Built-in safe default tuning pack "${RETENTION_TUNING_SAFE_DEFAULT_PACK_ID}" is not defined.`,
  )
}

function createLoadedPackResult(requestedPackId, normalizedPack, fallbackReason, normalizationCount) {
  return {
    requestedPackId,
    tuningPackId: normalizedPack.id,
    tuningPackVersion: normalizedPack.version,
    fallbackReason,
    normalizationCount,
    pack: normalizedPack,
  }
}

function loadReturnObjectiveEconomyTuningPack(requestedPackId, options = {}) {
  const resolvedRequestedPackId = resolvePackId(requestedPackId)
  const candidatePacks = resolveCandidatePacks(options)
  const matchingRawPack = candidatePacks.find((pack) => {
    if (!isPlainObject(pack) || typeof pack.id !== 'string') {
      return false
    }

    return pack.id.trim() === resolvedRequestedPackId
  })

  if (!matchingRawPack) {
    return createLoadedPackResult(
      resolvedRequestedPackId,
      safeDefaultRetentionTuningPack,
      RETENTION_TUNING_PACK_FALLBACK_REASONS.missingPack,
      0,
    )
  }

  try {
    const normalized = normalizeRetentionTuningPack(matchingRawPack)
    return createLoadedPackResult(
      resolvedRequestedPackId,
      normalized.pack,
      null,
      normalized.normalizationCount,
    )
  } catch {
    return createLoadedPackResult(
      resolvedRequestedPackId,
      safeDefaultRetentionTuningPack,
      RETENTION_TUNING_PACK_FALLBACK_REASONS.invalidPack,
      0,
    )
  }
}

const returnObjectiveEconomyTuning = safeDefaultRetentionTuningPack.tuning

export {
  RETENTION_TUNING_PACK_FALLBACK_REASONS,
  RETENTION_TUNING_SAFE_DEFAULT_PACK_ID,
  loadReturnObjectiveEconomyTuningPack,
  retentionTuningPacks,
  returnObjectiveEconomyTuning,
}
