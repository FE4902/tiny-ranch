import { animalProductionConfigs, type AnimalProductionId } from '../../config/animals'
import { cropSeedConfigs, type CropSeedId } from '../../config/crops'
import { getFirstFtueStepId, isFtueStepId, type FtueStepId } from '../../config/ftue'
import {
  clampExpansionTier,
  getDefaultExpansionTier,
  getMaxExpansionTier,
} from '../../config/expansion'
import {
  clampUpgradeLevel,
  createDefaultUpgradeLevels,
  getUpgradeMaxLevel,
  type UpgradeId,
  upgradeIds,
} from '../../config/upgrades'
import { PLAYABLE_SCENES, type PlayableSceneKey } from '../../constants'

export const SAVE_SCHEMA_VERSION = 1 as const

export interface SaveMetadataV1 {
  savedAtEpochMs: number
}

export interface SaveCropStateV1 {
  seedId: CropSeedId
  tileX: number
  tileY: number
  plantedAtEpochMs: number
  stageIndex: number
}

export interface SaveAnimalStateV1 {
  id: string
  configId: AnimalProductionId
  tileX: number
  tileY: number
  isActive: boolean
  isFed: boolean
  hasProductReady: boolean
  cycleStartedAtEpochMs: number | null
  nextProductAtEpochMs: number | null
}

export interface SaveProgressionStateV1 {
  activeScene: PlayableSceneKey | null
  activeSeedId: CropSeedId
  expansionTier: number
  upgrades: SaveUpgradeLevelsV1
}

export type SaveUpgradeLevelsV1 = Record<UpgradeId, number>

export interface SaveFtueStateV1 {
  currentStep: FtueStepId | null
  completedAtEpochMs: number | null
}

export interface SaveStateV1 {
  schemaVersion: typeof SAVE_SCHEMA_VERSION
  metadata: SaveMetadataV1
  currency: number
  inventory: Record<string, number>
  progression: SaveProgressionStateV1
  ftue: SaveFtueStateV1
  ranch: {
    crops: SaveCropStateV1[]
    animals: SaveAnimalStateV1[]
  }
}

export type SaveStateDecodeErrorCode = 'unsupported_schema' | 'invalid_schema'

export interface SaveStateDecodeError {
  code: SaveStateDecodeErrorCode
  message: string
}

export type SaveStateDecodeResult =
  | {
      ok: true
      value: SaveStateV1
    }
  | {
      ok: false
      error: SaveStateDecodeError
    }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteInteger(value) && value >= 0
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value)
}

function isCropSeedId(value: unknown): value is CropSeedId {
  return typeof value === 'string' && Object.hasOwn(cropSeedConfigs, value)
}

function isAnimalProductionId(value: unknown): value is AnimalProductionId {
  return typeof value === 'string' && Object.hasOwn(animalProductionConfigs, value)
}

function isPlayableSceneKey(value: unknown): value is PlayableSceneKey {
  return typeof value === 'string' && PLAYABLE_SCENES.includes(value as PlayableSceneKey)
}

function decodeInventory(value: unknown): Record<string, number> | null {
  if (!isObject(value)) {
    return null
  }

  const entries = Object.entries(value)
  const decoded: Record<string, number> = {}

  for (const [itemId, quantity] of entries) {
    if (itemId.trim().length === 0) {
      return null
    }

    if (!isNonNegativeInteger(quantity)) {
      return null
    }

    if (quantity > 0) {
      decoded[itemId] = quantity
    }
  }

  return decoded
}

function decodeCropState(value: unknown): SaveCropStateV1 | null {
  if (!isObject(value)) {
    return null
  }

  if (!isCropSeedId(value.seedId)) {
    return null
  }
  if (!isNonNegativeInteger(value.tileX) || !isNonNegativeInteger(value.tileY)) {
    return null
  }
  if (!isNonNegativeInteger(value.plantedAtEpochMs)) {
    return null
  }
  if (!isNonNegativeInteger(value.stageIndex)) {
    return null
  }

  return {
    seedId: value.seedId,
    tileX: value.tileX,
    tileY: value.tileY,
    plantedAtEpochMs: value.plantedAtEpochMs,
    stageIndex: value.stageIndex,
  }
}

function decodeAnimalState(value: unknown): SaveAnimalStateV1 | null {
  if (!isObject(value)) {
    return null
  }

  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null
  }
  if (!isAnimalProductionId(value.configId)) {
    return null
  }
  if (!isNonNegativeInteger(value.tileX) || !isNonNegativeInteger(value.tileY)) {
    return null
  }
  if (!isBoolean(value.isActive) || !isBoolean(value.isFed) || !isBoolean(value.hasProductReady)) {
    return null
  }
  if (!isNullableNonNegativeInteger(value.cycleStartedAtEpochMs)) {
    return null
  }
  if (!isNullableNonNegativeInteger(value.nextProductAtEpochMs)) {
    return null
  }

  return {
    id: value.id,
    configId: value.configId,
    tileX: value.tileX,
    tileY: value.tileY,
    isActive: value.isActive,
    isFed: value.isFed,
    hasProductReady: value.hasProductReady,
    cycleStartedAtEpochMs: value.cycleStartedAtEpochMs,
    nextProductAtEpochMs: value.nextProductAtEpochMs,
  }
}

function decodeProgression(value: unknown): SaveProgressionStateV1 | null {
  if (!isObject(value)) {
    return null
  }

  if (!(value.activeScene === null || isPlayableSceneKey(value.activeScene))) {
    return null
  }
  if (!isCropSeedId(value.activeSeedId)) {
    return null
  }

  const expansionTier = decodeExpansionTier(value.expansionTier)
  if (expansionTier === null) {
    return null
  }

  const upgrades = decodeUpgradeLevels(value.upgrades)
  if (!upgrades) {
    return null
  }

  return {
    activeScene: value.activeScene,
    activeSeedId: value.activeSeedId,
    expansionTier,
    upgrades,
  }
}

function decodeExpansionTier(value: unknown): number | null {
  if (value === undefined) {
    return getDefaultExpansionTier()
  }

  if (!isFiniteInteger(value) || value < 1) {
    return null
  }

  if (value > getMaxExpansionTier()) {
    return clampExpansionTier(value)
  }

  return value
}

function decodeUpgradeLevels(value: unknown): SaveUpgradeLevelsV1 | null {
  if (value === undefined) {
    return createDefaultUpgradeLevels()
  }

  if (!isObject(value)) {
    return null
  }

  const levels = createDefaultUpgradeLevels()

  for (const upgradeId of upgradeIds) {
    const rawLevel = value[upgradeId]
    if (rawLevel === undefined) {
      continue
    }

    if (!isNonNegativeInteger(rawLevel)) {
      return null
    }

    if (rawLevel > getUpgradeMaxLevel(upgradeId)) {
      return null
    }

    levels[upgradeId] = clampUpgradeLevel(upgradeId, rawLevel)
  }

  return levels
}

export function createDefaultFtueSaveState(): SaveFtueStateV1 {
  return {
    currentStep: getFirstFtueStepId(),
    completedAtEpochMs: null,
  }
}

function decodeFtue(value: unknown): SaveFtueStateV1 | null {
  if (value === undefined) {
    return createDefaultFtueSaveState()
  }

  if (!isObject(value)) {
    return null
  }

  if (!(value.currentStep === null || isFtueStepId(value.currentStep))) {
    return null
  }

  if (!isNullableNonNegativeInteger(value.completedAtEpochMs)) {
    return null
  }

  return {
    currentStep: value.currentStep,
    completedAtEpochMs: value.currentStep === null ? value.completedAtEpochMs : null,
  }
}

function decodeRanchState(
  value: unknown,
): {
  crops: SaveCropStateV1[]
  animals: SaveAnimalStateV1[]
} | null {
  if (!isObject(value) || !Array.isArray(value.crops) || !Array.isArray(value.animals)) {
    return null
  }

  const crops: SaveCropStateV1[] = []
  for (const crop of value.crops) {
    const decoded = decodeCropState(crop)
    if (!decoded) {
      return null
    }

    crops.push(decoded)
  }

  const animals: SaveAnimalStateV1[] = []
  for (const animal of value.animals) {
    const decoded = decodeAnimalState(animal)
    if (!decoded) {
      return null
    }

    animals.push(decoded)
  }

  return { crops, animals }
}

function decodeMetadata(value: unknown): SaveMetadataV1 | null {
  if (!isObject(value)) {
    return null
  }

  if (!isNonNegativeInteger(value.savedAtEpochMs)) {
    return null
  }

  return {
    savedAtEpochMs: value.savedAtEpochMs,
  }
}

export function decodeSaveState(payload: unknown): SaveStateDecodeResult {
  if (!isObject(payload)) {
    return {
      ok: false,
      error: {
        code: 'invalid_schema',
        message: 'Save payload must be an object.',
      },
    }
  }

  if (!isFiniteInteger(payload.schemaVersion)) {
    return {
      ok: false,
      error: {
        code: 'invalid_schema',
        message: 'Save payload schemaVersion must be an integer.',
      },
    }
  }

  if (payload.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'unsupported_schema',
        message: `Unsupported schemaVersion ${payload.schemaVersion}.`,
      },
    }
  }

  const metadata = decodeMetadata(payload.metadata)
  const inventory = decodeInventory(payload.inventory)
  const progression = decodeProgression(payload.progression)
  const ftue = decodeFtue(payload.ftue)
  const ranch = decodeRanchState(payload.ranch)

  if (!isNonNegativeInteger(payload.currency)) {
    return {
      ok: false,
      error: {
        code: 'invalid_schema',
        message: 'Save payload currency must be a non-negative integer.',
      },
    }
  }

  if (!metadata || !inventory || !progression || !ftue || !ranch) {
    return {
      ok: false,
      error: {
        code: 'invalid_schema',
        message: 'Save payload fields failed validation.',
      },
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: SAVE_SCHEMA_VERSION,
      metadata,
      currency: payload.currency,
      inventory,
      progression,
      ftue,
      ranch,
    },
  }
}
