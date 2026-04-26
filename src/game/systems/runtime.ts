import Phaser from 'phaser'

import { animalProductionConfigs } from '../config/animals'
import {
  barnProcessingRecipeConfigs,
  getBarnProcessingRecipeUnlockState,
  getBarnProcessingRecipeConfig,
  type BarnProcessingRecipeUnlockState,
  type BarnProcessingLineItem,
  type BarnProcessingRecipeId,
} from '../config/barn'
import {
  barnMarketOrderConfigs,
  getBarnMarketOrderConfig,
  type BarnMarketOrderId,
  type BarnMarketOrderLineItem,
} from '../config/barnMarketOrders'
import { cropSeedConfigs, defaultCropSeedId, type CropSeedId } from '../config/crops'
import {
  clampExpansionTier,
  getDefaultExpansionTier,
  getExpansionTierConfig,
  getMaxExpansionTier,
  getNextExpansionTierConfig,
  type ExpansionTierUnlockEffects,
} from '../config/expansion'
import {
  ftueConfig,
  getFtueStepConfig,
  getNextFtueStepId,
  isFtueStepId,
  type FtueProgressSignal,
  type FtueStepId,
} from '../config/ftue'
import {
  clampUpgradeLevel,
  createDefaultUpgradeLevels,
  getNextUpgradeLevelConfig,
  getUpgradeMaxLevel,
  normalizeUpgradeLevels,
  resolveUpgradeEffects,
  upgradeIds,
  type UpgradeEffectSnapshot,
  type UpgradeId,
  type UpgradeLevels,
} from '../config/upgrades'
import {
  calculateReturnObjectiveStreakReward,
  clampReturnObjectiveStreakTier,
  returnObjectiveStreakConfig,
} from '../config/returnObjectiveStreak'
import {
  getReturnObjectiveConfig,
  isReturnObjectiveId,
  returnObjectiveConfigs,
  type ReturnObjectiveId,
  type ReturnObjectiveMetric,
} from '../config/returnObjectives'
import { retentionFeatureFlags } from '../config/retentionFlags'
import {
  activeRetentionTuningPack,
  getRetentionTuningTelemetryPayload,
} from '../config/retentionTuningPack'
import { PLAYABLE_SCENES, SCENE_KEYS, type PlayableSceneKey } from '../constants'
import { PerformanceTracker } from './performance'
import {
  createFirstSessionFunnelTracker,
  type FirstSessionFunnelTracker,
} from './firstSessionFunnel'
import { applyOfflineProgressCatchUp, type ReturnSessionSummary } from './offlineProgress'
import {
  createLocalStorageSaveAdapter,
  type SaveStorageErrorCode,
  type SaveStorageAdapter,
  type SaveStorageReadResult,
} from './save/localStorageAdapter'
import {
  DEFAULT_BARN_JOB_SOURCE,
  DEFAULT_BARN_MARKET_ORDER_SOURCE,
  SAVE_SCHEMA_VERSION,
  type SaveAnimalStateV1,
  type SaveBarnJobStateV1,
  type SaveBarnMarketOrderStateV1,
  type SaveBarnStateV1,
  type SaveFtueBarnHandoffStateV1,
  type SaveCropStateV1,
  type SaveFtueStateV1,
  type SaveProgressionStateV1,
  type SaveReturnObjectiveStateV1,
  type SaveReturnObjectiveStreakStateV1,
  type SaveStateV1,
  createDefaultBarnSaveState,
  createDefaultFtueSaveState,
  createDefaultReturnObjectiveSaveState,
  createDefaultReturnObjectiveStreakSaveState,
} from './save/schema'
import type { TelemetryClient, TelemetryPayload } from './telemetry'

const REGISTRY_KEY = 'tiny-ranch:services'
const ACTIVE_SCENE_REGISTRY_KEY = 'tiny-ranch:active-scene'
const INVENTORY_REGISTRY_KEY = 'tiny-ranch:inventory'
const INVENTORY_CHANGED_EVENT = 'tiny-ranch:inventory-changed'
const CURRENCY_REGISTRY_KEY = 'tiny-ranch:currency'
const CURRENCY_CHANGED_EVENT = 'tiny-ranch:currency-changed'
const RANCH_ACTIVE_SEED_REGISTRY_KEY = 'tiny-ranch:ranch-active-seed'
const RANCH_CROPS_REGISTRY_KEY = 'tiny-ranch:ranch-crops'
const RANCH_ANIMALS_REGISTRY_KEY = 'tiny-ranch:ranch-animals'
const FTUE_STATE_REGISTRY_KEY = 'tiny-ranch:ftue-state'
const FTUE_CHANGED_EVENT = 'tiny-ranch:ftue-changed'
const RETURN_OBJECTIVE_STATE_REGISTRY_KEY = 'tiny-ranch:return-objective-state'
const RETURN_OBJECTIVE_CHANGED_EVENT = 'tiny-ranch:return-objective-changed'
const RETURN_OBJECTIVE_STREAK_STATE_REGISTRY_KEY = 'tiny-ranch:return-objective-streak-state'
const BARN_STATE_REGISTRY_KEY = 'tiny-ranch:barn-state'
const BARN_STATE_CHANGED_EVENT = 'tiny-ranch:barn-state-changed'
const EXPANSION_TIER_REGISTRY_KEY = 'tiny-ranch:expansion-tier'
const EXPANSION_TIER_CHANGED_EVENT = 'tiny-ranch:expansion-tier-changed'
const UPGRADE_LEVELS_REGISTRY_KEY = 'tiny-ranch:upgrade-levels'
const UPGRADE_LEVELS_CHANGED_EVENT = 'tiny-ranch:upgrade-levels-changed'

export type InventorySnapshot = Readonly<Record<string, number>>
export type CurrencyBalance = number

export interface RanchStateSnapshot {
  activeSeedId: CropSeedId
  crops: SaveCropStateV1[]
  animals: SaveAnimalStateV1[]
}

export interface InventoryChange {
  itemId: string
  quantity: number
  total: number
  timestampMs: number
}

export interface CurrencyChange {
  amount: number
  balance: CurrencyBalance
  reason: string
  timestampMs: number
}

export interface BarnMissingInput {
  itemId: string
  requiredQuantity: number
  availableQuantity: number
}

export interface BarnJobSnapshot {
  id: string
  recipeId: BarnProcessingRecipeId
  label: string
  description: string
  inputs: readonly BarnProcessingLineItem[]
  outputs: readonly BarnProcessingLineItem[]
  fee: number
  startedAtEpochMs: number
  readyAtEpochMs: number
  processedAtEpochMs: number | null
  source: string
  remainingMs: number
  isReady: boolean
}

export interface BarnMarketOrderSnapshot {
  orderId: BarnMarketOrderId
  label: string
  description: string
  requiredItems: readonly BarnMarketOrderLineItem[]
  payout: number
  baseSellValue: number
  premiumValue: number
  fulfilledAtEpochMs: number | null
  source: string
  isFulfilled: boolean
  isClaimable: boolean
}

export interface BarnStateSnapshot {
  jobs: BarnJobSnapshot[]
  marketOrders: BarnMarketOrderSnapshot[]
}

export interface BarnStartJobResult {
  result: 'started' | 'locked' | 'insufficient_items' | 'insufficient_funds'
  recipeId: BarnProcessingRecipeId
  unlockState: BarnProcessingRecipeUnlockState
  missingInputs: BarnMissingInput[]
  job: BarnJobSnapshot | null
  balance: CurrencyBalance
  state: BarnStateSnapshot
}

export interface BarnClaimJobResult {
  result: 'claimed' | 'processing' | 'not_found'
  jobId: string
  recipeId: BarnProcessingRecipeId | null
  outputs: BarnProcessingLineItem[]
  balance: CurrencyBalance
  state: BarnStateSnapshot
}

export interface BarnMarketOrderFulfillment {
  orderId: BarnMarketOrderId
  label: string
  requiredItems: readonly BarnMarketOrderLineItem[]
  payout: number
  baseSellValue: number
  premiumValue: number
  fulfilledAtEpochMs: number
}

export interface BarnMarketOrderFulfillmentResult {
  result: 'fulfilled' | 'none'
  fulfilledOrders: BarnMarketOrderFulfillment[]
  fulfilledOrderCount: number
  consumedQuantity: number
  totalPayout: number
  balance: CurrencyBalance
  inventory: InventorySnapshot
  state: BarnStateSnapshot
}

export type BarnHandoffNextAction =
  | 'complete_ftue'
  | 'unlock_barn'
  | 'gather_inputs'
  | 'earn_coins'
  | 'start_recipe'
  | 'wait_for_completion'
  | 'claim_output'
  | 'completed'

export interface BarnHandoffStateSnapshot {
  enabled: boolean
  handoffId: string | null
  targetRecipeId: BarnProcessingRecipeId | null
  targetRecipeLabel: string | null
  targetRecipeDescription: string | null
  requiredZoneId: string | null
  requiredZoneUnlocked: boolean
  isVisible: boolean
  isCompleted: boolean
  completedAtEpochMs: number | null
  activeJobCount: number
  readyJobCount: number
  missingInputs: BarnMissingInput[]
  missingCoins: number
  canStart: boolean
  nextAction: BarnHandoffNextAction
}

export interface FtueStateSnapshot {
  enabled: boolean
  currentStep: FtueStepId | null
  completedAtEpochMs: number | null
  isCompleted: boolean
  barnHandoff: BarnHandoffStateSnapshot
}

export interface ReturnObjectiveStateSnapshot {
  objectiveLoopEnabled: boolean
  streakBonusEnabled: boolean
  retentionKillSwitchEnabled: boolean
  activeObjectiveId: ReturnObjectiveId | null
  goalId: string | null
  title: string | null
  metric: ReturnObjectiveMetric | null
  barnRecipeId: BarnProcessingRecipeId | null
  targetValue: number
  rewardAmount: number
  progressValue: number
  assignedAtEpochMs: number | null
  completedAtEpochMs: number | null
  claimedAtEpochMs: number | null
  assignmentCycle: number
  isCompleted: boolean
  isClaimed: boolean
  streakTier: number
  streakMaxTier: number
  streakGraceWindowMs: number
  streakRewardMultiplier: number
  streakRewardBonusAmount: number
  claimRewardAmount: number
  nextStreakTier: number
  nextClaimRewardAmount: number
}

export interface ReturnObjectiveClaimResult {
  result: 'claimed' | 'not_completed' | 'already_claimed' | 'no_active_objective'
  rewardAmount: number
  balance: CurrencyBalance
  state: ReturnObjectiveStateSnapshot
}

export interface ExpansionStateSnapshot {
  currentTier: number
  maxTier: number
  nextTier: number | null
  nextCost: number | null
  unlocks: ExpansionTierUnlockEffects
  nextUnlocks: ExpansionTierUnlockEffects | null
}

export interface ExpansionPurchaseResult {
  result: 'purchased' | 'insufficient_funds' | 'max_tier'
  tierBefore: number
  tierAfter: number
  nextCost: number | null
  balance: CurrencyBalance
}

export interface UpgradeStateSnapshot {
  levels: Readonly<UpgradeLevels>
  effects: UpgradeEffectSnapshot
}

export interface UpgradePurchaseResult {
  result: 'purchased' | 'insufficient_funds' | 'max_level'
  upgradeId: UpgradeId
  levelBefore: number
  levelAfter: number
  nextCost: number | null
  balance: CurrencyBalance
}

export type InventoryChangeListener = (
  inventory: InventorySnapshot,
  change: InventoryChange,
) => void
export type CurrencyChangeListener = (balance: CurrencyBalance, change: CurrencyChange) => void
export type BarnStateChangeListener = (state: BarnStateSnapshot) => void
export type FtueStateChangeListener = (state: FtueStateSnapshot) => void
export type ReturnObjectiveStateChangeListener = (state: ReturnObjectiveStateSnapshot) => void
export type ExpansionStateChangeListener = (state: ExpansionStateSnapshot) => void
export type UpgradeStateChangeListener = (state: UpgradeStateSnapshot) => void

export interface InventorySaleResult {
  itemId: string
  soldQuantity: number
  unitPrice: number
  revenue: number
  remainingInventory: number
  balance: CurrencyBalance
}

export type SaveHydrationOutcome = 'hydrated' | 'empty' | 'fallback_default'

export interface SaveHydrationResult {
  outcome: SaveHydrationOutcome
  errorCode: SaveStorageErrorCode | null
  startupScene: PlayableSceneKey
}

export type ReturnSessionSummaryDismissSource =
  | 'continue_button'
  | 'close_button'
  | 'keyboard_escape'
  | 'backdrop_tap'
  | 'unknown'

type SaveAgeBucket =
  | 'none'
  | 'lt_1m'
  | '1m_to_10m'
  | '10m_to_1h'
  | '1h_to_24h'
  | 'gte_24h'
  | 'unknown'

type SaveAnalyticsMetadata = TelemetryPayload & {
  schemaVersion: number | string | null
  saveAgeBucket: SaveAgeBucket
}

const EMPTY_SAVE_ANALYTICS_METADATA: SaveAnalyticsMetadata = {
  schemaVersion: null,
  saveAgeBucket: 'none',
}

const UNKNOWN_SAVE_ANALYTICS_METADATA: SaveAnalyticsMetadata = {
  schemaVersion: 'unknown',
  saveAgeBucket: 'unknown',
}

export interface GameServices {
  telemetry: TelemetryClient
  performance: PerformanceTracker
  firstSessionFunnel: FirstSessionFunnelTracker
  navigate: (sceneKey: PlayableSceneKey) => void
  getActiveScene: () => PlayableSceneKey | null
  getPreferredStartupScene: () => PlayableSceneKey
  hydrateSavedGameStateOnBoot: () => SaveHydrationResult
  addInventoryItem: (itemId: string, quantity?: number) => number
  removeInventoryItem: (itemId: string, quantity?: number) => number
  sellInventoryItem: (itemId: string, quantity: number, unitPrice: number, reason?: string) => InventorySaleResult
  getInventorySnapshot: () => InventorySnapshot
  onInventoryChanged: (listener: InventoryChangeListener) => () => void
  addCurrency: (amount: number, reason?: string) => CurrencyBalance
  getCurrencyBalance: () => CurrencyBalance
  onCurrencyChanged: (listener: CurrencyChangeListener) => () => void
  getBarnStateSnapshot: () => BarnStateSnapshot
  getBarnRecipeUnlockState: (
    recipeId: BarnProcessingRecipeId,
  ) => BarnProcessingRecipeUnlockState
  startBarnJob: (recipeId: BarnProcessingRecipeId, source?: string) => BarnStartJobResult
  claimBarnJob: (jobId: string, source?: string) => BarnClaimJobResult
  fulfillBarnMarketOrders: (source?: string) => BarnMarketOrderFulfillmentResult
  onBarnStateChanged: (listener: BarnStateChangeListener) => () => void
  getExpansionStateSnapshot: () => ExpansionStateSnapshot
  purchaseNextExpansionTier: (source?: string) => ExpansionPurchaseResult
  onExpansionStateChanged: (listener: ExpansionStateChangeListener) => () => void
  getUpgradeStateSnapshot: () => UpgradeStateSnapshot
  purchaseUpgrade: (upgradeId: UpgradeId, source?: string) => UpgradePurchaseResult
  onUpgradeStateChanged: (listener: UpgradeStateChangeListener) => () => void
  getFtueStateSnapshot: () => FtueStateSnapshot
  getBarnHandoffStateSnapshot: () => BarnHandoffStateSnapshot
  advanceFtue: (signal: FtueProgressSignal) => FtueStateSnapshot
  onFtueStateChanged: (listener: FtueStateChangeListener) => () => void
  getReturnObjectiveStateSnapshot: () => ReturnObjectiveStateSnapshot
  progressReturnObjective: (
    metric: ReturnObjectiveMetric,
    amount?: number,
    source?: string,
  ) => ReturnObjectiveStateSnapshot
  claimReturnObjectiveReward: (source?: string) => ReturnObjectiveClaimResult
  onReturnObjectiveStateChanged: (listener: ReturnObjectiveStateChangeListener) => () => void
  getRanchStateSnapshot: () => RanchStateSnapshot
  setRanchStateSnapshot: (snapshot: RanchStateSnapshot) => void
  getPendingReturnSessionSummary: () => ReturnSessionSummary | null
  dismissReturnSessionSummary: (
    source?: ReturnSessionSummaryDismissSource,
  ) => ReturnSessionSummary | null
  saveGameState: () => SaveStateV1
  readSavedGameState: () => SaveStorageReadResult
  resetSavedGameState: () => void
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteInteger(value) && value >= 0
}

function isCropSeedId(value: unknown): value is CropSeedId {
  return typeof value === 'string' && Object.hasOwn(cropSeedConfigs, value)
}

function isBarnProcessingRecipeId(value: unknown): value is BarnProcessingRecipeId {
  return typeof value === 'string' && Object.hasOwn(barnProcessingRecipeConfigs, value)
}

function isBarnMarketOrderId(value: unknown): value is BarnMarketOrderId {
  return typeof value === 'string' && Object.hasOwn(barnMarketOrderConfigs, value)
}

function isSaveCropState(value: unknown): value is SaveCropStateV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const crop = value as Partial<SaveCropStateV1>
  return (
    isCropSeedId(crop.seedId) &&
    isNonNegativeInteger(crop.tileX) &&
    isNonNegativeInteger(crop.tileY) &&
    isNonNegativeInteger(crop.plantedAtEpochMs) &&
    isNonNegativeInteger(crop.stageIndex)
  )
}

function isSaveAnimalState(value: unknown): value is SaveAnimalStateV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const animal = value as Partial<SaveAnimalStateV1>
  return (
    typeof animal.id === 'string' &&
    animal.id.trim().length > 0 &&
    typeof animal.configId === 'string' &&
    Object.hasOwn(animalProductionConfigs, animal.configId) &&
    isNonNegativeInteger(animal.tileX) &&
    isNonNegativeInteger(animal.tileY) &&
    typeof animal.isActive === 'boolean' &&
    typeof animal.isFed === 'boolean' &&
    typeof animal.hasProductReady === 'boolean' &&
    (animal.cycleStartedAtEpochMs === null || isNonNegativeInteger(animal.cycleStartedAtEpochMs)) &&
    (animal.nextProductAtEpochMs === null || isNonNegativeInteger(animal.nextProductAtEpochMs))
  )
}

function isSaveFtueState(value: unknown): value is SaveFtueStateV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const ftue = value as Partial<SaveFtueStateV1>
  const hasValidStep = ftue.currentStep === null || isFtueStepId(ftue.currentStep)
  const hasValidCompletionTimestamp =
    ftue.completedAtEpochMs === null || isNonNegativeInteger(ftue.completedAtEpochMs)
  const hasValidBarnHandoff =
    ftue.barnHandoff === undefined || isSaveFtueBarnHandoffState(ftue.barnHandoff)

  return hasValidStep && hasValidCompletionTimestamp && hasValidBarnHandoff
}

function isSaveFtueBarnHandoffState(
  value: unknown,
): value is SaveFtueBarnHandoffStateV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const handoff = value as Partial<SaveFtueBarnHandoffStateV1>
  return (
    handoff.completedAtEpochMs === undefined ||
    handoff.completedAtEpochMs === null ||
    isNonNegativeInteger(handoff.completedAtEpochMs)
  )
}

function isSaveBarnJobState(value: unknown): value is SaveBarnJobStateV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const job = value as Partial<SaveBarnJobStateV1>
  return (
    typeof job.id === 'string' &&
    job.id.trim().length > 0 &&
    isBarnProcessingRecipeId(job.recipeId) &&
    isNonNegativeInteger(job.startedAtEpochMs) &&
    isNonNegativeInteger(job.readyAtEpochMs) &&
    job.readyAtEpochMs >= job.startedAtEpochMs
  )
}

function isSaveBarnMarketOrderState(value: unknown): value is SaveBarnMarketOrderStateV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const order = value as Partial<SaveBarnMarketOrderStateV1>
  return (
    isBarnMarketOrderId(order.orderId) &&
    (order.fulfilledAtEpochMs === null || isNonNegativeInteger(order.fulfilledAtEpochMs))
  )
}

function normalizeBarnJobSource(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_BARN_JOB_SOURCE
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : DEFAULT_BARN_JOB_SOURCE
}

function normalizeBarnMarketOrderSource(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_BARN_MARKET_ORDER_SOURCE
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : DEFAULT_BARN_MARKET_ORDER_SOURCE
}

function normalizeBarnProcessedAtEpochMs(
  value: unknown,
  readyAtEpochMs: number,
): number | null {
  if (!isNonNegativeInteger(value) || value < readyAtEpochMs) {
    return null
  }

  return value
}

function cloneBarnLineItem(item: BarnProcessingLineItem): BarnProcessingLineItem {
  return {
    itemId: item.itemId,
    quantity: item.quantity,
  }
}

function cloneBarnMarketOrderLineItem(
  item: BarnMarketOrderLineItem,
): BarnMarketOrderLineItem {
  return {
    itemId: item.itemId,
    quantity: item.quantity,
  }
}

function cloneCropState(crop: SaveCropStateV1): SaveCropStateV1 {
  return {
    seedId: crop.seedId,
    tileX: crop.tileX,
    tileY: crop.tileY,
    plantedAtEpochMs: crop.plantedAtEpochMs,
    stageIndex: crop.stageIndex,
  }
}

function cloneAnimalState(animal: SaveAnimalStateV1): SaveAnimalStateV1 {
  return {
    id: animal.id,
    configId: animal.configId,
    tileX: animal.tileX,
    tileY: animal.tileY,
    isActive: animal.isActive,
    isFed: animal.isFed,
    hasProductReady: animal.hasProductReady,
    cycleStartedAtEpochMs: animal.cycleStartedAtEpochMs,
    nextProductAtEpochMs: animal.nextProductAtEpochMs,
  }
}

function cloneBarnJobState(job: SaveBarnJobStateV1): SaveBarnJobStateV1 {
  return {
    id: job.id,
    recipeId: job.recipeId,
    startedAtEpochMs: job.startedAtEpochMs,
    readyAtEpochMs: job.readyAtEpochMs,
    processedAtEpochMs: normalizeBarnProcessedAtEpochMs(
      job.processedAtEpochMs,
      job.readyAtEpochMs,
    ),
    source: normalizeBarnJobSource(job.source),
  }
}

function cloneBarnMarketOrderState(
  order: SaveBarnMarketOrderStateV1,
): SaveBarnMarketOrderStateV1 {
  return {
    orderId: order.orderId,
    fulfilledAtEpochMs:
      order.fulfilledAtEpochMs === null || isNonNegativeInteger(order.fulfilledAtEpochMs)
        ? order.fulfilledAtEpochMs
        : null,
    source: normalizeBarnMarketOrderSource(order.source),
  }
}

function cloneExpansionUnlockEffects(unlocks: ExpansionTierUnlockEffects): ExpansionTierUnlockEffects {
  return {
    cropTileCapacity: unlocks.cropTileCapacity,
    animalSlotCapacity: unlocks.animalSlotCapacity,
    unlockedZoneIds: [...unlocks.unlockedZoneIds],
  }
}

function normalizeFtueState(state: SaveFtueStateV1): SaveFtueStateV1 {
  const normalizedStep = state.currentStep === null || isFtueStepId(state.currentStep)
    ? state.currentStep
    : createDefaultFtueSaveState().currentStep
  const normalizedCompletedAt =
    state.completedAtEpochMs === null || isNonNegativeInteger(state.completedAtEpochMs)
      ? state.completedAtEpochMs
      : null
  const barnHandoff = normalizeFtueBarnHandoffState(state.barnHandoff)

  if (normalizedStep !== null) {
    return {
      currentStep: normalizedStep,
      completedAtEpochMs: null,
      barnHandoff,
    }
  }

  return {
    currentStep: null,
    completedAtEpochMs: normalizedCompletedAt ?? Date.now(),
    barnHandoff,
  }
}

function normalizeFtueBarnHandoffState(
  state: SaveFtueBarnHandoffStateV1 | undefined,
): SaveFtueBarnHandoffStateV1 {
  const rawCompletedAt = state?.completedAtEpochMs
  const completedAtEpochMs =
    rawCompletedAt === null || isNonNegativeInteger(rawCompletedAt)
      ? rawCompletedAt
      : null

  return {
    completedAtEpochMs,
  }
}

function normalizeInventorySnapshot(inventory: Record<string, number>): Record<string, number> {
  const normalized: Record<string, number> = {}

  for (const [itemId, quantity] of Object.entries(inventory)) {
    if (itemId.trim().length === 0) {
      continue
    }

    if (!isNonNegativeInteger(quantity)) {
      continue
    }

    if (quantity > 0) {
      normalized[itemId] = quantity
    }
  }

  return normalized
}

function normalizeBarnSaveState(state: SaveBarnStateV1): SaveBarnStateV1 {
  const jobs: SaveBarnJobStateV1[] = []
  const seenIds = new Set<string>()

  for (const job of state.jobs) {
    if (!isSaveBarnJobState(job) || seenIds.has(job.id)) {
      continue
    }

    seenIds.add(job.id)
    jobs.push(cloneBarnJobState(job))
  }

  jobs.sort((left, right) => {
    if (left.readyAtEpochMs !== right.readyAtEpochMs) {
      return left.readyAtEpochMs - right.readyAtEpochMs
    }

    return left.startedAtEpochMs - right.startedAtEpochMs
  })

  const ordersById = new Map<BarnMarketOrderId, SaveBarnMarketOrderStateV1>()
  const marketOrders = Array.isArray(state.marketOrders) ? state.marketOrders : []
  for (const order of marketOrders) {
    if (!isSaveBarnMarketOrderState(order) || ordersById.has(order.orderId)) {
      continue
    }

    ordersById.set(order.orderId, cloneBarnMarketOrderState(order))
  }

  return {
    jobs,
    marketOrders: createDefaultBarnSaveState().marketOrders.map((defaultOrder) => {
      const savedOrder = ordersById.get(defaultOrder.orderId)
      return savedOrder ? cloneBarnMarketOrderState(savedOrder) : defaultOrder
    }),
  }
}

function formatBarnLineItems(items: readonly BarnProcessingLineItem[]): string {
  return items.map((item) => `${item.itemId}:${item.quantity}`).join(',')
}

function formatBarnMarketOrderLineItems(items: readonly BarnMarketOrderLineItem[]): string {
  return items.map((item) => `${item.itemId}:${item.quantity}`).join(',')
}

function normalizeNullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }

  if (!isNonNegativeInteger(value)) {
    return null
  }

  return value
}

function normalizeReturnObjectiveState(state: SaveReturnObjectiveStateV1): SaveReturnObjectiveStateV1 {
  const assignmentCycle = isNonNegativeInteger(state.assignmentCycle) ? state.assignmentCycle : 0
  const activeObjectiveId = isReturnObjectiveId(state.activeObjectiveId)
    ? state.activeObjectiveId
    : null

  if (activeObjectiveId === null) {
    return {
      activeObjectiveId: null,
      progressValue: 0,
      assignedAtEpochMs: null,
      completedAtEpochMs: null,
      claimedAtEpochMs: null,
      assignmentCycle,
    }
  }

  const objectiveConfig = getReturnObjectiveConfig(activeObjectiveId)
  const progressValue = isNonNegativeInteger(state.progressValue)
    ? Math.min(state.progressValue, objectiveConfig.targetValue)
    : 0
  const assignedAtEpochMs = normalizeNullableTimestamp(state.assignedAtEpochMs)
  const claimedAtEpochMs = normalizeNullableTimestamp(state.claimedAtEpochMs)
  const completedAtEpochMs = normalizeNullableTimestamp(state.completedAtEpochMs) ?? claimedAtEpochMs

  return {
    activeObjectiveId,
    progressValue,
    assignedAtEpochMs,
    completedAtEpochMs,
    claimedAtEpochMs,
    assignmentCycle,
  }
}

function normalizeReturnObjectiveStreakState(
  state: SaveReturnObjectiveStreakStateV1,
): SaveReturnObjectiveStreakStateV1 {
  const tier = clampReturnObjectiveStreakTier(state.tier)
  const lastClaimedAtEpochMs = normalizeNullableTimestamp(state.lastClaimedAtEpochMs)

  if (tier <= 0) {
    return {
      tier: 0,
      lastClaimedAtEpochMs,
    }
  }

  return {
    tier,
    lastClaimedAtEpochMs,
  }
}

interface ReturnObjectiveStreakDecayResolution {
  effectiveTier: number
  didDecay: boolean
  elapsedMsSinceClaim: number | null
  missedGraceWindows: number
}

function resolveReturnObjectiveStreakDecay(
  state: SaveReturnObjectiveStreakStateV1,
  nowEpochMs: number,
): ReturnObjectiveStreakDecayResolution {
  const normalized = normalizeReturnObjectiveStreakState(state)
  if (normalized.tier <= 0 || normalized.lastClaimedAtEpochMs === null) {
    return {
      effectiveTier: 0,
      didDecay: false,
      elapsedMsSinceClaim: null,
      missedGraceWindows: 0,
    }
  }

  const elapsedMsSinceClaim = Math.max(0, nowEpochMs - normalized.lastClaimedAtEpochMs)
  if (elapsedMsSinceClaim <= returnObjectiveStreakConfig.graceWindowMs) {
    return {
      effectiveTier: normalized.tier,
      didDecay: false,
      elapsedMsSinceClaim,
      missedGraceWindows: 0,
    }
  }

  const missedGraceWindows = Math.max(
    1,
    Math.floor(elapsedMsSinceClaim / returnObjectiveStreakConfig.graceWindowMs),
  )
  const effectiveTier = clampReturnObjectiveStreakTier(normalized.tier - missedGraceWindows)

  return {
    effectiveTier,
    didDecay: effectiveTier < normalized.tier,
    elapsedMsSinceClaim,
    missedGraceWindows,
  }
}

function resolveReturnObjectiveSeed(progression: SaveProgressionStateV1): number {
  let seed = progression.expansionTier * 17

  for (let index = 0; index < upgradeIds.length; index += 1) {
    const upgradeId = upgradeIds[index]
    const level = progression.upgrades[upgradeId] ?? 0
    seed += level * (index + 3) * 11
  }

  for (const char of progression.activeSeedId) {
    seed += char.charCodeAt(0)
  }

  return Math.max(0, seed)
}

function resolveDeterministicReturnObjectiveId(
  progression: SaveProgressionStateV1,
  assignmentCycle: number,
): ReturnObjectiveId {
  const configCount = returnObjectiveConfigs.length
  const normalizedCycle = isNonNegativeInteger(assignmentCycle) ? assignmentCycle : 0
  const index = (resolveReturnObjectiveSeed(progression) + normalizedCycle) % configCount
  const objective = returnObjectiveConfigs[index]
  if (!objective) {
    throw new Error('Failed to resolve deterministic return objective')
  }

  return objective.id
}

function createEmptyReturnObjectiveSnapshot(
  assignmentCycle: number,
  streakTier: number,
  objectiveLoopEnabled: boolean,
  streakBonusEnabled: boolean,
): ReturnObjectiveStateSnapshot {
  const effectiveStreakTier = streakBonusEnabled ? clampReturnObjectiveStreakTier(streakTier) : 0
  const streakReward = calculateReturnObjectiveStreakReward(0, effectiveStreakTier)
  const nextStreakTier = streakBonusEnabled ? clampReturnObjectiveStreakTier(streakReward.streakTier + 1) : 0
  return {
    objectiveLoopEnabled,
    streakBonusEnabled,
    retentionKillSwitchEnabled: retentionFeatureFlags.retentionKillSwitchEnabled,
    activeObjectiveId: null,
    goalId: null,
    title: null,
    metric: null,
    barnRecipeId: null,
    targetValue: 0,
    rewardAmount: 0,
    progressValue: 0,
    assignedAtEpochMs: null,
    completedAtEpochMs: null,
    claimedAtEpochMs: null,
    assignmentCycle,
    isCompleted: false,
    isClaimed: false,
    streakTier: streakReward.streakTier,
    streakMaxTier: returnObjectiveStreakConfig.maxTier,
    streakGraceWindowMs: returnObjectiveStreakConfig.graceWindowMs,
    streakRewardMultiplier: streakReward.rewardMultiplier,
    streakRewardBonusAmount: 0,
    claimRewardAmount: 0,
    nextStreakTier,
    nextClaimRewardAmount: 0,
  }
}

function buildReturnObjectiveSnapshot(
  state: SaveReturnObjectiveStateV1,
  streakState: SaveReturnObjectiveStreakStateV1,
  nowEpochMs: number = Date.now(),
): ReturnObjectiveStateSnapshot {
  const objectiveLoopEnabled = retentionFeatureFlags.objectiveLoopUiEnabled
  const streakBonusEnabled = retentionFeatureFlags.streakBonusEnabled
  const normalized = normalizeReturnObjectiveState(state)
  if (!objectiveLoopEnabled) {
    return createEmptyReturnObjectiveSnapshot(
      normalized.assignmentCycle,
      0,
      objectiveLoopEnabled,
      streakBonusEnabled,
    )
  }

  const streakDecay = resolveReturnObjectiveStreakDecay(streakState, nowEpochMs)
  const streakTier = streakBonusEnabled ? streakDecay.effectiveTier : 0
  const nextStreakTier = streakBonusEnabled ? clampReturnObjectiveStreakTier(streakTier + 1) : 0
  if (normalized.activeObjectiveId === null) {
    return createEmptyReturnObjectiveSnapshot(
      normalized.assignmentCycle,
      streakTier,
      objectiveLoopEnabled,
      streakBonusEnabled,
    )
  }

  const objectiveConfig = getReturnObjectiveConfig(normalized.activeObjectiveId)
  const progressValue = Math.min(normalized.progressValue, objectiveConfig.targetValue)
  const isCompleted =
    normalized.completedAtEpochMs !== null || progressValue >= objectiveConfig.targetValue
  const isClaimed = normalized.claimedAtEpochMs !== null
  const streakReward = calculateReturnObjectiveStreakReward(objectiveConfig.rewardAmount, streakTier)
  const nextStreakReward = calculateReturnObjectiveStreakReward(
    objectiveConfig.rewardAmount,
    nextStreakTier,
  )

  return {
    objectiveLoopEnabled,
    streakBonusEnabled,
    retentionKillSwitchEnabled: retentionFeatureFlags.retentionKillSwitchEnabled,
    activeObjectiveId: normalized.activeObjectiveId,
    goalId: objectiveConfig.goalId,
    title: objectiveConfig.title,
    metric: objectiveConfig.metric,
    barnRecipeId: objectiveConfig.barnRecipeId,
    targetValue: objectiveConfig.targetValue,
    rewardAmount: objectiveConfig.rewardAmount,
    progressValue,
    assignedAtEpochMs: normalized.assignedAtEpochMs,
    completedAtEpochMs: normalized.completedAtEpochMs,
    claimedAtEpochMs: normalized.claimedAtEpochMs,
    assignmentCycle: normalized.assignmentCycle,
    isCompleted,
    isClaimed,
    streakTier: streakReward.streakTier,
    streakMaxTier: returnObjectiveStreakConfig.maxTier,
    streakGraceWindowMs: returnObjectiveStreakConfig.graceWindowMs,
    streakRewardMultiplier: streakReward.rewardMultiplier,
    streakRewardBonusAmount: streakReward.streakBonusAmount,
    claimRewardAmount: streakReward.totalRewardAmount,
    nextStreakTier,
    nextClaimRewardAmount: nextStreakReward.totalRewardAmount,
  }
}

function resolveSaveAgeBucket(savedAtEpochMs: number): SaveAgeBucket {
  const ageMs = Math.max(0, Date.now() - savedAtEpochMs)

  if (ageMs < 60_000) {
    return 'lt_1m'
  }

  if (ageMs < 10 * 60_000) {
    return '1m_to_10m'
  }

  if (ageMs < 60 * 60_000) {
    return '10m_to_1h'
  }

  if (ageMs < 24 * 60 * 60_000) {
    return '1h_to_24h'
  }

  return 'gte_24h'
}

function buildSaveAnalyticsMetadata(saveState: SaveStateV1): SaveAnalyticsMetadata {
  const schemaVersion = isFiniteInteger(saveState.schemaVersion)
    ? saveState.schemaVersion
    : 'unknown'
  const savedAtEpochMs = saveState.metadata.savedAtEpochMs

  if (!isNonNegativeInteger(savedAtEpochMs)) {
    return {
      schemaVersion,
      saveAgeBucket: 'unknown',
    }
  }

  return {
    schemaVersion,
    saveAgeBucket: resolveSaveAgeBucket(savedAtEpochMs),
  }
}

function createBarnJobId(recipeId: BarnProcessingRecipeId, index: number, timestampMs: number): string {
  return `barn-job:${recipeId}:${timestampMs}:${index}`
}

function formatReturnSessionRewards(summary: ReturnSessionSummary): string {
  return summary.rewards.map((reward) => `${reward.itemId}:${reward.quantity}`).join(',')
}

export function createGameServices(
  game: Phaser.Game,
  telemetry: TelemetryClient,
  performance: PerformanceTracker,
): GameServices {
  let trackedFirstPlayableScene = false
  let suppressSaveWrites = false
  let preferredStartupScene: PlayableSceneKey = SCENE_KEYS.ranch
  let bootHydrationResult: SaveHydrationResult | null = null
  let pendingReturnSessionSummary: ReturnSessionSummary | null = null
  const saveStorage: SaveStorageAdapter = createLocalStorageSaveAdapter()

  const setDefaultRuntimeState = (): void => {
    game.registry.set(INVENTORY_REGISTRY_KEY, {})
    game.registry.set(CURRENCY_REGISTRY_KEY, 0)
    game.registry.set(RANCH_ACTIVE_SEED_REGISTRY_KEY, defaultCropSeedId)
    game.registry.set(RANCH_CROPS_REGISTRY_KEY, [])
    game.registry.set(RANCH_ANIMALS_REGISTRY_KEY, [])
    game.registry.set(FTUE_STATE_REGISTRY_KEY, createDefaultFtueSaveState())
    game.registry.set(RETURN_OBJECTIVE_STATE_REGISTRY_KEY, createDefaultReturnObjectiveSaveState())
    game.registry.set(
      RETURN_OBJECTIVE_STREAK_STATE_REGISTRY_KEY,
      createDefaultReturnObjectiveStreakSaveState(),
    )
    game.registry.set(BARN_STATE_REGISTRY_KEY, createDefaultBarnSaveState())
    game.registry.set(EXPANSION_TIER_REGISTRY_KEY, getDefaultExpansionTier())
    game.registry.set(UPGRADE_LEVELS_REGISTRY_KEY, createDefaultUpgradeLevels())
    game.registry.set(ACTIVE_SCENE_REGISTRY_KEY, null)
  }

  setDefaultRuntimeState()
  const retentionTuningTelemetryPayload = getRetentionTuningTelemetryPayload()

  telemetry.track('retention_tuning_pack_loaded', {
    requestedTuningPackId: activeRetentionTuningPack.requestedPackId,
    tuningPackId: retentionTuningTelemetryPayload.tuningPackId,
    tuningPackVersion: retentionTuningTelemetryPayload.tuningPackVersion,
    fallbackReason: retentionTuningTelemetryPayload.fallbackReason,
    eventTimestampMs: Date.now(),
  })

  const readInventoryState = (): Record<string, number> => {
    const state = game.registry.get(INVENTORY_REGISTRY_KEY)
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return {}
    }

    return normalizeInventorySnapshot({ ...(state as Record<string, number>) })
  }

  const getInventorySnapshot = (): InventorySnapshot => {
    return Object.freeze(readInventoryState())
  }

  const readCurrencyBalance = (): CurrencyBalance => {
    const value = game.registry.get(CURRENCY_REGISTRY_KEY)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return 0
    }

    return Math.floor(value)
  }

  const getCurrencyBalance = (): CurrencyBalance => {
    return readCurrencyBalance()
  }

  const readBarnSaveState = (): SaveBarnStateV1 => {
    const rawState = game.registry.get(BARN_STATE_REGISTRY_KEY)
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
      return createDefaultBarnSaveState()
    }

    const rawJobs = Array.isArray((rawState as Partial<SaveBarnStateV1>).jobs)
      ? ((rawState as Partial<SaveBarnStateV1>).jobs as unknown[])
      : []
    const rawMarketOrders = Array.isArray((rawState as Partial<SaveBarnStateV1>).marketOrders)
      ? ((rawState as Partial<SaveBarnStateV1>).marketOrders as unknown[])
      : createDefaultBarnSaveState().marketOrders

    return normalizeBarnSaveState({
      jobs: rawJobs.filter(isSaveBarnJobState).map((job) => cloneBarnJobState(job)),
      marketOrders: rawMarketOrders
        .filter(isSaveBarnMarketOrderState)
        .map((order) => cloneBarnMarketOrderState(order)),
    })
  }

  const buildBarnJobSnapshot = (
    job: SaveBarnJobStateV1,
    nowEpochMs: number = Date.now(),
  ): BarnJobSnapshot => {
    const recipe = getBarnProcessingRecipeConfig(job.recipeId)
    const remainingMs = Math.max(0, job.readyAtEpochMs - nowEpochMs)

    return {
      id: job.id,
      recipeId: job.recipeId,
      label: recipe.label,
      description: recipe.description,
      inputs: recipe.inputs.map((item) => cloneBarnLineItem(item)),
      outputs: recipe.outputs.map((item) => cloneBarnLineItem(item)),
      fee: recipe.fee,
      startedAtEpochMs: job.startedAtEpochMs,
      readyAtEpochMs: job.readyAtEpochMs,
      processedAtEpochMs: job.processedAtEpochMs,
      source: job.source,
      remainingMs,
      isReady: remainingMs === 0,
    }
  }

  const canFulfillBarnMarketOrder = (
    requiredItems: readonly BarnMarketOrderLineItem[],
    inventory: Readonly<Record<string, number>>,
  ): boolean => {
    return requiredItems.every((item) => (inventory[item.itemId] ?? 0) >= item.quantity)
  }

  const buildBarnMarketOrderSnapshot = (
    order: SaveBarnMarketOrderStateV1,
    inventory: Readonly<Record<string, number>>,
  ): BarnMarketOrderSnapshot => {
    const config = getBarnMarketOrderConfig(order.orderId)
    const requiredItems = config.requiredItems.map((item) => cloneBarnMarketOrderLineItem(item))
    const isFulfilled = order.fulfilledAtEpochMs !== null

    return {
      orderId: order.orderId,
      label: config.label,
      description: config.description,
      requiredItems,
      payout: config.payout,
      baseSellValue: config.baseSellValue,
      premiumValue: config.premiumValue,
      fulfilledAtEpochMs: order.fulfilledAtEpochMs,
      source: order.source,
      isFulfilled,
      isClaimable: !isFulfilled && canFulfillBarnMarketOrder(requiredItems, inventory),
    }
  }

  const buildBarnStateSnapshot = (
    state: SaveBarnStateV1 = readBarnSaveState(),
    nowEpochMs: number = Date.now(),
  ): BarnStateSnapshot => {
    const inventory = readInventoryState()
    return {
      jobs: state.jobs.map((job) => buildBarnJobSnapshot(job, nowEpochMs)),
      marketOrders: state.marketOrders.map((order) =>
        buildBarnMarketOrderSnapshot(order, inventory),
      ),
    }
  }

  const getBarnStateSnapshot = (): BarnStateSnapshot => {
    return buildBarnStateSnapshot(reconcileProcessedBarnJobs())
  }

  const commitInventoryState = (
    nextInventory: Record<string, number>,
    changes: readonly InventoryChange[],
    options: {
      persist?: boolean
    } = {},
  ): Record<string, number> => {
    const normalized = normalizeInventorySnapshot(nextInventory)
    game.registry.set(INVENTORY_REGISTRY_KEY, normalized)

    for (const change of changes) {
      game.events.emit(INVENTORY_CHANGED_EVENT, change)
    }

    if (options.persist !== false) {
      persistCurrentState()
    }

    return normalized
  }

  const commitCurrencyBalance = (
    nextBalance: CurrencyBalance,
    change: CurrencyChange,
    options: {
      persist?: boolean
    } = {},
  ): CurrencyBalance => {
    game.registry.set(CURRENCY_REGISTRY_KEY, nextBalance)

    telemetry.track('currency_changed', {
      amount: change.amount,
      balance: nextBalance,
      reason: change.reason,
      eventTimestampMs: change.timestampMs,
    })
    game.events.emit(CURRENCY_CHANGED_EVENT, change)

    if (options.persist !== false) {
      persistCurrentState()
    }

    return nextBalance
  }

  const setBarnSaveState = (
    state: SaveBarnStateV1,
    options: {
      persist?: boolean
      nowEpochMs?: number
    } = {},
  ): BarnStateSnapshot => {
    const normalized = normalizeBarnSaveState(state)
    game.registry.set(BARN_STATE_REGISTRY_KEY, normalized)
    const snapshot = buildBarnStateSnapshot(normalized, options.nowEpochMs)
    game.events.emit(BARN_STATE_CHANGED_EVENT, snapshot)

    if (options.persist !== false) {
      persistCurrentState()
    }

    return snapshot
  }

  const readExpansionTier = (): number => {
    const value = game.registry.get(EXPANSION_TIER_REGISTRY_KEY)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return getDefaultExpansionTier()
    }

    return clampExpansionTier(value)
  }

  const getExpansionStateSnapshot = (): ExpansionStateSnapshot => {
    const currentTier = readExpansionTier()
    const currentTierConfig =
      getExpansionTierConfig(currentTier) ?? getExpansionTierConfig(getDefaultExpansionTier())

    if (!currentTierConfig) {
      throw new Error('No default expansion tier config is defined')
    }

    const nextTierConfig = getNextExpansionTierConfig(currentTier)

    return {
      currentTier,
      maxTier: getMaxExpansionTier(),
      nextTier: nextTierConfig?.tier ?? null,
      nextCost: nextTierConfig?.cost ?? null,
      unlocks: cloneExpansionUnlockEffects(currentTierConfig.unlocks),
      nextUnlocks: nextTierConfig ? cloneExpansionUnlockEffects(nextTierConfig.unlocks) : null,
    }
  }

  const readUpgradeLevels = (): UpgradeLevels => {
    const rawLevels = game.registry.get(UPGRADE_LEVELS_REGISTRY_KEY)
    if (!rawLevels || typeof rawLevels !== 'object' || Array.isArray(rawLevels)) {
      return createDefaultUpgradeLevels()
    }

    return normalizeUpgradeLevels(rawLevels as Partial<UpgradeLevels>)
  }

  const getUpgradeStateSnapshot = (): UpgradeStateSnapshot => {
    const levels = readUpgradeLevels()
    return {
      levels: Object.freeze({ ...levels }),
      effects: resolveUpgradeEffects(levels),
    }
  }

  const getBarnRecipeUnlockState = (
    recipeId: BarnProcessingRecipeId,
  ): BarnProcessingRecipeUnlockState => {
    return getBarnProcessingRecipeUnlockState(recipeId, {
      expansionTier: readExpansionTier(),
      upgrades: readUpgradeLevels(),
    })
  }

  const readFtueState = (): SaveFtueStateV1 => {
    const rawState = game.registry.get(FTUE_STATE_REGISTRY_KEY)
    if (!isSaveFtueState(rawState)) {
      return createDefaultFtueSaveState()
    }

    return normalizeFtueState(rawState)
  }

  const createDisabledBarnHandoffSnapshot = (): BarnHandoffStateSnapshot => ({
    enabled: false,
    handoffId: null,
    targetRecipeId: null,
    targetRecipeLabel: null,
    targetRecipeDescription: null,
    requiredZoneId: null,
    requiredZoneUnlocked: false,
    isVisible: false,
    isCompleted: false,
    completedAtEpochMs: null,
    activeJobCount: 0,
    readyJobCount: 0,
    missingInputs: [],
    missingCoins: 0,
    canStart: false,
    nextAction: 'completed',
  })

  const buildBarnHandoffStateSnapshot = (
    ftueState: SaveFtueStateV1 = readFtueState(),
    nowEpochMs: number = Date.now(),
  ): BarnHandoffStateSnapshot => {
    const handoffConfig = ftueConfig.barnHandoff
    if (!handoffConfig.enabledByDefault) {
      return createDisabledBarnHandoffSnapshot()
    }

    const recipe = getBarnProcessingRecipeConfig(handoffConfig.targetRecipeId)
    const inventory = readInventoryState()
    const balance = readCurrencyBalance()
    const unlockState = getBarnRecipeUnlockState(handoffConfig.targetRecipeId)
    const barnState = buildBarnStateSnapshot(readBarnSaveState(), nowEpochMs)
    const targetJobs = barnState.jobs.filter((job) => job.recipeId === handoffConfig.targetRecipeId)
    const readyJobCount = targetJobs.filter((job) => job.isReady).length
    const missingInputs = recipe.inputs
      .map((item) => {
        const availableQuantity = inventory[item.itemId] ?? 0
        if (availableQuantity >= item.quantity) {
          return null
        }

        return {
          itemId: item.itemId,
          requiredQuantity: item.quantity,
          availableQuantity,
        }
      })
      .filter((entry): entry is BarnMissingInput => entry !== null)
    const missingCoins = Math.max(0, recipe.fee - balance)
    const requiredZoneUnlocked = getExpansionStateSnapshot().unlocks.unlockedZoneIds.includes(
      handoffConfig.requiredZoneId,
    )
    const completedAtEpochMs =
      normalizeFtueBarnHandoffState(ftueState.barnHandoff).completedAtEpochMs
    const isCompleted = completedAtEpochMs !== null
    const isFtueCompleted = ftueState.currentStep === null
    const canStart =
      isFtueCompleted &&
      !isCompleted &&
      requiredZoneUnlocked &&
      unlockState.isUnlocked &&
      missingInputs.length === 0 &&
      missingCoins === 0 &&
      targetJobs.length === 0

    let nextAction: BarnHandoffNextAction = 'start_recipe'
    if (isCompleted) {
      nextAction = 'completed'
    } else if (!isFtueCompleted) {
      nextAction = 'complete_ftue'
    } else if (!requiredZoneUnlocked || !unlockState.isUnlocked) {
      nextAction = 'unlock_barn'
    } else if (readyJobCount > 0) {
      nextAction = 'claim_output'
    } else if (targetJobs.length > 0) {
      nextAction = 'wait_for_completion'
    } else if (missingInputs.length > 0) {
      nextAction = 'gather_inputs'
    } else if (missingCoins > 0) {
      nextAction = 'earn_coins'
    }

    return {
      enabled: true,
      handoffId: handoffConfig.id,
      targetRecipeId: handoffConfig.targetRecipeId,
      targetRecipeLabel: recipe.label,
      targetRecipeDescription: recipe.description,
      requiredZoneId: handoffConfig.requiredZoneId,
      requiredZoneUnlocked,
      isVisible: isFtueCompleted && !isCompleted,
      isCompleted,
      completedAtEpochMs,
      activeJobCount: targetJobs.length,
      readyJobCount,
      missingInputs,
      missingCoins,
      canStart,
      nextAction,
    }
  }

  const getBarnHandoffStateSnapshot = (): BarnHandoffStateSnapshot => {
    return buildBarnHandoffStateSnapshot()
  }

  const getFtueStateSnapshot = (): FtueStateSnapshot => {
    const state = readFtueState()
    const isCompleted = state.currentStep === null

    return {
      enabled: ftueConfig.enabledByDefault,
      currentStep: ftueConfig.enabledByDefault ? state.currentStep : null,
      completedAtEpochMs: state.completedAtEpochMs,
      isCompleted,
      barnHandoff: buildBarnHandoffStateSnapshot(state),
    }
  }

  const readReturnObjectiveState = (): SaveReturnObjectiveStateV1 => {
    const rawState = game.registry.get(RETURN_OBJECTIVE_STATE_REGISTRY_KEY)
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
      return createDefaultReturnObjectiveSaveState()
    }

    const state = rawState as Partial<SaveReturnObjectiveStateV1>
    return normalizeReturnObjectiveState({
      activeObjectiveId: state.activeObjectiveId ?? null,
      progressValue: state.progressValue ?? 0,
      assignedAtEpochMs: state.assignedAtEpochMs ?? null,
      completedAtEpochMs: state.completedAtEpochMs ?? null,
      claimedAtEpochMs: state.claimedAtEpochMs ?? null,
      assignmentCycle: state.assignmentCycle ?? 0,
    })
  }

  const readReturnObjectiveStreakState = (): SaveReturnObjectiveStreakStateV1 => {
    const rawState = game.registry.get(RETURN_OBJECTIVE_STREAK_STATE_REGISTRY_KEY)
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
      return createDefaultReturnObjectiveStreakSaveState()
    }

    const state = rawState as Partial<SaveReturnObjectiveStreakStateV1>
    return normalizeReturnObjectiveStreakState({
      tier: state.tier ?? 0,
      lastClaimedAtEpochMs: state.lastClaimedAtEpochMs ?? null,
    })
  }

  const getReturnObjectiveStateSnapshot = (): ReturnObjectiveStateSnapshot => {
    return buildReturnObjectiveSnapshot(readReturnObjectiveState(), readReturnObjectiveStreakState())
  }

  const readProgressionStateForObjectiveAssignment = (): SaveProgressionStateV1 => {
    return {
      activeScene: null,
      activeSeedId: readRanchStateSnapshot().activeSeedId,
      expansionTier: readExpansionTier(),
      upgrades: readUpgradeLevels(),
    }
  }

  const setReturnObjectiveState = (
    state: SaveReturnObjectiveStateV1,
    options: {
      emitChangedEvent?: boolean
      persist?: boolean
    } = {},
  ): ReturnObjectiveStateSnapshot => {
    const normalized = normalizeReturnObjectiveState(state)
    game.registry.set(RETURN_OBJECTIVE_STATE_REGISTRY_KEY, normalized)
    const snapshot = buildReturnObjectiveSnapshot(normalized, readReturnObjectiveStreakState())

    if (options.emitChangedEvent !== false) {
      game.events.emit(RETURN_OBJECTIVE_CHANGED_EVENT, snapshot)
    }

    if (options.persist !== false) {
      persistCurrentState()
    }

    return snapshot
  }

  const setReturnObjectiveStreakState = (
    state: SaveReturnObjectiveStreakStateV1,
    options: {
      persist?: boolean
    } = {},
  ): SaveReturnObjectiveStreakStateV1 => {
    const normalized = normalizeReturnObjectiveStreakState(state)
    game.registry.set(RETURN_OBJECTIVE_STREAK_STATE_REGISTRY_KEY, normalized)

    if (options.persist !== false) {
      persistCurrentState()
    }

    return normalized
  }

  const assignDeterministicReturnObjective = (source: string): ReturnObjectiveStateSnapshot => {
    if (!retentionFeatureFlags.objectiveLoopUiEnabled) {
      return getReturnObjectiveStateSnapshot()
    }

    const now = Date.now()
    const currentState = readReturnObjectiveState()
    const progression = readProgressionStateForObjectiveAssignment()
    const nextObjectiveId = resolveDeterministicReturnObjectiveId(
      progression,
      currentState.assignmentCycle,
    )
    const objectiveConfig = getReturnObjectiveConfig(nextObjectiveId)

    const nextState: SaveReturnObjectiveStateV1 = {
      activeObjectiveId: nextObjectiveId,
      progressValue: 0,
      assignedAtEpochMs: now,
      completedAtEpochMs: null,
      claimedAtEpochMs: null,
      assignmentCycle: currentState.assignmentCycle,
    }
    const snapshot = setReturnObjectiveState(nextState)

    telemetry.track('return_objective_assigned', {
      tuningPackId: retentionTuningTelemetryPayload.tuningPackId,
      tuningPackVersion: retentionTuningTelemetryPayload.tuningPackVersion,
      fallbackReason: retentionTuningTelemetryPayload.fallbackReason,
      objectiveId: objectiveConfig.id,
      goalId: objectiveConfig.goalId,
      metric: objectiveConfig.metric,
      targetValue: objectiveConfig.targetValue,
      rewardAmount: objectiveConfig.rewardAmount,
      assignmentCycle: nextState.assignmentCycle,
      source: source.trim().length > 0 ? source.trim() : 'unspecified',
      eventTimestampMs: now,
    })

    return snapshot
  }

  const ensureReturnObjectiveAssignedForSession = (source: string): ReturnObjectiveStateSnapshot => {
    if (!retentionFeatureFlags.objectiveLoopUiEnabled) {
      return getReturnObjectiveStateSnapshot()
    }

    const currentState = readReturnObjectiveState()
    if (currentState.activeObjectiveId && currentState.claimedAtEpochMs === null) {
      return getReturnObjectiveStateSnapshot()
    }

    return assignDeterministicReturnObjective(source)
  }

  const resolveCohort = (): 'mobile_web' | 'desktop_web' => {
    const touchEnabled = game.device.input.touch
    const narrowViewport = game.scale.width <= 768
    return touchEnabled || narrowViewport ? 'mobile_web' : 'desktop_web'
  }

  const readRanchStateSnapshot = (): RanchStateSnapshot => {
    const activeSeedRaw = game.registry.get(RANCH_ACTIVE_SEED_REGISTRY_KEY)
    const cropsRaw = game.registry.get(RANCH_CROPS_REGISTRY_KEY)
    const animalsRaw = game.registry.get(RANCH_ANIMALS_REGISTRY_KEY)

    const activeSeedId = isCropSeedId(activeSeedRaw) ? activeSeedRaw : defaultCropSeedId
    const crops = Array.isArray(cropsRaw)
      ? cropsRaw.filter(isSaveCropState).map((crop) => cloneCropState(crop))
      : []
    const animals = Array.isArray(animalsRaw)
      ? animalsRaw.filter(isSaveAnimalState).map((animal) => cloneAnimalState(animal))
      : []

    return {
      activeSeedId,
      crops,
      animals,
    }
  }

  const getActiveScene = (): PlayableSceneKey | null => {
    const activeScene = game.registry.get(ACTIVE_SCENE_REGISTRY_KEY)

    if (
      typeof activeScene !== 'string' ||
      !PLAYABLE_SCENES.includes(activeScene as PlayableSceneKey)
    ) {
      return null
    }

    return activeScene as PlayableSceneKey
  }

  const firstSessionFunnel = createFirstSessionFunnelTracker(telemetry, resolveCohort())
  const trackSessionEnd = (source: string): void => {
    firstSessionFunnel.trackSessionEnd({
      scene: getActiveScene() ?? preferredStartupScene,
      source,
      balance: getCurrencyBalance(),
    })
  }

  if (typeof window !== 'undefined') {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== 'hidden') {
        return
      }

      trackSessionEnd('visibilitychange')
    }
    const handlePageHide = (): void => {
      trackSessionEnd('pagehide')
    }
    const handleBeforeUnload = (): void => {
      trackSessionEnd('beforeunload')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)

    game.events.once(Phaser.Core.Events.DESTROY, () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      trackSessionEnd('game_destroyed')
    })
  }

  const buildSaveStateSnapshot = (): SaveStateV1 => {
    const ranchSnapshot = readRanchStateSnapshot()
    const ftueState = readFtueState()
    const returnObjectiveState = readReturnObjectiveState()
    const returnObjectiveStreakState = readReturnObjectiveStreakState()
    const barnState = readBarnSaveState()
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      metadata: {
        savedAtEpochMs: Date.now(),
      },
      currency: getCurrencyBalance(),
      inventory: readInventoryState(),
      progression: {
        activeScene: getActiveScene(),
        activeSeedId: ranchSnapshot.activeSeedId,
        expansionTier: readExpansionTier(),
        upgrades: readUpgradeLevels(),
      },
      ftue: ftueState,
      returnObjective: returnObjectiveState,
      returnObjectiveStreak: returnObjectiveStreakState,
      barn: barnState,
      ranch: {
        crops: ranchSnapshot.crops,
        animals: ranchSnapshot.animals,
      },
    }
  }

  const writeSaveStateSafely = (saveState: SaveStateV1): void => {
    if (suppressSaveWrites) {
      return
    }

    const analyticsMetadata = buildSaveAnalyticsMetadata(saveState)

    try {
      saveStorage.write(saveState)
      telemetry.track('save_write_success', analyticsMetadata)
    } catch {
      telemetry.track('save_write_failure', analyticsMetadata)
    }
  }

  const persistCurrentState = (): SaveStateV1 => {
    const saveState = buildSaveStateSnapshot()
    writeSaveStateSafely(saveState)
    return saveState
  }

  const reconcileProcessedBarnJobs = (nowEpochMs: number = Date.now()): SaveBarnStateV1 => {
    const currentBarnState = readBarnSaveState()
    const newlyProcessedJobs = currentBarnState.jobs.filter(
      (job) => job.processedAtEpochMs === null && job.readyAtEpochMs <= nowEpochMs,
    )

    if (newlyProcessedJobs.length === 0) {
      return currentBarnState
    }

    const nextBarnState = normalizeBarnSaveState({
      jobs: currentBarnState.jobs.map((job) => {
        const nextJob = cloneBarnJobState(job)
        if (nextJob.processedAtEpochMs === null && nextJob.readyAtEpochMs <= nowEpochMs) {
          nextJob.processedAtEpochMs = nextJob.readyAtEpochMs
        }

        return nextJob
      }),
      marketOrders: currentBarnState.marketOrders,
    })

    setBarnSaveState(nextBarnState, { persist: false, nowEpochMs })
    persistCurrentState()

    const balance = getCurrencyBalance()
    const activeJobCount = nextBarnState.jobs.length

    for (const job of newlyProcessedJobs) {
      const recipe = getBarnProcessingRecipeConfig(job.recipeId)
      telemetry.track('barn_job_processed', {
        recipeId: job.recipeId,
        recipeLabel: recipe.label,
        jobId: job.id,
        inputLineItems: formatBarnLineItems(recipe.inputs),
        outputLineItems: formatBarnLineItems(recipe.outputs),
        missingLineItems: '',
        fee: recipe.fee,
        durationMs: recipe.durationMs,
        activeJobCount,
        balance,
        source: job.source,
        queuedAtEpochMs: job.startedAtEpochMs,
        readyAtEpochMs: job.readyAtEpochMs,
        processedAtEpochMs: job.readyAtEpochMs,
        claimedAtEpochMs: null,
        reason: null,
        eventTimestampMs: job.readyAtEpochMs,
      })
    }

    return nextBarnState
  }

  const normalizeInventoryMutationInput = (
    itemId: string,
    quantity: number,
  ): { itemId: string; quantity: number } => {
    const normalizedItemId = itemId.trim()
    const normalizedQuantity = Math.floor(quantity)

    if (normalizedItemId.length === 0) {
      throw new Error('Inventory item id is required')
    }

    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error('Inventory quantity must be a positive finite number')
    }

    return {
      itemId: normalizedItemId,
      quantity: normalizedQuantity,
    }
  }

  const addInventoryItem = (itemId: string, quantity: number = 1): number => {
    const normalized = normalizeInventoryMutationInput(itemId, quantity)

    const nextInventory = readInventoryState()
    const nextTotal = (nextInventory[normalized.itemId] ?? 0) + normalized.quantity
    nextInventory[normalized.itemId] = nextTotal

    const change: InventoryChange = {
      itemId: normalized.itemId,
      quantity: normalized.quantity,
      total: nextTotal,
      timestampMs: Date.now(),
    }

    commitInventoryState(nextInventory, [change])
    return nextTotal
  }

  const removeInventoryItem = (itemId: string, quantity: number = 1): number => {
    const normalized = normalizeInventoryMutationInput(itemId, quantity)
    const nextInventory = readInventoryState()
    const currentTotal = nextInventory[normalized.itemId] ?? 0

    if (currentTotal < normalized.quantity) {
      throw new Error('Cannot remove more inventory than available')
    }

    const nextTotal = currentTotal - normalized.quantity
    if (nextTotal > 0) {
      nextInventory[normalized.itemId] = nextTotal
    } else {
      delete nextInventory[normalized.itemId]
    }

    const change: InventoryChange = {
      itemId: normalized.itemId,
      quantity: -normalized.quantity,
      total: nextTotal,
      timestampMs: Date.now(),
    }

    commitInventoryState(nextInventory, [change])
    return nextTotal
  }

  const applyCurrencyDelta = (amount: number, reason: string): CurrencyBalance => {
    const normalizedAmount = Math.floor(amount)
    if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
      throw new Error('Currency amount must be a non-zero finite number')
    }

    const normalizedReason = reason.trim().length > 0 ? reason.trim() : 'unspecified'
    const currentBalance = readCurrencyBalance()
    const nextBalance = currentBalance + normalizedAmount
    if (nextBalance < 0) {
      throw new Error('Currency balance cannot be negative')
    }

    const change: CurrencyChange = {
      amount: normalizedAmount,
      balance: nextBalance,
      reason: normalizedReason,
      timestampMs: Date.now(),
    }

    return commitCurrencyBalance(nextBalance, change)
  }

  const addCurrency = (amount: number, reason: string = 'unspecified'): CurrencyBalance => {
    return applyCurrencyDelta(amount, reason)
  }

  const completeBarnHandoffIfNeeded = (
    recipeId: BarnProcessingRecipeId,
    source: string,
    nowEpochMs: number,
    options: {
      persist?: boolean
    } = {},
  ): BarnHandoffStateSnapshot => {
    const handoffConfig = ftueConfig.barnHandoff
    if (!handoffConfig.enabledByDefault || handoffConfig.targetRecipeId !== recipeId) {
      return getBarnHandoffStateSnapshot()
    }

    const currentState = readFtueState()
    const handoffState = normalizeFtueBarnHandoffState(currentState.barnHandoff)
    if (handoffState.completedAtEpochMs !== null) {
      return buildBarnHandoffStateSnapshot(currentState, nowEpochMs)
    }

    const nextState = setFtueState(
      {
        ...currentState,
        barnHandoff: {
          completedAtEpochMs: nowEpochMs,
        },
      },
      { persist: options.persist },
    )

    telemetry.track('ftue_barn_handoff_completed', {
      handoffId: handoffConfig.id,
      targetRecipeId: recipeId,
      source: source.trim().length > 0 ? source.trim() : 'unspecified',
      eventTimestampMs: nowEpochMs,
    })

    return nextState.barnHandoff
  }

  const startBarnJob = (
    recipeId: BarnProcessingRecipeId,
    source: string = 'unspecified',
  ): BarnStartJobResult => {
    const normalizedSource = normalizeBarnJobSource(source)
    const recipe = getBarnProcessingRecipeConfig(recipeId)
    const now = Date.now()
    const currentInventory = readInventoryState()
    const currentBalance = readCurrencyBalance()
    const currentBarnState = reconcileProcessedBarnJobs(now)
    const unlockState = getBarnRecipeUnlockState(recipeId)
    const missingInputs = recipe.inputs
      .map((item) => {
        const availableQuantity = currentInventory[item.itemId] ?? 0
        if (availableQuantity >= item.quantity) {
          return null
        }

        return {
          itemId: item.itemId,
          requiredQuantity: item.quantity,
          availableQuantity,
        }
      })
      .filter((entry): entry is BarnMissingInput => entry !== null)

    const startFailure: BarnStartJobResult['result'] | null =
      !unlockState.isUnlocked
        ? 'locked'
        : missingInputs.length > 0
        ? 'insufficient_items'
        : currentBalance < recipe.fee
          ? 'insufficient_funds'
          : null

    if (startFailure) {
      const missingLineItems = formatBarnLineItems(
        missingInputs.map((item) => ({
          itemId: item.itemId,
          quantity: Math.max(0, item.requiredQuantity - item.availableQuantity),
        })),
      )
      const state = buildBarnStateSnapshot(currentBarnState, now)
      telemetry.track('barn_job_start_attempt', {
        recipeId,
        recipeLabel: recipe.label,
        result: startFailure,
        inputLineItems: formatBarnLineItems(recipe.inputs),
        outputLineItems: formatBarnLineItems(recipe.outputs),
        missingLineItems,
        fee: recipe.fee,
        durationMs: recipe.durationMs,
        activeJobCount: currentBarnState.jobs.length,
        balance: currentBalance,
        source: normalizedSource,
        eventTimestampMs: now,
      })
      telemetry.track('barn_job_aborted', {
        recipeId,
        recipeLabel: recipe.label,
        jobId: null,
        inputLineItems: formatBarnLineItems(recipe.inputs),
        outputLineItems: formatBarnLineItems(recipe.outputs),
        missingLineItems,
        fee: recipe.fee,
        durationMs: recipe.durationMs,
        activeJobCount: currentBarnState.jobs.length,
        balance: currentBalance,
        source: normalizedSource,
        queuedAtEpochMs: null,
        readyAtEpochMs: null,
        processedAtEpochMs: null,
        claimedAtEpochMs: null,
        reason: startFailure,
        eventTimestampMs: now,
      })

      return {
        result: startFailure,
        recipeId,
        unlockState,
        missingInputs,
        job: null,
        balance: currentBalance,
        state,
      }
    }

    const nextInventory = readInventoryState()
    const inventoryChanges: InventoryChange[] = recipe.inputs.map((item) => {
      const nextTotal = (nextInventory[item.itemId] ?? 0) - item.quantity

      if (nextTotal > 0) {
        nextInventory[item.itemId] = nextTotal
      } else {
        delete nextInventory[item.itemId]
      }

      return {
        itemId: item.itemId,
        quantity: -item.quantity,
        total: nextTotal,
        timestampMs: now,
      }
    })

    if (inventoryChanges.length > 0) {
      commitInventoryState(nextInventory, inventoryChanges, { persist: false })
    }

    let balance = currentBalance
    if (recipe.fee > 0) {
      const currencyChange: CurrencyChange = {
        amount: -recipe.fee,
        balance: currentBalance - recipe.fee,
        reason: `barn_job_fee:${recipeId}`,
        timestampMs: now,
      }
      balance = commitCurrencyBalance(currencyChange.balance, currencyChange, { persist: false })
    }

    const job: SaveBarnJobStateV1 = {
      id: createBarnJobId(recipeId, currentBarnState.jobs.length, now),
      recipeId,
      startedAtEpochMs: now,
      readyAtEpochMs: now + recipe.durationMs,
      processedAtEpochMs: null,
      source: normalizedSource,
    }
    const state = setBarnSaveState(
      {
        jobs: [...currentBarnState.jobs, job],
        marketOrders: currentBarnState.marketOrders,
      },
      { persist: false, nowEpochMs: now },
    )

    completeBarnHandoffIfNeeded(recipeId, normalizedSource, now, { persist: false })
    persistCurrentState()

    telemetry.track('barn_job_start_attempt', {
      recipeId,
      recipeLabel: recipe.label,
      result: 'started',
      inputLineItems: formatBarnLineItems(recipe.inputs),
      outputLineItems: formatBarnLineItems(recipe.outputs),
      missingLineItems: '',
      fee: recipe.fee,
      durationMs: recipe.durationMs,
      activeJobCount: state.jobs.length,
      balance,
      source: normalizedSource,
      eventTimestampMs: now,
    })
    telemetry.track('barn_job_started', {
      recipeId,
      recipeLabel: recipe.label,
      jobId: job.id,
      inputLineItems: formatBarnLineItems(recipe.inputs),
      outputLineItems: formatBarnLineItems(recipe.outputs),
      fee: recipe.fee,
      durationMs: recipe.durationMs,
      activeJobCount: state.jobs.length,
      balance,
      source: normalizedSource,
      eventTimestampMs: now,
    })
    telemetry.track('barn_job_queued', {
      recipeId,
      recipeLabel: recipe.label,
      jobId: job.id,
      inputLineItems: formatBarnLineItems(recipe.inputs),
      outputLineItems: formatBarnLineItems(recipe.outputs),
      missingLineItems: '',
      fee: recipe.fee,
      durationMs: recipe.durationMs,
      activeJobCount: state.jobs.length,
      balance,
      source: normalizedSource,
      queuedAtEpochMs: now,
      readyAtEpochMs: job.readyAtEpochMs,
      processedAtEpochMs: null,
      claimedAtEpochMs: null,
      reason: null,
      eventTimestampMs: now,
    })

    return {
      result: 'started',
      recipeId,
      unlockState,
      missingInputs: [],
      job: buildBarnJobSnapshot(job, now),
      balance,
      state,
    }
  }

  const claimBarnJob = (jobId: string, source: string = 'unspecified'): BarnClaimJobResult => {
    const normalizedJobId = jobId.trim()
    const normalizedSource = normalizeBarnJobSource(source)
    const now = Date.now()
    const currentBarnState = reconcileProcessedBarnJobs(now)

    if (normalizedJobId.length === 0) {
      return {
        result: 'not_found',
        jobId: normalizedJobId,
        recipeId: null,
        outputs: [],
        balance: getCurrencyBalance(),
        state: buildBarnStateSnapshot(currentBarnState, now),
      }
    }

    const job = currentBarnState.jobs.find((entry) => entry.id === normalizedJobId)
    if (!job) {
      return {
        result: 'not_found',
        jobId: normalizedJobId,
        recipeId: null,
        outputs: [],
        balance: getCurrencyBalance(),
        state: buildBarnStateSnapshot(currentBarnState, now),
      }
    }

    const recipe = getBarnProcessingRecipeConfig(job.recipeId)
    if (job.readyAtEpochMs > now) {
      return {
        result: 'processing',
        jobId: normalizedJobId,
        recipeId: job.recipeId,
        outputs: recipe.outputs.map((item) => cloneBarnLineItem(item)),
        balance: getCurrencyBalance(),
        state: buildBarnStateSnapshot(currentBarnState, now),
      }
    }

    const nextInventory = readInventoryState()
    const inventoryChanges: InventoryChange[] = recipe.outputs.map((item) => {
      const nextTotal = (nextInventory[item.itemId] ?? 0) + item.quantity
      nextInventory[item.itemId] = nextTotal

      return {
        itemId: item.itemId,
        quantity: item.quantity,
        total: nextTotal,
        timestampMs: now,
      }
    })

    if (inventoryChanges.length > 0) {
      commitInventoryState(nextInventory, inventoryChanges, { persist: false })
    }

    const state = setBarnSaveState(
      {
        jobs: currentBarnState.jobs.filter((entry) => entry.id !== normalizedJobId),
        marketOrders: currentBarnState.marketOrders,
      },
      { persist: false },
    )

    persistCurrentState()

    const balance = getCurrencyBalance()

    telemetry.track('barn_job_completed', {
      recipeId: job.recipeId,
      recipeLabel: recipe.label,
      jobId: job.id,
      outputLineItems: formatBarnLineItems(recipe.outputs),
      activeJobCount: state.jobs.length,
      balance,
      source: normalizedSource,
      startedAtEpochMs: job.startedAtEpochMs,
      readyAtEpochMs: job.readyAtEpochMs,
      eventTimestampMs: now,
    })
    telemetry.track('barn_job_claimed', {
      recipeId: job.recipeId,
      recipeLabel: recipe.label,
      jobId: job.id,
      inputLineItems: formatBarnLineItems(recipe.inputs),
      outputLineItems: formatBarnLineItems(recipe.outputs),
      missingLineItems: '',
      fee: recipe.fee,
      durationMs: recipe.durationMs,
      activeJobCount: state.jobs.length,
      balance,
      source: normalizedSource,
      queuedAtEpochMs: job.startedAtEpochMs,
      readyAtEpochMs: job.readyAtEpochMs,
      processedAtEpochMs: job.processedAtEpochMs ?? job.readyAtEpochMs,
      claimedAtEpochMs: now,
      reason: null,
      eventTimestampMs: now,
    })
    progressReturnObjective(
      'barn_claim_count',
      1,
      `barn:claim:${job.recipeId}:${normalizedSource}`,
    )

    return {
      result: 'claimed',
      jobId: normalizedJobId,
      recipeId: job.recipeId,
      outputs: recipe.outputs.map((item) => cloneBarnLineItem(item)),
      balance,
      state,
    }
  }

  const fulfillBarnMarketOrders = (
    source: string = 'unspecified',
  ): BarnMarketOrderFulfillmentResult => {
    const normalizedSource = normalizeBarnMarketOrderSource(source)
    const now = Date.now()
    const currentBarnState = readBarnSaveState()
    const nextInventory = readInventoryState()
    const nextMarketOrders = currentBarnState.marketOrders.map((order) =>
      cloneBarnMarketOrderState(order),
    )
    const inventoryChanges: InventoryChange[] = []
    const fulfilledOrders: BarnMarketOrderFulfillment[] = []

    for (const order of nextMarketOrders) {
      if (order.fulfilledAtEpochMs !== null) {
        continue
      }

      const config = getBarnMarketOrderConfig(order.orderId)
      if (!canFulfillBarnMarketOrder(config.requiredItems, nextInventory)) {
        continue
      }

      for (const item of config.requiredItems) {
        const nextTotal = (nextInventory[item.itemId] ?? 0) - item.quantity
        if (nextTotal > 0) {
          nextInventory[item.itemId] = nextTotal
        } else {
          delete nextInventory[item.itemId]
        }

        inventoryChanges.push({
          itemId: item.itemId,
          quantity: -item.quantity,
          total: nextTotal,
          timestampMs: now,
        })
      }

      order.fulfilledAtEpochMs = now
      order.source = normalizedSource
      fulfilledOrders.push({
        orderId: order.orderId,
        label: config.label,
        requiredItems: config.requiredItems.map((item) => cloneBarnMarketOrderLineItem(item)),
        payout: config.payout,
        baseSellValue: config.baseSellValue,
        premiumValue: config.premiumValue,
        fulfilledAtEpochMs: now,
      })
    }

    if (fulfilledOrders.length === 0) {
      return {
        result: 'none',
        fulfilledOrders,
        fulfilledOrderCount: 0,
        consumedQuantity: 0,
        totalPayout: 0,
        balance: getCurrencyBalance(),
        inventory: getInventorySnapshot(),
        state: buildBarnStateSnapshot(currentBarnState, now),
      }
    }

    if (inventoryChanges.length > 0) {
      commitInventoryState(nextInventory, inventoryChanges, { persist: false })
    }

    const totalPayout = fulfilledOrders.reduce((total, order) => total + order.payout, 0)
    const consumedQuantity = fulfilledOrders.reduce(
      (total, order) =>
        total + order.requiredItems.reduce((itemTotal, item) => itemTotal + item.quantity, 0),
      0,
    )
    const currentBalance = readCurrencyBalance()
    const nextBalance = currentBalance + totalPayout
    const balance = commitCurrencyBalance(
      nextBalance,
      {
        amount: totalPayout,
        balance: nextBalance,
        reason: `barn_market_order:${normalizedSource}`,
        timestampMs: now,
      },
      { persist: false },
    )
    const state = setBarnSaveState(
      {
        jobs: currentBarnState.jobs,
        marketOrders: nextMarketOrders,
      },
      { persist: false, nowEpochMs: now },
    )

    persistCurrentState()

    for (const order of fulfilledOrders) {
      telemetry.track('barn_market_order_fulfilled', {
        orderId: order.orderId,
        orderLabel: order.label,
        requiredLineItems: formatBarnMarketOrderLineItems(order.requiredItems),
        payout: order.payout,
        baseSellValue: order.baseSellValue,
        premiumValue: order.premiumValue,
        fulfilledOrderCount: fulfilledOrders.length,
        balance,
        source: normalizedSource,
        fulfilledAtEpochMs: now,
        eventTimestampMs: now,
      })
    }

    return {
      result: 'fulfilled',
      fulfilledOrders,
      fulfilledOrderCount: fulfilledOrders.length,
      consumedQuantity,
      totalPayout,
      balance,
      inventory: getInventorySnapshot(),
      state,
    }
  }

  const purchaseNextExpansionTier = (
    source: string = 'unspecified',
  ): ExpansionPurchaseResult => {
    const normalizedSource = source.trim().length > 0 ? source.trim() : 'unspecified'
    const tierBefore = readExpansionTier()
    const nextTierConfig = getNextExpansionTierConfig(tierBefore)
    const timestampMs = Date.now()

    if (!nextTierConfig) {
      const balance = getCurrencyBalance()
      telemetry.track('expansion_purchase_attempt', {
        source: normalizedSource,
        result: 'max_tier',
        tierBefore,
        tierAfter: tierBefore,
        cost: null,
        balance,
        eventTimestampMs: timestampMs,
      })

      return {
        result: 'max_tier',
        tierBefore,
        tierAfter: tierBefore,
        nextCost: null,
        balance,
      }
    }

    const nextCost = nextTierConfig.cost
    const balanceBefore = getCurrencyBalance()

    if (balanceBefore < nextCost) {
      telemetry.track('expansion_purchase_attempt', {
        source: normalizedSource,
        result: 'insufficient_funds',
        tierBefore,
        tierAfter: tierBefore,
        cost: nextCost,
        balance: balanceBefore,
        eventTimestampMs: timestampMs,
      })

      return {
        result: 'insufficient_funds',
        tierBefore,
        tierAfter: tierBefore,
        nextCost,
        balance: balanceBefore,
      }
    }

    game.registry.set(EXPANSION_TIER_REGISTRY_KEY, nextTierConfig.tier)
    const balance = applyCurrencyDelta(-nextCost, `expansion_purchase:tier_${nextTierConfig.tier}`)
    const nextState = getExpansionStateSnapshot()

    telemetry.track('expansion_purchase_attempt', {
      source: normalizedSource,
      result: 'purchased',
      tierBefore,
      tierAfter: nextTierConfig.tier,
      cost: nextCost,
      balance,
      eventTimestampMs: timestampMs,
    })
    telemetry.track('expansion_purchased', {
      source: normalizedSource,
      tierBefore,
      tierAfter: nextTierConfig.tier,
      cost: nextCost,
      balance,
      cropTileCapacity: nextTierConfig.unlocks.cropTileCapacity,
      animalSlotCapacity: nextTierConfig.unlocks.animalSlotCapacity,
      unlockedZoneCount: nextTierConfig.unlocks.unlockedZoneIds.length,
      unlockedZoneIds: nextTierConfig.unlocks.unlockedZoneIds.join(','),
      eventTimestampMs: Date.now(),
    })

    game.events.emit(EXPANSION_TIER_CHANGED_EVENT, nextState)

    return {
      result: 'purchased',
      tierBefore,
      tierAfter: nextTierConfig.tier,
      nextCost: nextState.nextCost,
      balance,
    }
  }

  const purchaseUpgrade = (
    upgradeId: UpgradeId,
    source: string = 'unspecified',
  ): UpgradePurchaseResult => {
    const levels = readUpgradeLevels()
    const levelBefore = clampUpgradeLevel(upgradeId, levels[upgradeId] ?? 0)
    const nextLevelConfig = getNextUpgradeLevelConfig(upgradeId, levelBefore)

    if (!nextLevelConfig) {
      return {
        result: 'max_level',
        upgradeId,
        levelBefore,
        levelAfter: levelBefore,
        nextCost: null,
        balance: getCurrencyBalance(),
      }
    }

    const nextCost = nextLevelConfig.cost
    if (getCurrencyBalance() < nextCost) {
      return {
        result: 'insufficient_funds',
        upgradeId,
        levelBefore,
        levelAfter: levelBefore,
        nextCost,
        balance: getCurrencyBalance(),
      }
    }

    const levelAfter = Math.min(levelBefore + 1, getUpgradeMaxLevel(upgradeId))
    levels[upgradeId] = levelAfter
    game.registry.set(UPGRADE_LEVELS_REGISTRY_KEY, levels)
    const balance = applyCurrencyDelta(
      -nextCost,
      `upgrade_purchase:${upgradeId}:level_${levelAfter}`,
    )

    const effects = resolveUpgradeEffects(levels)
    telemetry.track('upgrade_purchased', {
      upgradeId,
      source: source.trim().length > 0 ? source.trim() : 'unspecified',
      levelBefore,
      levelAfter,
      cost: nextCost,
      balance,
      cropGrowthDurationMultiplier: effects.cropGrowthDurationMultiplier,
      sellPriceMultiplier: effects.sellPriceMultiplier,
      eventTimestampMs: Date.now(),
    })

    game.events.emit(UPGRADE_LEVELS_CHANGED_EVENT, getUpgradeStateSnapshot())

    return {
      result: 'purchased',
      upgradeId,
      levelBefore,
      levelAfter,
      nextCost: getNextUpgradeLevelConfig(upgradeId, levelAfter)?.cost ?? null,
      balance,
    }
  }

  const sellInventoryItem = (
    itemId: string,
    quantity: number,
    unitPrice: number,
    reason: string = 'inventory_sale',
  ): InventorySaleResult => {
    const normalizedUnitPrice = Math.floor(unitPrice)
    if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice <= 0) {
      throw new Error('Unit price must be a positive finite number')
    }

    const normalized = normalizeInventoryMutationInput(itemId, quantity)
    const remainingInventory = removeInventoryItem(normalized.itemId, normalized.quantity)
    const revenue = normalized.quantity * normalizedUnitPrice
    const balance = addCurrency(revenue, reason)

    return {
      itemId: normalized.itemId,
      soldQuantity: normalized.quantity,
      unitPrice: normalizedUnitPrice,
      revenue,
      remainingInventory,
      balance,
    }
  }

  const setRanchStateSnapshot = (snapshot: RanchStateSnapshot): void => {
    const nextSnapshot: RanchStateSnapshot = {
      activeSeedId: isCropSeedId(snapshot.activeSeedId)
        ? snapshot.activeSeedId
        : defaultCropSeedId,
      crops: snapshot.crops.filter(isSaveCropState).map((crop) => cloneCropState(crop)),
      animals: snapshot.animals
        .filter(isSaveAnimalState)
        .map((animal) => cloneAnimalState(animal)),
    }

    game.registry.set(RANCH_ACTIVE_SEED_REGISTRY_KEY, nextSnapshot.activeSeedId)
    game.registry.set(RANCH_CROPS_REGISTRY_KEY, nextSnapshot.crops)
    game.registry.set(RANCH_ANIMALS_REGISTRY_KEY, nextSnapshot.animals)
    persistCurrentState()
  }

  const setFtueState = (
    state: SaveFtueStateV1,
    options: {
      persist?: boolean
    } = {},
  ): FtueStateSnapshot => {
    const normalizedState = normalizeFtueState(state)
    game.registry.set(FTUE_STATE_REGISTRY_KEY, normalizedState)
    const snapshot = getFtueStateSnapshot()
    game.events.emit(FTUE_CHANGED_EVENT, snapshot)
    if (options.persist !== false) {
      persistCurrentState()
    }
    return snapshot
  }

  const advanceFtue = (signal: FtueProgressSignal): FtueStateSnapshot => {
    const currentState = readFtueState()
    if (!ftueConfig.enabledByDefault || currentState.currentStep === null) {
      return getFtueStateSnapshot()
    }

    const currentStepConfig = getFtueStepConfig(currentState.currentStep)
    if (currentStepConfig.completionSignal !== signal) {
      return getFtueStateSnapshot()
    }

    const now = Date.now()
    const nextStepId = getNextFtueStepId(currentState.currentStep)
    const nextState: SaveFtueStateV1 = {
      currentStep: nextStepId,
      completedAtEpochMs: nextStepId === null ? now : null,
      barnHandoff: currentState.barnHandoff,
    }
    const nextSnapshot = setFtueState(nextState)

    telemetry.track('ftue_step_progressed', {
      completedStepId: currentStepConfig.id,
      completedSignal: signal,
      nextStepId,
      isCompleted: nextSnapshot.isCompleted,
      eventTimestampMs: now,
    })

    return nextSnapshot
  }

  const progressReturnObjective = (
    metric: ReturnObjectiveMetric,
    amount: number = 1,
    source: string = 'unspecified',
  ): ReturnObjectiveStateSnapshot => {
    if (!retentionFeatureFlags.objectiveLoopUiEnabled) {
      return getReturnObjectiveStateSnapshot()
    }

    const normalizedAmount = Math.floor(amount)
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return getReturnObjectiveStateSnapshot()
    }

    const currentState = readReturnObjectiveState()
    if (currentState.activeObjectiveId === null || currentState.claimedAtEpochMs !== null) {
      return getReturnObjectiveStateSnapshot()
    }

    const objectiveConfig = getReturnObjectiveConfig(currentState.activeObjectiveId)
    if (objectiveConfig.metric !== metric) {
      return getReturnObjectiveStateSnapshot()
    }

    const progressBefore = currentState.progressValue
    const progressAfter = Math.min(objectiveConfig.targetValue, progressBefore + normalizedAmount)
    if (progressAfter === progressBefore) {
      return getReturnObjectiveStateSnapshot()
    }

    const now = Date.now()
    const completedAtEpochMs =
      currentState.completedAtEpochMs === null && progressAfter >= objectiveConfig.targetValue
        ? now
        : currentState.completedAtEpochMs

    const nextState: SaveReturnObjectiveStateV1 = {
      ...currentState,
      progressValue: progressAfter,
      completedAtEpochMs,
    }
    const nextSnapshot = setReturnObjectiveState(nextState)

    telemetry.track('return_objective_progressed', {
      tuningPackId: retentionTuningTelemetryPayload.tuningPackId,
      tuningPackVersion: retentionTuningTelemetryPayload.tuningPackVersion,
      fallbackReason: retentionTuningTelemetryPayload.fallbackReason,
      objectiveId: objectiveConfig.id,
      goalId: objectiveConfig.goalId,
      metric: objectiveConfig.metric,
      progressBefore,
      progressAfter,
      targetValue: objectiveConfig.targetValue,
      amount: normalizedAmount,
      source: source.trim().length > 0 ? source.trim() : 'unspecified',
      eventTimestampMs: now,
    })

    if (currentState.completedAtEpochMs === null && completedAtEpochMs !== null) {
      telemetry.track('return_objective_completed', {
        tuningPackId: retentionTuningTelemetryPayload.tuningPackId,
        tuningPackVersion: retentionTuningTelemetryPayload.tuningPackVersion,
        fallbackReason: retentionTuningTelemetryPayload.fallbackReason,
        objectiveId: objectiveConfig.id,
        goalId: objectiveConfig.goalId,
        metric: objectiveConfig.metric,
        targetValue: objectiveConfig.targetValue,
        rewardAmount: objectiveConfig.rewardAmount,
        progressValue: progressAfter,
        eventTimestampMs: now,
      })
    }

    return nextSnapshot
  }

  const claimReturnObjectiveReward = (
    source: string = 'unspecified',
  ): ReturnObjectiveClaimResult => {
    const normalizedSource = source.trim().length > 0 ? source.trim() : 'unspecified'
    const currentState = readReturnObjectiveState()
    const currentStreakState = readReturnObjectiveStreakState()
    const now = Date.now()
    const currentSnapshot = buildReturnObjectiveSnapshot(currentState, currentStreakState, now)

    if (!retentionFeatureFlags.objectiveLoopUiEnabled) {
      return {
        result: 'no_active_objective',
        rewardAmount: 0,
        balance: getCurrencyBalance(),
        state: currentSnapshot,
      }
    }

    if (currentState.activeObjectiveId === null) {
      return {
        result: 'no_active_objective',
        rewardAmount: 0,
        balance: getCurrencyBalance(),
        state: currentSnapshot,
      }
    }

    const objectiveConfig = getReturnObjectiveConfig(currentState.activeObjectiveId)
    const isCompleted =
      currentState.completedAtEpochMs !== null ||
      currentState.progressValue >= objectiveConfig.targetValue

    if (currentState.claimedAtEpochMs !== null) {
      return {
        result: 'already_claimed',
        rewardAmount: currentSnapshot.claimRewardAmount,
        balance: getCurrencyBalance(),
        state: currentSnapshot,
      }
    }

    if (!isCompleted) {
      return {
        result: 'not_completed',
        rewardAmount: currentSnapshot.claimRewardAmount,
        balance: getCurrencyBalance(),
        state: currentSnapshot,
      }
    }

    const streakBonusEnabled = retentionFeatureFlags.streakBonusEnabled
    const streakDecay = streakBonusEnabled
      ? resolveReturnObjectiveStreakDecay(currentStreakState, now)
      : {
          effectiveTier: 0,
          didDecay: false,
          elapsedMsSinceClaim: null,
          missedGraceWindows: 0,
        }
    const previousTier = streakBonusEnabled ? clampReturnObjectiveStreakTier(currentStreakState.tier) : 0
    const effectiveTierBeforeClaim = streakBonusEnabled ? streakDecay.effectiveTier : 0
    const nextStreakTier = streakBonusEnabled ? clampReturnObjectiveStreakTier(effectiveTierBeforeClaim + 1) : 0
    const claimReward = calculateReturnObjectiveStreakReward(objectiveConfig.rewardAmount, nextStreakTier)

    setReturnObjectiveState({
      ...currentState,
      completedAtEpochMs: currentState.completedAtEpochMs ?? now,
      claimedAtEpochMs: now,
      assignmentCycle: currentState.assignmentCycle + 1,
    })
    if (streakBonusEnabled) {
      setReturnObjectiveStreakState(
        {
          tier: nextStreakTier,
          lastClaimedAtEpochMs: now,
        },
        { persist: false },
      )
    }

    const balance = addCurrency(
      claimReward.totalRewardAmount,
      `return_objective_claim:${objectiveConfig.id}`,
    )

    telemetry.track('return_objective_claimed', {
      tuningPackId: retentionTuningTelemetryPayload.tuningPackId,
      tuningPackVersion: retentionTuningTelemetryPayload.tuningPackVersion,
      fallbackReason: retentionTuningTelemetryPayload.fallbackReason,
      objectiveId: objectiveConfig.id,
      goalId: objectiveConfig.goalId,
      metric: objectiveConfig.metric,
      targetValue: objectiveConfig.targetValue,
      rewardAmount: claimReward.totalRewardAmount,
      balance,
      source: normalizedSource,
      eventTimestampMs: now,
    })

    if (streakBonusEnabled) {
      if (streakDecay.didDecay) {
        telemetry.track('streak_reset', {
          previousTier,
          resetToTier: effectiveTierBeforeClaim,
          nextTier: nextStreakTier,
          elapsedMsSinceClaim: streakDecay.elapsedMsSinceClaim ?? 0,
          missedGraceWindows: streakDecay.missedGraceWindows,
          graceWindowMs: returnObjectiveStreakConfig.graceWindowMs,
          source: normalizedSource,
          eventTimestampMs: now,
        })
      }

      if (effectiveTierBeforeClaim <= 0) {
        telemetry.track('streak_started', {
          streakTier: nextStreakTier,
          graceWindowMs: returnObjectiveStreakConfig.graceWindowMs,
          source: normalizedSource,
          eventTimestampMs: now,
        })
      } else if (nextStreakTier > effectiveTierBeforeClaim) {
        telemetry.track('streak_advanced', {
          previousTier: effectiveTierBeforeClaim,
          nextTier: nextStreakTier,
          graceWindowMs: returnObjectiveStreakConfig.graceWindowMs,
          source: normalizedSource,
          eventTimestampMs: now,
        })
      }

      telemetry.track('streak_claim_bonus', {
        objectiveId: objectiveConfig.id,
        baseRewardAmount: claimReward.baseRewardAmount,
        streakTier: claimReward.streakTier,
        rewardMultiplier: claimReward.rewardMultiplier,
        rewardBonusAmount: claimReward.streakBonusAmount,
        totalRewardAmount: claimReward.totalRewardAmount,
        source: normalizedSource,
        eventTimestampMs: now,
      })
    }

    const nextState = assignDeterministicReturnObjective(`claim:${normalizedSource}`)

    return {
      result: 'claimed',
      rewardAmount: claimReward.totalRewardAmount,
      balance,
      state: nextState,
    }
  }

  const applyHydratedSaveState = (saveState: SaveStateV1): void => {
    suppressSaveWrites = true
    try {
      game.registry.set(INVENTORY_REGISTRY_KEY, normalizeInventorySnapshot({ ...saveState.inventory }))
      game.registry.set(CURRENCY_REGISTRY_KEY, Math.floor(saveState.currency))
      game.registry.set(FTUE_STATE_REGISTRY_KEY, normalizeFtueState(saveState.ftue))
      game.registry.set(
        RETURN_OBJECTIVE_STATE_REGISTRY_KEY,
        normalizeReturnObjectiveState(saveState.returnObjective),
      )
      game.registry.set(
        RETURN_OBJECTIVE_STREAK_STATE_REGISTRY_KEY,
        normalizeReturnObjectiveStreakState(saveState.returnObjectiveStreak),
      )
      game.registry.set(BARN_STATE_REGISTRY_KEY, normalizeBarnSaveState(saveState.barn))
      game.registry.set(
        EXPANSION_TIER_REGISTRY_KEY,
        clampExpansionTier(saveState.progression.expansionTier),
      )
      game.registry.set(
        UPGRADE_LEVELS_REGISTRY_KEY,
        normalizeUpgradeLevels(saveState.progression.upgrades),
      )
      setRanchStateSnapshot({
        activeSeedId: saveState.progression.activeSeedId,
        crops: saveState.ranch.crops,
        animals: saveState.ranch.animals,
      })
      preferredStartupScene =
        saveState.progression.activeScene === null
          ? SCENE_KEYS.ranch
          : saveState.progression.activeScene
      game.registry.set(ACTIVE_SCENE_REGISTRY_KEY, null)
    } finally {
      suppressSaveWrites = false
    }
  }

  const getPreferredStartupScene = (): PlayableSceneKey => {
    return preferredStartupScene
  }

  const readSavedGameState = (): SaveStorageReadResult => {
    return saveStorage.read()
  }

  const getPendingReturnSessionSummary = (): ReturnSessionSummary | null => {
    return pendingReturnSessionSummary
  }

  const dismissReturnSessionSummary = (
    source: ReturnSessionSummaryDismissSource = 'unknown',
  ): ReturnSessionSummary | null => {
    if (!pendingReturnSessionSummary) {
      return null
    }

    const summary = pendingReturnSessionSummary
    pendingReturnSessionSummary = null

    if (summary.totalItemsGranted > 0) {
      telemetry.track('offline_progress_summary_claimed', {
        source,
        offlineElapsedMs: summary.offlineElapsedMs,
        effectiveElapsedMs: summary.effectiveElapsedMs,
        totalItemsGranted: summary.totalItemsGranted,
        totalEstimatedSellValue: summary.totalEstimatedSellValue,
        cropsHarvested: summary.cropsHarvested,
        animalProductsCollected: summary.animalProductsCollected,
        rewardBreakdown: formatReturnSessionRewards(summary),
        eventTimestampMs: Date.now(),
      })
    }

    return summary
  }

  const trackFirstLaunch = (result: SaveHydrationResult): void => {
    firstSessionFunnel.trackLaunch({
      startupScene: result.startupScene,
      startupOutcome: result.outcome,
      source: 'boot_hydration',
    })
  }

  const resetSavedGameState = (): void => {
    const readResult = readSavedGameState()
    const analyticsMetadata =
      readResult.state !== null
        ? buildSaveAnalyticsMetadata(readResult.state)
        : readResult.error
          ? UNKNOWN_SAVE_ANALYTICS_METADATA
          : EMPTY_SAVE_ANALYTICS_METADATA

    telemetry.track('save_reset_action', analyticsMetadata)

    try {
      saveStorage.reset()
    } catch {
      telemetry.track('save_reset_failed', analyticsMetadata)
    }
  }

  const hydrateSavedGameStateOnBoot = (): SaveHydrationResult => {
    if (bootHydrationResult) {
      trackFirstLaunch(bootHydrationResult)
      return bootHydrationResult
    }

    const readResult = readSavedGameState()

    if (readResult.state) {
      const nowEpochMs = Date.now()
      const catchUpResult = applyOfflineProgressCatchUp(readResult.state, nowEpochMs)
      applyHydratedSaveState(catchUpResult.saveState)
      ensureReturnObjectiveAssignedForSession('boot_hydration')
      pendingReturnSessionSummary = catchUpResult.summary
      telemetry.track('save_load_success', buildSaveAnalyticsMetadata(catchUpResult.saveState))
      bootHydrationResult = {
        outcome: 'hydrated',
        errorCode: null,
        startupScene: preferredStartupScene,
      }

      const offlineElapsedMs = Math.max(0, nowEpochMs - readResult.state.metadata.savedAtEpochMs)
      telemetry.track('return_session_started', {
        startupOutcome: bootHydrationResult.outcome,
        startupScene: bootHydrationResult.startupScene,
        hadSavedState: true,
        offlineElapsedMs,
        effectiveElapsedMs: pendingReturnSessionSummary?.effectiveElapsedMs ?? null,
        totalItemsGranted: pendingReturnSessionSummary?.totalItemsGranted ?? 0,
        totalEstimatedSellValue: pendingReturnSessionSummary?.totalEstimatedSellValue ?? 0,
        rewardsGranted: (pendingReturnSessionSummary?.totalItemsGranted ?? 0) > 0,
      })

      const grantedOfflineRewardsSummary =
        pendingReturnSessionSummary && pendingReturnSessionSummary.totalItemsGranted > 0
          ? pendingReturnSessionSummary
          : null

      if (grantedOfflineRewardsSummary) {
        telemetry.track('offline_progress_granted', {
          offlineElapsedMs: grantedOfflineRewardsSummary.offlineElapsedMs,
          effectiveElapsedMs: grantedOfflineRewardsSummary.effectiveElapsedMs,
          wasOfflineTimeCapped: grantedOfflineRewardsSummary.wasOfflineTimeCapped,
          wasRewardCapReached: grantedOfflineRewardsSummary.wasRewardCapReached,
          totalItemsGranted: grantedOfflineRewardsSummary.totalItemsGranted,
          totalEstimatedSellValue: grantedOfflineRewardsSummary.totalEstimatedSellValue,
          cropsHarvested: grantedOfflineRewardsSummary.cropsHarvested,
          animalProductsCollected: grantedOfflineRewardsSummary.animalProductsCollected,
          rewardBreakdown: formatReturnSessionRewards(grantedOfflineRewardsSummary),
          eventTimestampMs: nowEpochMs,
        })
      }

      trackFirstLaunch(bootHydrationResult)
      return bootHydrationResult
    }

    setDefaultRuntimeState()
    ensureReturnObjectiveAssignedForSession('boot_default')
    preferredStartupScene = SCENE_KEYS.ranch
    pendingReturnSessionSummary = null

    if (!readResult.error) {
      telemetry.track('save_load_success', EMPTY_SAVE_ANALYTICS_METADATA)
      bootHydrationResult = {
        outcome: 'empty',
        errorCode: null,
        startupScene: preferredStartupScene,
      }
      telemetry.track('return_session_started', {
        startupOutcome: bootHydrationResult.outcome,
        startupScene: bootHydrationResult.startupScene,
        hadSavedState: false,
        offlineElapsedMs: 0,
        effectiveElapsedMs: null,
        totalItemsGranted: 0,
        totalEstimatedSellValue: 0,
        rewardsGranted: false,
      })
      trackFirstLaunch(bootHydrationResult)
      return bootHydrationResult
    }

    const errorCode = readResult.error.code
    if (errorCode !== 'storage_unavailable') {
      resetSavedGameState()
    }

    telemetry.track('save_load_failure', UNKNOWN_SAVE_ANALYTICS_METADATA)
    bootHydrationResult = {
      outcome: 'fallback_default',
      errorCode,
      startupScene: preferredStartupScene,
    }
    telemetry.track('return_session_started', {
      startupOutcome: bootHydrationResult.outcome,
      startupScene: bootHydrationResult.startupScene,
      hadSavedState: false,
      offlineElapsedMs: 0,
      effectiveElapsedMs: null,
      totalItemsGranted: 0,
      totalEstimatedSellValue: 0,
      rewardsGranted: false,
    })
    trackFirstLaunch(bootHydrationResult)
    return bootHydrationResult
  }

  const onInventoryChanged = (listener: InventoryChangeListener): (() => void) => {
    const handler = (change: InventoryChange): void => {
      listener(getInventorySnapshot(), change)
    }

    game.events.on(INVENTORY_CHANGED_EVENT, handler)
    return () => {
      game.events.off(INVENTORY_CHANGED_EVENT, handler)
    }
  }

  const onCurrencyChanged = (listener: CurrencyChangeListener): (() => void) => {
    const handler = (change: CurrencyChange): void => {
      listener(getCurrencyBalance(), change)
    }

    game.events.on(CURRENCY_CHANGED_EVENT, handler)
    return () => {
      game.events.off(CURRENCY_CHANGED_EVENT, handler)
    }
  }

  const onBarnStateChanged = (listener: BarnStateChangeListener): (() => void) => {
    const handler = (snapshot: BarnStateSnapshot): void => {
      listener(snapshot)
    }

    game.events.on(BARN_STATE_CHANGED_EVENT, handler)
    return () => {
      game.events.off(BARN_STATE_CHANGED_EVENT, handler)
    }
  }

  const onExpansionStateChanged = (listener: ExpansionStateChangeListener): (() => void) => {
    const handler = (snapshot: ExpansionStateSnapshot): void => {
      listener(snapshot)
    }

    game.events.on(EXPANSION_TIER_CHANGED_EVENT, handler)
    return () => {
      game.events.off(EXPANSION_TIER_CHANGED_EVENT, handler)
    }
  }

  const onUpgradeStateChanged = (listener: UpgradeStateChangeListener): (() => void) => {
    const handler = (snapshot: UpgradeStateSnapshot): void => {
      listener(snapshot)
    }

    game.events.on(UPGRADE_LEVELS_CHANGED_EVENT, handler)
    return () => {
      game.events.off(UPGRADE_LEVELS_CHANGED_EVENT, handler)
    }
  }

  const onFtueStateChanged = (listener: FtueStateChangeListener): (() => void) => {
    const handler = (snapshot: FtueStateSnapshot): void => {
      listener(snapshot)
    }

    game.events.on(FTUE_CHANGED_EVENT, handler)
    return () => {
      game.events.off(FTUE_CHANGED_EVENT, handler)
    }
  }

  const onReturnObjectiveStateChanged = (
    listener: ReturnObjectiveStateChangeListener,
  ): (() => void) => {
    const handler = (snapshot: ReturnObjectiveStateSnapshot): void => {
      listener(snapshot)
    }

    game.events.on(RETURN_OBJECTIVE_CHANGED_EVENT, handler)
    return () => {
      game.events.off(RETURN_OBJECTIVE_CHANGED_EVENT, handler)
    }
  }

  const setActiveScene = (sceneKey: PlayableSceneKey): void => {
    const currentScene = getActiveScene()

    if (currentScene === sceneKey && game.scene.isActive(sceneKey)) {
      return
    }

    if (currentScene !== null && game.scene.isActive(currentScene)) {
      game.scene.stop(currentScene)
    }

    game.scene.start(sceneKey)
    game.registry.set(ACTIVE_SCENE_REGISTRY_KEY, sceneKey)

    if (!trackedFirstPlayableScene) {
      trackedFirstPlayableScene = true
      const bootToFirstPlayableMs = performance.since('boot:start')

      telemetry.track('startup_first_playable', {
        scene: sceneKey,
        bootToFirstPlayableMs:
          bootToFirstPlayableMs === null ? -1 : Math.round(bootToFirstPlayableMs),
        cohort: resolveCohort(),
        viewportWidth: Math.round(game.scale.width),
        viewportHeight: Math.round(game.scale.height),
      })
    }

    telemetry.track('scene_changed', {
      from: currentScene,
      to: sceneKey,
    })
    game.events.emit('tiny-ranch:scene-changed', sceneKey)
    persistCurrentState()
  }

  const saveGameState = (): SaveStateV1 => {
    const saveState = buildSaveStateSnapshot()
    writeSaveStateSafely(saveState)
    return saveState
  }

  return {
    telemetry,
    performance,
    firstSessionFunnel,
    navigate: setActiveScene,
    getActiveScene,
    getPreferredStartupScene,
    hydrateSavedGameStateOnBoot,
    addInventoryItem,
    removeInventoryItem,
    sellInventoryItem,
    getInventorySnapshot,
    onInventoryChanged,
    addCurrency,
    getCurrencyBalance,
    onCurrencyChanged,
    getBarnStateSnapshot,
    getBarnRecipeUnlockState,
    startBarnJob,
    claimBarnJob,
    fulfillBarnMarketOrders,
    onBarnStateChanged,
    getExpansionStateSnapshot,
    purchaseNextExpansionTier,
    onExpansionStateChanged,
    getUpgradeStateSnapshot,
    purchaseUpgrade,
    onUpgradeStateChanged,
    getFtueStateSnapshot,
    getBarnHandoffStateSnapshot,
    advanceFtue,
    onFtueStateChanged,
    getReturnObjectiveStateSnapshot,
    progressReturnObjective,
    claimReturnObjectiveReward,
    onReturnObjectiveStateChanged,
    getRanchStateSnapshot: readRanchStateSnapshot,
    setRanchStateSnapshot,
    getPendingReturnSessionSummary,
    dismissReturnSessionSummary,
    saveGameState,
    readSavedGameState,
    resetSavedGameState,
  }
}

export function registerGameServices(game: Phaser.Game, services: GameServices): void {
  game.registry.set(REGISTRY_KEY, services)
}

export function getGameServices(scene: Phaser.Scene): GameServices {
  const services = scene.game.registry.get(REGISTRY_KEY)

  if (!services) {
    throw new Error('Game services have not been registered')
  }

  return services as GameServices
}
