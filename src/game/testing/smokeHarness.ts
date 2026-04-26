import type Phaser from 'phaser'

import type { BarnProcessingRecipeId } from '../config/barn'
import type { CropSeedId } from '../config/crops'
import { getCropSeedConfig } from '../config/crops'
import { getItemSellPrice } from '../config/economy'
import { SCENE_KEYS, type PlayableSceneKey } from '../constants'
import { ranchMapContract, type RanchMapContract } from '../maps/ranchMap'
import type { BarnScene, BarnSceneDebugUiSnapshot } from '../scenes/BarnScene'
import type { RanchScene } from '../scenes/RanchScene'
import type { UiScene, UiSceneDebugReturnSessionSummaryModalSnapshot } from '../scenes/UiScene'
import { getGameServices } from '../systems/runtime'

const SMOKE_QUERY_PARAM = 'smokeTest'
const SMOKE_WINDOW_KEY = '__TINY_RANCH_SMOKE__'
const SAVE_STORAGE_KEY = 'tiny-ranch:save-state'
const DEFAULT_READY_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 50
const SMOKE_TILE = Object.freeze({ x: 3, y: 10 })
const EXPANSION_WELL_INTERACTABLE_ID = 'zone:utility_well'
const DEFAULT_LONG_FRAME_THRESHOLD_MS = 50
const MAX_FRAME_HEALTH_SAMPLE_COUNT = 20_000

type InputSource = 'keyboard' | 'pointer'
type SellPointId = 'shipping_crate' | 'market_stall' | 'unknown'
type ExpansionInputSource = 'keyboard' | 'pointer'

interface DebugPlantedCrop {
  seedId: CropSeedId
  plantedAtEpochMs: number
}

interface RanchSceneDebugBindings {
  tryCropActionAtTile: (
    tileX: number,
    tileY: number,
    contract: RanchMapContract,
    inputSource: InputSource,
  ) => boolean
  trySellInventory: (sellPointId: SellPointId, inputSource: InputSource) => boolean
  tryPurchaseExpansion: (inputSource: ExpansionInputSource, interactableId: string) => boolean
  syncCropGrowthFromClock: () => void
  createTileKey: (tileX: number, tileY: number) => string
  plantedCrops: Map<string, DebugPlantedCrop>
}

interface SmokeSnapshot {
  activeScene: string | null
  currency: number
  inventory: Record<string, number>
  expansionTier: number
  nextExpansionCost: number | null
  ranchCropCount: number
  saveStateExists: boolean
}

interface CoreLoopRunResult {
  launchScene: string | null
  planted: boolean
  harvested: boolean
  sold: boolean
  expansionPurchased: boolean
  currencyAfterSale: number
  currencyAfterPurchase: number
  expansionTierAfterPurchase: number
  persistedExpansionTier: number | null
}

interface ScreenPoint {
  x: number
  y: number
}

interface FrameHealthSamplingOptions {
  longFrameThresholdMs?: number
}

interface FrameHealthMetrics {
  sampleCount: number
  sampledDurationMs: number
  averageFrameDurationMs: number
  p95FrameDurationMs: number
  maxFrameDurationMs: number
  longFrameCount: number
  longFrameThresholdMs: number
}

interface ReturnObjectiveSnapshot {
  objectiveLoopEnabled: boolean
  streakBonusEnabled: boolean
  retentionKillSwitchEnabled: boolean
  activeObjectiveId: string | null
  metric: 'harvest_count' | 'sell_value' | 'barn_claim_count' | null
  progressValue: number
  targetValue: number
  rewardAmount: number
  assignmentCycle: number
  streakTier: number
  claimRewardAmount: number
  nextStreakTier: number
  nextClaimRewardAmount: number
}

interface ReturnObjectiveClaimDebugResult {
  result: 'claimed' | 'not_completed' | 'already_claimed' | 'no_active_objective'
  awardedRewardAmount: number
  awardedStreakTier: number
  assignmentCycleAfterClaim: number
}

interface BarnJobSnapshot {
  id: string
  recipeId: string
  isReady: boolean
  remainingMs: number
}

interface BarnMarketOrderSnapshot {
  orderId: string
  payout: number
  baseSellValue: number
  premiumValue: number
  isFulfilled: boolean
  isClaimable: boolean
  fulfilledAtEpochMs: number | null
}

interface BarnSnapshot {
  balance: number
  inventory: Record<string, number>
  jobs: BarnJobSnapshot[]
  marketOrders: BarnMarketOrderSnapshot[]
}

interface BarnStartDebugResult {
  result: 'started' | 'locked' | 'insufficient_items' | 'insufficient_funds'
  jobId: string | null
  balance: number
  jobCount: number
}

interface BarnClaimDebugResult {
  result: 'claimed' | 'processing' | 'not_found'
  recipeId: string | null
  balance: number
  jobCount: number
}

interface InventorySellDebugResult {
  sold: boolean
  balance: number
  inventory: Record<string, number>
}

interface BarnUiSnapshot {
  selectedRecipeId: string
  inventoryText: string
  recipeDetailText: string
  jobListText: string
  feedbackText: string
  cycleRecipeButtonCenter: ScreenPoint | null
  startRecipeButtonCenter: ScreenPoint | null
  claimButtonCenter: ScreenPoint | null
}

interface ReturnSessionSummaryModalSnapshot {
  isVisible: boolean
  titleText: string
  subtitleText: string
  rewardsText: string
}

interface TinyRanchSmokeHarness {
  waitForReady(timeoutMs?: number): Promise<void>
  runCoreLoopFlow(): CoreLoopRunResult
  getSnapshot(): SmokeSnapshot
  getReturnObjectiveSnapshot(): ReturnObjectiveSnapshot
  debugClaimCurrentReturnObjective(): ReturnObjectiveClaimDebugResult
  getBarnSnapshot(): BarnSnapshot
  getBarnUiSnapshot(): BarnUiSnapshot
  getReturnSessionSummaryModalSnapshot(): ReturnSessionSummaryModalSnapshot
  debugStartBarnJob(recipeId: BarnProcessingRecipeId): BarnStartDebugResult
  debugClaimBarnJob(jobId: string): BarnClaimDebugResult
  debugSellInventory(sellPointId?: SellPointId): InventorySellDebugResult
  debugNavigate(sceneKey: PlayableSceneKey): void
  debugSaveGameState(): unknown
  debugPersistLegacySaveWithoutStreak(): void
  getTileScreenPoint(tileX: number, tileY: number): ScreenPoint
  debugGetPlantedCropTiles(): Array<{ x: number; y: number }>
  debugForceCropToMature(tileX: number, tileY: number): void
  debugSeedInventory(itemId: string, quantity: number): void
  startFrameHealthSampling(options?: FrameHealthSamplingOptions): void
  stopFrameHealthSampling(): FrameHealthMetrics
}

type SmokeWindow = Window & {
  [SMOKE_WINDOW_KEY]?: TinyRanchSmokeHarness
}

function isSmokeModeEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const queryFlag = new URLSearchParams(window.location.search).get(SMOKE_QUERY_PARAM)
  return queryFlag === '1' || queryFlag === 'true'
}

function resolveRanchScene(game: Phaser.Game): RanchScene | null {
  if (!game.scene.isActive(SCENE_KEYS.ranch)) {
    return null
  }

  return game.scene.getScene(SCENE_KEYS.ranch) as RanchScene
}

function resolveBarnScene(game: Phaser.Game): BarnScene | null {
  if (!game.scene.isActive(SCENE_KEYS.barn)) {
    return null
  }

  return game.scene.getScene(SCENE_KEYS.barn) as BarnScene
}

function resolveUiScene(game: Phaser.Game): UiScene | null {
  if (!game.scene.isActive(SCENE_KEYS.ui)) {
    return null
  }

  return game.scene.getScene(SCENE_KEYS.ui) as UiScene
}

function resolveServiceScene(game: Phaser.Game): Phaser.Scene | null {
  if (game.scene.isActive(SCENE_KEYS.ui)) {
    return game.scene.getScene(SCENE_KEYS.ui)
  }

  if (game.scene.isActive(SCENE_KEYS.ranch)) {
    return game.scene.getScene(SCENE_KEYS.ranch)
  }

  if (game.scene.isActive(SCENE_KEYS.barn)) {
    return game.scene.getScene(SCENE_KEYS.barn)
  }

  return null
}

function getRanchSceneOrThrow(game: Phaser.Game): RanchScene {
  const scene = resolveRanchScene(game)
  if (scene) {
    return scene
  }

  throw new Error('Ranch scene is not active yet.')
}

function getBarnSceneOrThrow(game: Phaser.Game): BarnScene {
  const scene = resolveBarnScene(game)
  if (scene) {
    return scene
  }

  throw new Error('Barn scene is not active yet.')
}

function getUiSceneOrThrow(game: Phaser.Game): UiScene {
  const scene = resolveUiScene(game)
  if (scene) {
    return scene
  }

  throw new Error('UI scene is not active yet.')
}

function getServiceSceneOrThrow(game: Phaser.Game): Phaser.Scene {
  const scene = resolveServiceScene(game)
  if (scene) {
    return scene
  }

  throw new Error('No active game scene is available yet.')
}

function getDebugBindings(scene: RanchScene): RanchSceneDebugBindings {
  return scene as unknown as RanchSceneDebugBindings
}

function waitForReady(game: Phaser.Game, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const checkReady = (): void => {
      const scene = resolveServiceScene(game)
      if (scene) {
        try {
          const services = getGameServices(scene)
          const activeScene = services.getActiveScene()
          if (activeScene !== null && game.scene.isActive(activeScene)) {
            resolve()
            return
          }
        } catch {
          // Keep polling until services are available.
        }
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out waiting for Tiny Ranch scene readiness after ${timeoutMs}ms.`))
        return
      }

      window.setTimeout(checkReady, POLL_INTERVAL_MS)
    }

    checkReady()
  })
}

function forceCropToMature(sceneBindings: RanchSceneDebugBindings, tileX: number, tileY: number): void {
  const tileKey = sceneBindings.createTileKey(tileX, tileY)
  const crop = sceneBindings.plantedCrops.get(tileKey)
  if (!crop) {
    throw new Error(`No planted crop found at tile ${tileX},${tileY}.`)
  }

  const seedConfig = getCropSeedConfig(crop.seedId)
  const totalGrowthMs = seedConfig.stageDurationsMs.reduce((sum, durationMs) => sum + durationMs, 0)
  crop.plantedAtEpochMs = Date.now() - totalGrowthMs - 1
  sceneBindings.syncCropGrowthFromClock()
}

function getTileScreenPoint(game: Phaser.Game, tileX: number, tileY: number): ScreenPoint {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
    throw new Error('Tile coordinates must be finite numbers.')
  }

  const scene = getRanchSceneOrThrow(game)
  const mapRoot = (scene as unknown as { mapRoot?: Phaser.GameObjects.Container }).mapRoot
  if (!mapRoot) {
    throw new Error('Ranch map root is not available yet.')
  }

  const canvas = game.canvas as HTMLCanvasElement | null
  if (!canvas) {
    throw new Error('Game canvas is not available.')
  }

  const rect = canvas.getBoundingClientRect()
  const canvasGameWidth = game.scale.width
  const canvasGameHeight = game.scale.height
  if (!Number.isFinite(canvasGameWidth) || !Number.isFinite(canvasGameHeight)) {
    throw new Error('Game scale dimensions are not available.')
  }

  const cssScaleX = rect.width / canvasGameWidth
  const cssScaleY = rect.height / canvasGameHeight
  const tileCenterWorldX = (Math.floor(tileX) + 0.5) * ranchMapContract.tileSize
  const tileCenterWorldY = (Math.floor(tileY) + 0.5) * ranchMapContract.tileSize

  return {
    x: rect.left + (mapRoot.x + tileCenterWorldX * mapRoot.scaleX) * cssScaleX,
    y: rect.top + (mapRoot.y + tileCenterWorldY * mapRoot.scaleY) * cssScaleY,
  }
}

function debugForceCropToMature(game: Phaser.Game, tileX: number, tileY: number): void {
  const sceneBindings = getDebugBindings(getRanchSceneOrThrow(game))
  forceCropToMature(sceneBindings, Math.floor(tileX), Math.floor(tileY))
}

function debugGetPlantedCropTiles(game: Phaser.Game): Array<{ x: number; y: number }> {
  const sceneBindings = getDebugBindings(getRanchSceneOrThrow(game))
  const plantedTiles: Array<{ x: number; y: number }> = []

  for (const tileKey of sceneBindings.plantedCrops.keys()) {
    const [xToken, yToken] = tileKey.split(':')
    const x = Number.parseInt(xToken, 10)
    const y = Number.parseInt(yToken, 10)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      plantedTiles.push({ x, y })
    }
  }

  return plantedTiles
}

function debugSeedInventory(game: Phaser.Game, itemId: string, quantity: number): void {
  if (typeof itemId !== 'string' || itemId.trim().length === 0) {
    throw new Error('Inventory item id must be a non-empty string.')
  }

  if (!Number.isFinite(quantity) || Math.floor(quantity) <= 0) {
    throw new Error('Inventory quantity must be a positive integer.')
  }

  const services = getGameServices(getServiceSceneOrThrow(game))
  services.addInventoryItem(itemId, Math.floor(quantity))
}

class FrameHealthSampler {
  private readonly frameDurationsMs: number[] = []
  private longFrameThresholdMs = DEFAULT_LONG_FRAME_THRESHOLD_MS
  private firstFrameTimestamp: number | null = null
  private lastFrameTimestamp: number | null = null
  private rafId: number | null = null
  private running = false

  start(options: FrameHealthSamplingOptions = {}): void {
    if (this.running) {
      throw new Error('Frame health sampling is already running.')
    }

    const thresholdMs = options.longFrameThresholdMs ?? DEFAULT_LONG_FRAME_THRESHOLD_MS
    if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) {
      throw new Error('Frame health long-frame threshold must be a positive number.')
    }

    this.frameDurationsMs.length = 0
    this.longFrameThresholdMs = thresholdMs
    this.firstFrameTimestamp = null
    this.lastFrameTimestamp = null
    this.running = true
    this.rafId = window.requestAnimationFrame(this.collectFrameSample)
  }

  stop(): FrameHealthMetrics {
    if (!this.running) {
      throw new Error('Frame health sampling is not running.')
    }

    this.running = false
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    return this.buildMetrics()
  }

  private readonly collectFrameSample = (timestamp: number): void => {
    if (!this.running) {
      return
    }

    if (this.lastFrameTimestamp === null) {
      this.firstFrameTimestamp = timestamp
      this.lastFrameTimestamp = timestamp
      this.rafId = window.requestAnimationFrame(this.collectFrameSample)
      return
    }

    const frameDurationMs = Math.max(0, timestamp - this.lastFrameTimestamp)
    this.lastFrameTimestamp = timestamp
    if (this.frameDurationsMs.length < MAX_FRAME_HEALTH_SAMPLE_COUNT) {
      this.frameDurationsMs.push(frameDurationMs)
    }

    this.rafId = window.requestAnimationFrame(this.collectFrameSample)
  }

  private buildMetrics(): FrameHealthMetrics {
    const sampleCount = this.frameDurationsMs.length
    const sortedDurations = [...this.frameDurationsMs].sort((a, b) => a - b)
    const totalFrameDurationMs = this.frameDurationsMs.reduce(
      (sum, durationMs) => sum + durationMs,
      0,
    )

    const p95Index = sampleCount > 0 ? Math.max(0, Math.ceil(sampleCount * 0.95) - 1) : 0
    const p95FrameDurationMs = sampleCount > 0 ? sortedDurations[p95Index] : 0
    const maxFrameDurationMs = sampleCount > 0 ? sortedDurations[sampleCount - 1] : 0
    const sampledDurationMs =
      this.firstFrameTimestamp !== null && this.lastFrameTimestamp !== null
        ? Math.max(0, this.lastFrameTimestamp - this.firstFrameTimestamp)
        : 0
    const longFrameCount = this.frameDurationsMs.reduce(
      (count, durationMs) =>
        count + (durationMs > this.longFrameThresholdMs ? 1 : 0),
      0,
    )

    return {
      sampleCount,
      sampledDurationMs,
      averageFrameDurationMs: sampleCount > 0 ? totalFrameDurationMs / sampleCount : 0,
      p95FrameDurationMs,
      maxFrameDurationMs,
      longFrameCount,
      longFrameThresholdMs: this.longFrameThresholdMs,
    }
  }
}

function runCoreLoopFlow(game: Phaser.Game): CoreLoopRunResult {
  const ranchScene = getRanchSceneOrThrow(game)
  const sceneBindings = getDebugBindings(ranchScene)
  const services = getGameServices(ranchScene)

  const launchScene = services.getActiveScene()
  const planted = sceneBindings.tryCropActionAtTile(
    SMOKE_TILE.x,
    SMOKE_TILE.y,
    ranchMapContract,
    'pointer',
  )
  if (!planted) {
    throw new Error('Smoke flow failed on plant step.')
  }

  forceCropToMature(sceneBindings, SMOKE_TILE.x, SMOKE_TILE.y)

  const harvested = sceneBindings.tryCropActionAtTile(
    SMOKE_TILE.x,
    SMOKE_TILE.y,
    ranchMapContract,
    'pointer',
  )
  if (!harvested) {
    throw new Error('Smoke flow failed on harvest step.')
  }

  const expansionCost = services.getExpansionStateSnapshot().nextCost
  if (expansionCost === null) {
    throw new Error('Smoke flow expected an available expansion tier cost.')
  }

  const missingCoinsForExpansion = Math.max(0, expansionCost - services.getCurrencyBalance())
  const turnipUnitPrice = getItemSellPrice('turnip')
  const extraTurnipsNeededForExpansion = Math.ceil(missingCoinsForExpansion / turnipUnitPrice)
  if (extraTurnipsNeededForExpansion > 0) {
    services.addInventoryItem('turnip', extraTurnipsNeededForExpansion)
  }

  const sold = sceneBindings.trySellInventory('shipping_crate', 'pointer')
  if (!sold) {
    throw new Error('Smoke flow failed on sell step.')
  }
  const currencyAfterSale = services.getCurrencyBalance()

  const expansionPurchased = sceneBindings.tryPurchaseExpansion(
    'pointer',
    EXPANSION_WELL_INTERACTABLE_ID,
  )
  if (!expansionPurchased) {
    throw new Error('Smoke flow failed on expansion purchase step.')
  }

  const expansionTierAfterPurchase = services.getExpansionStateSnapshot().currentTier
  if (expansionTierAfterPurchase < 2) {
    throw new Error(`Expected expansion tier 2+, got ${expansionTierAfterPurchase}.`)
  }

  const currencyAfterPurchase = services.getCurrencyBalance()
  const saveState = services.saveGameState()

  return {
    launchScene,
    planted,
    harvested,
    sold,
    expansionPurchased,
    currencyAfterSale,
    currencyAfterPurchase,
    expansionTierAfterPurchase,
    persistedExpansionTier: saveState.progression.expansionTier,
  }
}

function getSnapshot(game: Phaser.Game): SmokeSnapshot {
  const services = getGameServices(getServiceSceneOrThrow(game))
  const expansionState = services.getExpansionStateSnapshot()
  const readResult = services.readSavedGameState()

  return {
    activeScene: services.getActiveScene(),
    currency: services.getCurrencyBalance(),
    inventory: { ...services.getInventorySnapshot() },
    expansionTier: expansionState.currentTier,
    nextExpansionCost: expansionState.nextCost,
    ranchCropCount: services.getRanchStateSnapshot().crops.length,
    saveStateExists: readResult.state !== null,
  }
}

function getReturnObjectiveSnapshot(game: Phaser.Game): ReturnObjectiveSnapshot {
  const services = getGameServices(getServiceSceneOrThrow(game))
  const snapshot = services.getReturnObjectiveStateSnapshot()

  return {
    objectiveLoopEnabled: snapshot.objectiveLoopEnabled,
    streakBonusEnabled: snapshot.streakBonusEnabled,
    retentionKillSwitchEnabled: snapshot.retentionKillSwitchEnabled,
    activeObjectiveId: snapshot.activeObjectiveId,
    metric: snapshot.metric,
    progressValue: snapshot.progressValue,
    targetValue: snapshot.targetValue,
    rewardAmount: snapshot.rewardAmount,
    assignmentCycle: snapshot.assignmentCycle,
    streakTier: snapshot.streakTier,
    claimRewardAmount: snapshot.claimRewardAmount,
    nextStreakTier: snapshot.nextStreakTier,
    nextClaimRewardAmount: snapshot.nextClaimRewardAmount,
  }
}

function debugClaimCurrentReturnObjective(game: Phaser.Game): ReturnObjectiveClaimDebugResult {
  const services = getGameServices(getServiceSceneOrThrow(game))
  const currentSnapshot = services.getReturnObjectiveStateSnapshot()

  const objectiveLoopEnabled = currentSnapshot.objectiveLoopEnabled

  if (objectiveLoopEnabled) {
    if (currentSnapshot.activeObjectiveId === null || currentSnapshot.metric === null) {
      throw new Error('No active return objective available in smoke harness.')
    }

    const remainingProgress = Math.max(0, currentSnapshot.targetValue - currentSnapshot.progressValue)
    if (remainingProgress > 0) {
      services.progressReturnObjective(
        currentSnapshot.metric,
        remainingProgress,
        'smoke:return_objective_complete',
      )
    }
  }

  const claim = services.claimReturnObjectiveReward('smoke:return_objective_claim')
  if (objectiveLoopEnabled && claim.result !== 'claimed') {
    throw new Error(`Expected claimed return objective result in smoke harness, got "${claim.result}".`)
  }

  return {
    result: claim.result,
    awardedRewardAmount: claim.rewardAmount,
    awardedStreakTier: claim.state.streakTier,
    assignmentCycleAfterClaim: claim.state.assignmentCycle,
  }
}

function getBarnSnapshot(game: Phaser.Game): BarnSnapshot {
  const services = getGameServices(getServiceSceneOrThrow(game))
  const snapshot = services.getBarnStateSnapshot()

  return {
    balance: services.getCurrencyBalance(),
    inventory: { ...services.getInventorySnapshot() },
    jobs: snapshot.jobs.map((job) => ({
      id: job.id,
      recipeId: job.recipeId,
      isReady: job.isReady,
      remainingMs: job.remainingMs,
    })),
    marketOrders: snapshot.marketOrders.map((order) => ({
      orderId: order.orderId,
      payout: order.payout,
      baseSellValue: order.baseSellValue,
      premiumValue: order.premiumValue,
      isFulfilled: order.isFulfilled,
      isClaimable: order.isClaimable,
      fulfilledAtEpochMs: order.fulfilledAtEpochMs,
    })),
  }
}

function getBarnUiSnapshot(game: Phaser.Game): BarnUiSnapshot {
  const scene = getBarnSceneOrThrow(game)
  const snapshot: BarnSceneDebugUiSnapshot = scene.getDebugUiSnapshot()

  return {
    selectedRecipeId: snapshot.selectedRecipeId,
    inventoryText: snapshot.inventoryText,
    recipeDetailText: snapshot.recipeDetailText,
    jobListText: snapshot.jobListText,
    feedbackText: snapshot.feedbackText,
    cycleRecipeButtonCenter: snapshot.cycleRecipeButtonCenter,
    startRecipeButtonCenter: snapshot.startRecipeButtonCenter,
    claimButtonCenter: snapshot.claimButtonCenter,
  }
}

function getReturnSessionSummaryModalSnapshot(game: Phaser.Game): ReturnSessionSummaryModalSnapshot {
  const scene = getUiSceneOrThrow(game)
  const snapshot: UiSceneDebugReturnSessionSummaryModalSnapshot =
    scene.getDebugReturnSessionSummaryModalSnapshot()

  return {
    isVisible: snapshot.isVisible,
    titleText: snapshot.titleText,
    subtitleText: snapshot.subtitleText,
    rewardsText: snapshot.rewardsText,
  }
}

function debugStartBarnJob(game: Phaser.Game, recipeId: BarnProcessingRecipeId): BarnStartDebugResult {
  const services = getGameServices(getServiceSceneOrThrow(game))
  const result = services.startBarnJob(recipeId, 'smoke:barn_start')

  return {
    result: result.result,
    jobId: result.job?.id ?? null,
    balance: result.balance,
    jobCount: result.state.jobs.length,
  }
}

function debugClaimBarnJob(game: Phaser.Game, jobId: string): BarnClaimDebugResult {
  const services = getGameServices(getServiceSceneOrThrow(game))
  const result = services.claimBarnJob(jobId, 'smoke:barn_claim')

  return {
    result: result.result,
    recipeId: result.recipeId,
    balance: result.balance,
    jobCount: result.state.jobs.length,
  }
}

function debugSellInventory(
  game: Phaser.Game,
  sellPointId: SellPointId = 'shipping_crate',
): InventorySellDebugResult {
  const ranchScene = getRanchSceneOrThrow(game)
  const sceneBindings = getDebugBindings(ranchScene)
  const services = getGameServices(ranchScene)
  const sold = sceneBindings.trySellInventory(sellPointId, 'pointer')

  return {
    sold,
    balance: services.getCurrencyBalance(),
    inventory: { ...services.getInventorySnapshot() },
  }
}

function debugPersistLegacySaveWithoutStreak(game: Phaser.Game): void {
  const services = getGameServices(getServiceSceneOrThrow(game))
  const saveState = services.saveGameState()
  const legacyPayload = { ...(saveState as unknown as Record<string, unknown>) }
  delete legacyPayload.returnObjectiveStreak

  window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(legacyPayload))
}

function debugSaveGameState(game: Phaser.Game): unknown {
  const services = getGameServices(getServiceSceneOrThrow(game))
  return services.saveGameState()
}

function debugNavigate(game: Phaser.Game, sceneKey: PlayableSceneKey): void {
  const services = getGameServices(getServiceSceneOrThrow(game))
  services.navigate(sceneKey)
}

export function installSmokeHarness(game: Phaser.Game): void {
  if (!isSmokeModeEnabled()) {
    return
  }

  const frameHealthSampler = new FrameHealthSampler()
  const smokeWindow = window as SmokeWindow
  smokeWindow[SMOKE_WINDOW_KEY] = {
    waitForReady: async (timeoutMs = DEFAULT_READY_TIMEOUT_MS): Promise<void> => {
      await waitForReady(game, timeoutMs)
    },
    runCoreLoopFlow: (): CoreLoopRunResult => runCoreLoopFlow(game),
    getSnapshot: (): SmokeSnapshot => getSnapshot(game),
    getReturnObjectiveSnapshot: (): ReturnObjectiveSnapshot => getReturnObjectiveSnapshot(game),
    debugClaimCurrentReturnObjective: (): ReturnObjectiveClaimDebugResult =>
      debugClaimCurrentReturnObjective(game),
    getBarnSnapshot: (): BarnSnapshot => getBarnSnapshot(game),
    getBarnUiSnapshot: (): BarnUiSnapshot => getBarnUiSnapshot(game),
    getReturnSessionSummaryModalSnapshot: (): ReturnSessionSummaryModalSnapshot =>
      getReturnSessionSummaryModalSnapshot(game),
    debugStartBarnJob: (recipeId: BarnProcessingRecipeId): BarnStartDebugResult =>
      debugStartBarnJob(game, recipeId),
    debugClaimBarnJob: (jobId: string): BarnClaimDebugResult => debugClaimBarnJob(game, jobId),
    debugSellInventory: (sellPointId: SellPointId = 'shipping_crate'): InventorySellDebugResult =>
      debugSellInventory(game, sellPointId),
    debugNavigate: (sceneKey: PlayableSceneKey): void => {
      debugNavigate(game, sceneKey)
    },
    debugSaveGameState: (): unknown => debugSaveGameState(game),
    debugPersistLegacySaveWithoutStreak: (): void => {
      debugPersistLegacySaveWithoutStreak(game)
    },
    getTileScreenPoint: (tileX: number, tileY: number): ScreenPoint =>
      getTileScreenPoint(game, tileX, tileY),
    debugGetPlantedCropTiles: (): Array<{ x: number; y: number }> => debugGetPlantedCropTiles(game),
    debugForceCropToMature: (tileX: number, tileY: number): void => {
      debugForceCropToMature(game, tileX, tileY)
    },
    debugSeedInventory: (itemId: string, quantity: number): void => {
      debugSeedInventory(game, itemId, quantity)
    },
    startFrameHealthSampling: (options: FrameHealthSamplingOptions = {}): void => {
      frameHealthSampler.start(options)
    },
    stopFrameHealthSampling: (): FrameHealthMetrics => frameHealthSampler.stop(),
  }
}
