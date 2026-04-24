import { getBarnProcessingRecipeConfig, type BarnProcessingRecipeId } from '../config/barn'
import { getAnimalProductionConfig } from '../config/animals'
import { offlineProgressConfig, type OfflineProgressConfig } from '../config/offlineProgress'
import { getCropSeedConfig } from '../config/crops'
import { getItemSellPrice } from '../config/economy'
import { resolveUpgradeEffects, type UpgradeEffectSnapshot } from '../config/upgrades'
import type {
  SaveAnimalStateV1,
  SaveBarnJobStateV1,
  SaveCropStateV1,
  SaveStateV1,
} from './save/schema'

export interface ReturnSessionRewardLineItem {
  itemId: string
  quantity: number
  estimatedSellValue: number
}

export interface ReturnSessionBarnReadyLineItem {
  recipeId: BarnProcessingRecipeId
  label: string
  quantity: number
}

export interface ReturnSessionSummary {
  offlineElapsedMs: number
  effectiveElapsedMs: number
  wasOfflineTimeCapped: boolean
  wasRewardCapReached: boolean
  totalItemsGranted: number
  totalEstimatedSellValue: number
  cropsHarvested: number
  animalProductsCollected: number
  barnJobsReady: number
  rewards: ReturnSessionRewardLineItem[]
  barnReadyRecipes: ReturnSessionBarnReadyLineItem[]
  generatedAtEpochMs: number
}

export interface OfflineProgressCatchUpResult {
  saveState: SaveStateV1
  summary: ReturnSessionSummary | null
}

function clampNumber(value: number, min: number, max: number): number {
  if (value <= min) {
    return min
  }

  if (value >= max) {
    return max
  }

  return value
}

function clampElapsedMs(
  elapsedMs: number,
  config: OfflineProgressConfig,
): { effectiveElapsedMs: number; wasOfflineTimeCapped: boolean } {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return {
      effectiveElapsedMs: 0,
      wasOfflineTimeCapped: false,
    }
  }

  const flooredElapsedMs = Math.floor(elapsedMs)
  const effectiveElapsedMs = Math.min(flooredElapsedMs, config.maximumElapsedMs)
  return {
    effectiveElapsedMs,
    wasOfflineTimeCapped: flooredElapsedMs > config.maximumElapsedMs,
  }
}

function resolveEffectiveCropGrowthMs(
  crop: SaveCropStateV1,
  upgradeEffects: UpgradeEffectSnapshot,
): number {
  const seedConfig = getCropSeedConfig(crop.seedId)
  const growthMultiplier = clampNumber(upgradeEffects.cropGrowthDurationMultiplier, 0.2, 5)

  return seedConfig.stageDurationsMs.reduce((total, stageDurationMs) => {
    return total + Math.max(1, Math.round(stageDurationMs * growthMultiplier))
  }, 0)
}

function estimateRewardSellValue(
  itemId: string,
  quantity: number,
  upgradeEffects: UpgradeEffectSnapshot,
): number {
  const baseUnitPrice = getItemSellPrice(itemId)
  const sellPriceMultiplier = clampNumber(upgradeEffects.sellPriceMultiplier, 0.2, 10)
  const effectiveUnitPrice = Math.max(1, Math.round(baseUnitPrice * sellPriceMultiplier))

  return quantity * effectiveUnitPrice
}

export function applyOfflineProgressCatchUp(
  inputSaveState: SaveStateV1,
  nowEpochMs: number,
  config: OfflineProgressConfig = offlineProgressConfig,
): OfflineProgressCatchUpResult {
  if (!config.enabled) {
    return {
      saveState: inputSaveState,
      summary: null,
    }
  }

  const safeNowEpochMs = Number.isFinite(nowEpochMs) ? Math.floor(nowEpochMs) : Date.now()
  const offlineElapsedMs = Math.max(0, safeNowEpochMs - inputSaveState.metadata.savedAtEpochMs)
  const { effectiveElapsedMs, wasOfflineTimeCapped } = clampElapsedMs(offlineElapsedMs, config)

  if (effectiveElapsedMs < config.minimumElapsedMs) {
    return {
      saveState: inputSaveState,
      summary: null,
    }
  }

  const cutoffEpochMs = inputSaveState.metadata.savedAtEpochMs + effectiveElapsedMs
  const nextInventory: Record<string, number> = { ...inputSaveState.inventory }
  const nextCrops: SaveCropStateV1[] = []
  const nextAnimals: SaveAnimalStateV1[] = []
  const nextBarnJobs: SaveBarnJobStateV1[] = []
  const rewardsByItem = new Map<string, number>()
  const barnReadyRecipes = new Map<BarnProcessingRecipeId, ReturnSessionBarnReadyLineItem>()
  const upgradeEffects = resolveUpgradeEffects(inputSaveState.progression.upgrades)

  let remainingRewardSlots = config.maxTotalRewardItems
  let remainingCropHarvestSlots = config.maxCropHarvests
  let remainingAnimalRewardSlots = config.maxAnimalProducts
  let cropsHarvested = 0
  let animalProductsCollected = 0
  let barnJobsReady = 0

  const canGrantReward = (isCropReward: boolean): boolean => {
    if (remainingRewardSlots <= 0) {
      return false
    }

    return isCropReward ? remainingCropHarvestSlots > 0 : remainingAnimalRewardSlots > 0
  }

  const grantReward = (itemId: string, quantity: number, isCropReward: boolean): void => {
    if (quantity <= 0) {
      return
    }

    nextInventory[itemId] = (nextInventory[itemId] ?? 0) + quantity
    rewardsByItem.set(itemId, (rewardsByItem.get(itemId) ?? 0) + quantity)
    remainingRewardSlots -= quantity

    if (isCropReward) {
      remainingCropHarvestSlots -= quantity
      cropsHarvested += quantity
      return
    }

    remainingAnimalRewardSlots -= quantity
    animalProductsCollected += quantity
  }

  for (const crop of inputSaveState.ranch.crops) {
    const cropMaturesAtEpochMs = crop.plantedAtEpochMs + resolveEffectiveCropGrowthMs(crop, upgradeEffects)
    const canAutoHarvestCrop = cropMaturesAtEpochMs <= cutoffEpochMs && canGrantReward(true)

    if (canAutoHarvestCrop) {
      const seedConfig = getCropSeedConfig(crop.seedId)
      grantReward(seedConfig.yieldItemId, 1, true)
      continue
    }

    nextCrops.push(crop)
  }

  for (const animal of inputSaveState.ranch.animals) {
    if (!animal.isActive) {
      nextAnimals.push(animal)
      continue
    }

    const configByAnimalId = getAnimalProductionConfig(animal.configId)
    const firstCycleDurationMs = animal.isFed
      ? configByAnimalId.fedProductionDurationMs
      : configByAnimalId.productionDurationMs
    let cycleStartedAtEpochMs = animal.cycleStartedAtEpochMs ?? inputSaveState.metadata.savedAtEpochMs
    let nextReadyAtEpochMs = animal.hasProductReady
      ? inputSaveState.metadata.savedAtEpochMs
      : animal.nextProductAtEpochMs ?? cycleStartedAtEpochMs + firstCycleDurationMs
    let hasProductReady = animal.hasProductReady
    let isFed = animal.isFed

    while (hasProductReady || nextReadyAtEpochMs <= cutoffEpochMs) {
      if (!canGrantReward(false)) {
        hasProductReady = true
        nextReadyAtEpochMs = Number.NaN
        break
      }

      const collectedAtEpochMs = hasProductReady
        ? inputSaveState.metadata.savedAtEpochMs
        : nextReadyAtEpochMs
      grantReward(configByAnimalId.productItemId, 1, false)

      hasProductReady = false
      isFed = false
      cycleStartedAtEpochMs = collectedAtEpochMs
      nextReadyAtEpochMs = collectedAtEpochMs + configByAnimalId.productionDurationMs
    }

    nextAnimals.push({
      ...animal,
      isFed,
      hasProductReady,
      cycleStartedAtEpochMs,
      nextProductAtEpochMs: hasProductReady ? null : nextReadyAtEpochMs,
    })
  }

  for (const job of inputSaveState.barn.jobs) {
    if (job.processedAtEpochMs !== null || job.readyAtEpochMs > cutoffEpochMs) {
      nextBarnJobs.push({
        ...job,
      })
      continue
    }

    barnJobsReady += 1

    const existingReadyRecipe = barnReadyRecipes.get(job.recipeId)
    if (existingReadyRecipe) {
      existingReadyRecipe.quantity += 1
    } else {
      barnReadyRecipes.set(job.recipeId, {
        recipeId: job.recipeId,
        label: getBarnProcessingRecipeConfig(job.recipeId).label,
        quantity: 1,
      })
    }

    nextBarnJobs.push({
      ...job,
      processedAtEpochMs: job.readyAtEpochMs,
    })
  }

  const rewards: ReturnSessionRewardLineItem[] = [...rewardsByItem.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([itemId, quantity]) => ({
      itemId,
      quantity,
      estimatedSellValue: estimateRewardSellValue(itemId, quantity, upgradeEffects),
    }))
  const readyBarnRecipes: ReturnSessionBarnReadyLineItem[] = [...barnReadyRecipes.values()].sort(
    (left, right) => {
      const labelComparison = left.label.localeCompare(right.label)
      if (labelComparison !== 0) {
        return labelComparison
      }

      return left.recipeId.localeCompare(right.recipeId)
    },
  )

  const totalItemsGranted = rewards.reduce((total, reward) => total + reward.quantity, 0)
  const totalEstimatedSellValue = rewards.reduce(
    (total, reward) => total + reward.estimatedSellValue,
    0,
  )

  const saveState: SaveStateV1 = {
    ...inputSaveState,
    inventory: nextInventory,
    barn: {
      jobs: nextBarnJobs,
    },
    ranch: {
      crops: nextCrops,
      animals: nextAnimals,
    },
  }

  if (totalItemsGranted <= 0 && barnJobsReady <= 0) {
    return {
      saveState,
      summary: null,
    }
  }

  const wasRewardCapReached =
    remainingRewardSlots <= 0 || remainingCropHarvestSlots <= 0 || remainingAnimalRewardSlots <= 0

  return {
    saveState,
    summary: {
      offlineElapsedMs,
      effectiveElapsedMs,
      wasOfflineTimeCapped,
      wasRewardCapReached,
      totalItemsGranted,
      totalEstimatedSellValue,
      cropsHarvested,
      animalProductsCollected,
      barnJobsReady,
      rewards,
      barnReadyRecipes: readyBarnRecipes,
      generatedAtEpochMs: safeNowEpochMs,
    },
  }
}
