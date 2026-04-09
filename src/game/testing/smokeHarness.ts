import type Phaser from 'phaser'

import type { CropSeedId } from '../config/crops'
import { getCropSeedConfig } from '../config/crops'
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
const EXTRA_TURNIP_COUNT_FOR_EXPANSION = 19

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

interface TinyRanchSmokeHarness {
  waitForReady(timeoutMs?: number): Promise<void>
  runCoreLoopFlow(): CoreLoopRunResult
  getSnapshot(): SmokeSnapshot
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

  services.addInventoryItem('turnip', EXTRA_TURNIP_COUNT_FOR_EXPANSION)
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

  const smokeWindow = window as SmokeWindow
  smokeWindow[SMOKE_WINDOW_KEY] = {
    waitForReady: async (timeoutMs = DEFAULT_READY_TIMEOUT_MS): Promise<void> => {
      await waitForReady(game, timeoutMs)
    },
    runCoreLoopFlow: (): CoreLoopRunResult => runCoreLoopFlow(game),
    getSnapshot: (): SmokeSnapshot => getSnapshot(game),
  }
}
