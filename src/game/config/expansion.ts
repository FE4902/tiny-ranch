import type { RanchZoneId } from '../maps/ranchMap'
import { expansionEconomyTuning } from './expansionEconomyTuning.shared.js'

export interface ExpansionTierUnlockEffects {
  cropTileCapacity: number
  animalSlotCapacity: number
  unlockedZoneIds: readonly RanchZoneId[]
}

export interface RanchExpansionTierConfig {
  tier: number
  cost: number
  label: string
  summary: string
  unlocks: ExpansionTierUnlockEffects
}

function defineExpansionTier(config: RanchExpansionTierConfig): RanchExpansionTierConfig {
  if (!Number.isFinite(config.tier) || Math.floor(config.tier) !== config.tier || config.tier < 1) {
    throw new Error(`Expansion tier "${config.label}" must have a positive integer tier id`)
  }

  if (!Number.isFinite(config.cost) || Math.floor(config.cost) !== config.cost || config.cost < 0) {
    throw new Error(`Expansion tier "${config.label}" must have a non-negative integer cost`)
  }

  if (config.label.trim().length === 0) {
    throw new Error(`Expansion tier ${config.tier} requires a label`)
  }

  if (config.summary.trim().length === 0) {
    throw new Error(`Expansion tier ${config.tier} requires a summary`)
  }

  if (
    !Number.isFinite(config.unlocks.cropTileCapacity) ||
    Math.floor(config.unlocks.cropTileCapacity) !== config.unlocks.cropTileCapacity ||
    config.unlocks.cropTileCapacity <= 0
  ) {
    throw new Error(`Expansion tier ${config.tier} cropTileCapacity must be a positive integer`)
  }

  if (
    !Number.isFinite(config.unlocks.animalSlotCapacity) ||
    Math.floor(config.unlocks.animalSlotCapacity) !== config.unlocks.animalSlotCapacity ||
    config.unlocks.animalSlotCapacity <= 0
  ) {
    throw new Error(`Expansion tier ${config.tier} animalSlotCapacity must be a positive integer`)
  }

  if (config.unlocks.unlockedZoneIds.length === 0) {
    throw new Error(`Expansion tier ${config.tier} must unlock at least one zone`)
  }

  return config
}

const tierConfigs = expansionEconomyTuning.expansionTiers.map((tier) =>
  defineExpansionTier({
    tier: tier.tier,
    cost: tier.cost,
    label: tier.label,
    summary: tier.summary,
    unlocks: {
      cropTileCapacity: tier.cropTileCapacity,
      animalSlotCapacity: tier.animalSlotCapacity,
      unlockedZoneIds: [...tier.unlockedZoneIds],
    },
  }),
)

if (tierConfigs.length === 0) {
  throw new Error('At least one ranch expansion tier must be configured')
}

tierConfigs.forEach((config, index) => {
  const expectedTier = index + 1
  if (config.tier !== expectedTier) {
    throw new Error(`Expansion tiers must be contiguous. Expected tier ${expectedTier}.`)
  }

  if (index > 0 && config.cost <= 0) {
    throw new Error(`Expansion tier ${config.tier} must have a positive purchase cost`)
  }
})

export const ranchExpansionTiers = Object.freeze(tierConfigs)

export type ExpansionTierId = number

const MIN_EXPANSION_TIER = ranchExpansionTiers[0].tier
const MAX_EXPANSION_TIER = ranchExpansionTiers[ranchExpansionTiers.length - 1].tier

export function getDefaultExpansionTier(): ExpansionTierId {
  return MIN_EXPANSION_TIER
}

export function getMaxExpansionTier(): ExpansionTierId {
  return MAX_EXPANSION_TIER
}

export function getExpansionTierConfig(tier: number): RanchExpansionTierConfig | null {
  const normalizedTier = Math.floor(tier)
  if (!Number.isFinite(normalizedTier) || normalizedTier < MIN_EXPANSION_TIER) {
    return null
  }

  return ranchExpansionTiers[normalizedTier - 1] ?? null
}

export function getNextExpansionTierConfig(
  currentTier: number,
): RanchExpansionTierConfig | null {
  const normalizedTier = clampExpansionTier(currentTier)
  return getExpansionTierConfig(normalizedTier + 1)
}

export function clampExpansionTier(tier: number): ExpansionTierId {
  const normalizedTier = Number.isFinite(tier) ? Math.floor(tier) : MIN_EXPANSION_TIER
  if (normalizedTier < MIN_EXPANSION_TIER) {
    return MIN_EXPANSION_TIER
  }

  if (normalizedTier > MAX_EXPANSION_TIER) {
    return MAX_EXPANSION_TIER
  }

  return normalizedTier as ExpansionTierId
}
