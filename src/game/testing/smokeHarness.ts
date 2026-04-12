import type Phaser from 'phaser'

import type { CropSeedId } from '../config/crops'
import { getCropSeedConfig } from '../config/crops'
import { getItemSellPrice } from '../config/economy'
import { SCENE_KEYS } from '../constants'
import { ranchMapContract, type RanchMapContract } from '../maps/ranchMap'
import type { RanchScene } from '../scenes/RanchScene'
import { getGameServices } from '../systems/runtime'

const SMOKE_QUERY_PARAM = 'smokeTest'
const SMOKE_WINDOW_KEY = '__TINY_RANCH_SMOKE__'
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

interface TinyRanchSmokeHarness {
  waitForReady(timeoutMs?: number): Promise<void>
  runCoreLoopFlow(): CoreLoopRunResult
  getSnapshot(): SmokeSnapshot
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

function getRanchSceneOrThrow(game: Phaser.Game): RanchScene {
  const scene = resolveRanchScene(game)
  if (scene) {
    return scene
  }

  throw new Error('Ranch scene is not active yet.')
}

function getDebugBindings(scene: RanchScene): RanchSceneDebugBindings {
  return scene as unknown as RanchSceneDebugBindings
}

function waitForReady(game: Phaser.Game, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const checkReady = (): void => {
      const scene = resolveRanchScene(game)
      if (scene) {
        try {
          getGameServices(scene)
          resolve()
          return
        } catch {
          // Keep polling until services are available.
        }
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out waiting for ranch scene readiness after ${timeoutMs}ms.`))
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

  const services = getGameServices(getRanchSceneOrThrow(game))
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
  const ranchScene = getRanchSceneOrThrow(game)
  const services = getGameServices(ranchScene)
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
