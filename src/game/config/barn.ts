import {
  barnProcessingRecipeDefinitions,
  barnProcessingRecipeIds as sharedBarnProcessingRecipeIds,
} from './barnRecipes.shared.js'
import { getExpansionTierConfig, getMaxExpansionTier } from './expansion'
import {
  getUpgradeConfig,
  getUpgradeMaxLevel,
  type UpgradeId,
  type UpgradeLevels,
  upgradeIds,
} from './upgrades'

export interface BarnProcessingLineItem {
  itemId: string
  quantity: number
}

export type BarnProcessingRecipeUnlockRequirement =
  | {
      kind: 'expansion_tier'
      minTier: number
    }
  | {
      kind: 'upgrade_level'
      upgradeId: UpgradeId
      minLevel: number
    }

export interface BarnProcessingRecipeConfig {
  label: string
  description: string
  durationMs: number
  fee: number
  unlockRequirements: readonly BarnProcessingRecipeUnlockRequirement[]
  inputs: readonly BarnProcessingLineItem[]
  outputs: readonly BarnProcessingLineItem[]
}

type BarnProcessingRecipeDefinitionInput = Omit<
  BarnProcessingRecipeConfig,
  'unlockRequirements'
> & {
  unlockRequirements?: readonly unknown[]
}

export interface BarnRecipeProgressionSnapshot {
  expansionTier: number
  upgrades: Readonly<Partial<UpgradeLevels>>
}

export interface BarnProcessingRecipeUnlockState {
  recipeId: BarnProcessingRecipeId
  isUnlocked: boolean
  requirements: readonly BarnProcessingRecipeUnlockRequirement[]
  unmetRequirements: readonly BarnProcessingRecipeUnlockRequirement[]
  lockedReason: string | null
}

function validateLineItem(item: BarnProcessingLineItem, fieldName: string): BarnProcessingLineItem {
  if (item.itemId.trim().length === 0) {
    throw new Error(`Barn recipe ${fieldName} item id is required`)
  }

  if (!Number.isFinite(item.quantity) || Math.floor(item.quantity) !== item.quantity || item.quantity <= 0) {
    throw new Error(`Barn recipe ${fieldName} quantity must be a positive integer`)
  }

  return {
    itemId: item.itemId.trim(),
    quantity: item.quantity,
  }
}

function isUpgradeId(value: unknown): value is UpgradeId {
  return typeof value === 'string' && upgradeIds.includes(value as UpgradeId)
}

function validateUnlockRequirement(
  requirement: unknown,
  recipeLabel: string,
): BarnProcessingRecipeUnlockRequirement {
  if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) {
    throw new Error(`Barn recipe "${recipeLabel}" unlock requirement must be an object`)
  }

  const candidate = requirement as Partial<BarnProcessingRecipeUnlockRequirement>
  if (candidate.kind === 'expansion_tier') {
    const minTier = Math.floor(candidate.minTier ?? 0)
    if (
      !Number.isFinite(minTier) ||
      minTier < 1 ||
      minTier > getMaxExpansionTier()
    ) {
      throw new Error(
        `Barn recipe "${recipeLabel}" expansion unlock tier must be within configured ranch tiers`,
      )
    }

    return {
      kind: 'expansion_tier',
      minTier,
    }
  }

  if (candidate.kind === 'upgrade_level') {
    if (!isUpgradeId(candidate.upgradeId)) {
      throw new Error(`Barn recipe "${recipeLabel}" references unknown upgrade unlock`)
    }

    const minLevel = Math.floor(candidate.minLevel ?? 0)
    if (
      !Number.isFinite(minLevel) ||
      minLevel < 1 ||
      minLevel > getUpgradeMaxLevel(candidate.upgradeId)
    ) {
      throw new Error(
        `Barn recipe "${recipeLabel}" upgrade unlock level must be within configured upgrade levels`,
      )
    }

    return {
      kind: 'upgrade_level',
      upgradeId: candidate.upgradeId,
      minLevel,
    }
  }

  throw new Error(`Barn recipe "${recipeLabel}" has unknown unlock requirement kind`)
}

function defineBarnProcessingRecipe(
  config: BarnProcessingRecipeDefinitionInput,
): BarnProcessingRecipeConfig {
  if (config.label.trim().length === 0) {
    throw new Error('Barn recipe label is required')
  }

  if (config.description.trim().length === 0) {
    throw new Error('Barn recipe description is required')
  }

  if (!Number.isFinite(config.durationMs) || Math.floor(config.durationMs) !== config.durationMs || config.durationMs <= 0) {
    throw new Error('Barn recipe duration must be a positive integer')
  }

  if (!Number.isFinite(config.fee) || Math.floor(config.fee) !== config.fee || config.fee < 0) {
    throw new Error('Barn recipe fee must be a non-negative integer')
  }

  if (config.inputs.length === 0) {
    throw new Error('Barn recipe requires at least one input item')
  }

  if (config.outputs.length === 0) {
    throw new Error('Barn recipe requires at least one output item')
  }

  return {
    ...config,
    label: config.label.trim(),
    description: config.description.trim(),
    unlockRequirements: (config.unlockRequirements ?? []).map((requirement) =>
      validateUnlockRequirement(requirement, config.label),
    ),
    inputs: config.inputs.map((item) => validateLineItem(item, 'input')),
    outputs: config.outputs.map((item) => validateLineItem(item, 'output')),
  }
}

export const barnProcessingRecipeConfigs = {
  cheese_press: defineBarnProcessingRecipe(barnProcessingRecipeDefinitions.cheese_press),
  feed_mix: defineBarnProcessingRecipe(barnProcessingRecipeDefinitions.feed_mix),
  wool_bundle: defineBarnProcessingRecipe(barnProcessingRecipeDefinitions.wool_bundle),
} as const

export type BarnProcessingRecipeId = keyof typeof barnProcessingRecipeConfigs

export const barnProcessingRecipeIds = Object.freeze(
  sharedBarnProcessingRecipeIds as BarnProcessingRecipeId[],
)

export const barnProcessingRecipes = Object.freeze(
  barnProcessingRecipeIds.map((recipeId) => ({
    id: recipeId,
    ...barnProcessingRecipeConfigs[recipeId],
  })),
)

export function getBarnProcessingRecipeConfig(
  recipeId: BarnProcessingRecipeId,
): BarnProcessingRecipeConfig {
  return barnProcessingRecipeConfigs[recipeId]
}

export function describeBarnProcessingRecipeUnlockRequirement(
  requirement: BarnProcessingRecipeUnlockRequirement,
): string {
  if (requirement.kind === 'expansion_tier') {
    const tierConfig = getExpansionTierConfig(requirement.minTier)
    const tierLabel = tierConfig?.label ?? `Tier ${requirement.minTier}`
    return `Reach ${tierLabel} (Tier ${requirement.minTier})`
  }

  const upgradeConfig = getUpgradeConfig(requirement.upgradeId)
  return `Upgrade ${upgradeConfig.label} to level ${requirement.minLevel}`
}

export function getBarnProcessingRecipeUnlockState(
  recipeId: BarnProcessingRecipeId,
  progression: BarnRecipeProgressionSnapshot,
): BarnProcessingRecipeUnlockState {
  const recipe = getBarnProcessingRecipeConfig(recipeId)
  const unmetRequirements = recipe.unlockRequirements.filter((requirement) => {
    if (requirement.kind === 'expansion_tier') {
      return progression.expansionTier < requirement.minTier
    }

    return (progression.upgrades[requirement.upgradeId] ?? 0) < requirement.minLevel
  })
  const lockedReason =
    unmetRequirements.length > 0
      ? unmetRequirements.map(describeBarnProcessingRecipeUnlockRequirement).join('; ')
      : null

  return {
    recipeId,
    isUnlocked: unmetRequirements.length === 0,
    requirements: recipe.unlockRequirements,
    unmetRequirements,
    lockedReason,
  }
}
