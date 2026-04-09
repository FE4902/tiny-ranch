import Phaser from 'phaser'

import { animalProductionConfigs } from '../config/animals'
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
  type UpgradeEffectSnapshot,
  type UpgradeId,
  type UpgradeLevels,
} from '../config/upgrades'
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
  SAVE_SCHEMA_VERSION,
  type SaveAnimalStateV1,
  type SaveCropStateV1,
  type SaveFtueStateV1,
  type SaveStateV1,
  createDefaultFtueSaveState,
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

export interface FtueStateSnapshot {
  enabled: boolean
  currentStep: FtueStepId | null
  completedAtEpochMs: number | null
  isCompleted: boolean
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
export type FtueStateChangeListener = (state: FtueStateSnapshot) => void
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
  getExpansionStateSnapshot: () => ExpansionStateSnapshot
  purchaseNextExpansionTier: (source?: string) => ExpansionPurchaseResult
  onExpansionStateChanged: (listener: ExpansionStateChangeListener) => () => void
  getUpgradeStateSnapshot: () => UpgradeStateSnapshot
  purchaseUpgrade: (upgradeId: UpgradeId, source?: string) => UpgradePurchaseResult
  onUpgradeStateChanged: (listener: UpgradeStateChangeListener) => () => void
  getFtueStateSnapshot: () => FtueStateSnapshot
  advanceFtue: (signal: FtueProgressSignal) => FtueStateSnapshot
  onFtueStateChanged: (listener: FtueStateChangeListener) => () => void
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

  return hasValidStep && hasValidCompletionTimestamp
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

  if (normalizedStep !== null) {
    return {
      currentStep: normalizedStep,
      completedAtEpochMs: null,
    }
  }

  return {
    currentStep: null,
    completedAtEpochMs: normalizedCompletedAt ?? Date.now(),
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
    game.registry.set(EXPANSION_TIER_REGISTRY_KEY, getDefaultExpansionTier())
    game.registry.set(UPGRADE_LEVELS_REGISTRY_KEY, createDefaultUpgradeLevels())
    game.registry.set(ACTIVE_SCENE_REGISTRY_KEY, null)
  }

  setDefaultRuntimeState()

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

  const readFtueState = (): SaveFtueStateV1 => {
    const rawState = game.registry.get(FTUE_STATE_REGISTRY_KEY)
    if (!isSaveFtueState(rawState)) {
      return createDefaultFtueSaveState()
    }

    return normalizeFtueState(rawState)
  }

  const getFtueStateSnapshot = (): FtueStateSnapshot => {
    const state = readFtueState()

    return {
      enabled: ftueConfig.enabledByDefault,
      currentStep: ftueConfig.enabledByDefault ? state.currentStep : null,
      completedAtEpochMs: state.completedAtEpochMs,
      isCompleted: state.currentStep === null,
    }
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
    const handlePageHide = (): void => {
      trackSessionEnd('pagehide')
    }
    const handleBeforeUnload = (): void => {
      trackSessionEnd('beforeunload')
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)

    game.events.once(Phaser.Core.Events.DESTROY, () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      trackSessionEnd('game_destroyed')
    })
  }

  const buildSaveStateSnapshot = (): SaveStateV1 => {
    const ranchSnapshot = readRanchStateSnapshot()
    const ftueState = readFtueState()
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
    game.registry.set(INVENTORY_REGISTRY_KEY, nextInventory)

    const change: InventoryChange = {
      itemId: normalized.itemId,
      quantity: normalized.quantity,
      total: nextTotal,
      timestampMs: Date.now(),
    }

    game.events.emit(INVENTORY_CHANGED_EVENT, change)
    persistCurrentState()
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

    game.registry.set(INVENTORY_REGISTRY_KEY, nextInventory)
    const change: InventoryChange = {
      itemId: normalized.itemId,
      quantity: -normalized.quantity,
      total: nextTotal,
      timestampMs: Date.now(),
    }

    game.events.emit(INVENTORY_CHANGED_EVENT, change)
    persistCurrentState()
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

    game.registry.set(CURRENCY_REGISTRY_KEY, nextBalance)
    const change: CurrencyChange = {
      amount: normalizedAmount,
      balance: nextBalance,
      reason: normalizedReason,
      timestampMs: Date.now(),
    }

    telemetry.track('currency_changed', {
      amount: normalizedAmount,
      balance: nextBalance,
      reason: normalizedReason,
      eventTimestampMs: change.timestampMs,
    })
    game.events.emit(CURRENCY_CHANGED_EVENT, change)
    persistCurrentState()
    return nextBalance
  }

  const addCurrency = (amount: number, reason: string = 'unspecified'): CurrencyBalance => {
    return applyCurrencyDelta(amount, reason)
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

  const setFtueState = (state: SaveFtueStateV1): FtueStateSnapshot => {
    const normalizedState = normalizeFtueState(state)
    game.registry.set(FTUE_STATE_REGISTRY_KEY, normalizedState)
    const snapshot = getFtueStateSnapshot()
    game.events.emit(FTUE_CHANGED_EVENT, snapshot)
    persistCurrentState()
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

  const applyHydratedSaveState = (saveState: SaveStateV1): void => {
    suppressSaveWrites = true
    try {
      game.registry.set(INVENTORY_REGISTRY_KEY, normalizeInventorySnapshot({ ...saveState.inventory }))
      game.registry.set(CURRENCY_REGISTRY_KEY, Math.floor(saveState.currency))
      game.registry.set(FTUE_STATE_REGISTRY_KEY, normalizeFtueState(saveState.ftue))
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
        rewardsGranted: pendingReturnSessionSummary !== null,
      })

      if (pendingReturnSessionSummary) {
        telemetry.track('offline_progress_granted', {
          offlineElapsedMs: pendingReturnSessionSummary.offlineElapsedMs,
          effectiveElapsedMs: pendingReturnSessionSummary.effectiveElapsedMs,
          wasOfflineTimeCapped: pendingReturnSessionSummary.wasOfflineTimeCapped,
          wasRewardCapReached: pendingReturnSessionSummary.wasRewardCapReached,
          totalItemsGranted: pendingReturnSessionSummary.totalItemsGranted,
          totalEstimatedSellValue: pendingReturnSessionSummary.totalEstimatedSellValue,
          cropsHarvested: pendingReturnSessionSummary.cropsHarvested,
          animalProductsCollected: pendingReturnSessionSummary.animalProductsCollected,
          rewardBreakdown: formatReturnSessionRewards(pendingReturnSessionSummary),
          eventTimestampMs: nowEpochMs,
        })
      }

      trackFirstLaunch(bootHydrationResult)
      return bootHydrationResult
    }

    setDefaultRuntimeState()
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
    getExpansionStateSnapshot,
    purchaseNextExpansionTier,
    onExpansionStateChanged,
    getUpgradeStateSnapshot,
    purchaseUpgrade,
    onUpgradeStateChanged,
    getFtueStateSnapshot,
    advanceFtue,
    onFtueStateChanged,
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
