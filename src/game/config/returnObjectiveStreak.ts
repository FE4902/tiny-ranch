import {
  type ReturnObjectiveEconomyStreakTierConfig,
} from './returnObjectiveEconomyTuning.shared.js'
import {
  retentionObjectiveEconomyTuning,
  retentionRewardCaps,
} from './retentionTuningPack'

export interface ReturnObjectiveStreakTierConfig {
  tier: number
  rewardMultiplier: number
  rewardBonus: number
}

export interface ReturnObjectiveStreakConfig {
  maxTier: number
  graceWindowMs: number
  tiers: readonly ReturnObjectiveStreakTierConfig[]
}

export interface ReturnObjectiveStreakRewardBreakdown {
  streakTier: number
  rewardMultiplier: number
  rewardBonus: number
  baseRewardAmount: number
  totalRewardAmount: number
  streakBonusAmount: number
}

const BASE_STREAK_TIER_CONFIG: Readonly<ReturnObjectiveStreakTierConfig> = Object.freeze({
  tier: 0,
  rewardMultiplier: 1,
  rewardBonus: 0,
})

function defineReturnObjectiveStreakConfig(
  config: ReturnObjectiveStreakConfig,
): ReturnObjectiveStreakConfig {
  const normalizedMaxTier = Math.floor(config.maxTier)
  if (!Number.isFinite(normalizedMaxTier) || normalizedMaxTier <= 0) {
    throw new Error('Return objective streak maxTier must be a positive integer')
  }

  const normalizedGraceWindowMs = Math.floor(config.graceWindowMs)
  if (!Number.isFinite(normalizedGraceWindowMs) || normalizedGraceWindowMs <= 0) {
    throw new Error('Return objective streak graceWindowMs must be a positive integer')
  }

  if (config.tiers.length < normalizedMaxTier) {
    throw new Error('Return objective streak config must define every tier up to maxTier')
  }

  const normalizedTiers = config.tiers.map((tierConfig) => {
    const tier = Math.floor(tierConfig.tier)
    if (!Number.isFinite(tier) || tier <= 0) {
      throw new Error('Return objective streak tier must be a positive integer')
    }

    if (tier > normalizedMaxTier) {
      throw new Error(`Return objective streak tier ${tier} exceeds maxTier ${normalizedMaxTier}`)
    }

    if (
      !Number.isFinite(tierConfig.rewardMultiplier) ||
      tierConfig.rewardMultiplier < 1 ||
      tierConfig.rewardMultiplier > retentionRewardCaps.maxRewardMultiplier
    ) {
      throw new Error(
        `Return objective streak tier ${tier} rewardMultiplier must be between 1 and ${retentionRewardCaps.maxRewardMultiplier}`,
      )
    }

    const rewardBonus = Math.floor(tierConfig.rewardBonus)
    if (
      !Number.isFinite(rewardBonus) ||
      rewardBonus < 0 ||
      rewardBonus > retentionRewardCaps.maxStreakRewardBonusAmount
    ) {
      throw new Error(
        `Return objective streak tier ${tier} rewardBonus must be between 0 and ${retentionRewardCaps.maxStreakRewardBonusAmount}`,
      )
    }

    return {
      tier,
      rewardMultiplier: tierConfig.rewardMultiplier,
      rewardBonus,
    }
  })

  const uniqueTierCount = new Set(normalizedTiers.map((tierConfig) => tierConfig.tier)).size
  if (uniqueTierCount !== normalizedTiers.length) {
    throw new Error('Return objective streak tiers must not repeat')
  }

  return {
    maxTier: normalizedMaxTier,
    graceWindowMs: normalizedGraceWindowMs,
    tiers: normalizedTiers,
  }
}

function cloneStreakTierConfig(
  tierConfig: ReturnObjectiveEconomyStreakTierConfig,
): ReturnObjectiveStreakTierConfig {
  return {
    tier: tierConfig.tier,
    rewardMultiplier: tierConfig.rewardMultiplier,
    rewardBonus: tierConfig.rewardBonus,
  }
}

const RETURN_OBJECTIVE_STREAK_CONFIG = defineReturnObjectiveStreakConfig({
  maxTier: retentionObjectiveEconomyTuning.streak.maxTier,
  graceWindowMs: retentionObjectiveEconomyTuning.streak.graceWindowMs,
  tiers: retentionObjectiveEconomyTuning.streak.tiers.map((tierConfig) =>
    cloneStreakTierConfig(tierConfig),
  ),
})

const returnObjectiveStreakTierConfigsByTier = RETURN_OBJECTIVE_STREAK_CONFIG.tiers.reduce(
  (map, tierConfig) => {
    map[tierConfig.tier] = tierConfig
    return map
  },
  {} as Record<number, ReturnObjectiveStreakTierConfig>,
)

export const returnObjectiveStreakConfig = RETURN_OBJECTIVE_STREAK_CONFIG

export function clampReturnObjectiveStreakTier(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  const normalized = Math.floor(value)
  if (normalized <= 0) {
    return 0
  }

  return Math.min(normalized, RETURN_OBJECTIVE_STREAK_CONFIG.maxTier)
}

export function getReturnObjectiveStreakTierConfig(tier: number): ReturnObjectiveStreakTierConfig {
  const normalizedTier = clampReturnObjectiveStreakTier(tier)
  return returnObjectiveStreakTierConfigsByTier[normalizedTier] ?? BASE_STREAK_TIER_CONFIG
}

export function calculateReturnObjectiveStreakReward(
  baseRewardAmount: number,
  tier: number,
): ReturnObjectiveStreakRewardBreakdown {
  const normalizedBaseReward =
    Number.isFinite(baseRewardAmount) && baseRewardAmount > 0
      ? Math.min(Math.floor(baseRewardAmount), retentionRewardCaps.maxObjectiveRewardAmount)
      : 0
  const tierConfig = getReturnObjectiveStreakTierConfig(tier)
  const multipliedReward = Math.floor(normalizedBaseReward * tierConfig.rewardMultiplier)
  const unclampedTotalRewardAmount = Math.max(0, multipliedReward + tierConfig.rewardBonus)
  const totalRewardAmount = Math.min(
    unclampedTotalRewardAmount,
    retentionRewardCaps.maxClaimRewardAmount,
  )

  return {
    streakTier: tierConfig.tier,
    rewardMultiplier: tierConfig.rewardMultiplier,
    rewardBonus: tierConfig.rewardBonus,
    baseRewardAmount: normalizedBaseReward,
    totalRewardAmount,
    streakBonusAmount: Math.max(0, totalRewardAmount - normalizedBaseReward),
  }
}
