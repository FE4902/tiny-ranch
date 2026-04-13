import { retentionFlagDefaults } from './retentionTuningPack'

export interface RetentionFeatureFlags {
  objectiveLoopUiEnabled: boolean
  streakBonusEnabled: boolean
  retentionKillSwitchEnabled: boolean
}

const SOURCE_CONTROLLED_RETENTION_FLAG_DEFAULTS: Readonly<RetentionFeatureFlags> = Object.freeze({
  objectiveLoopUiEnabled: retentionFlagDefaults.objectiveLoopUiEnabled,
  streakBonusEnabled: retentionFlagDefaults.streakBonusEnabled,
  retentionKillSwitchEnabled: retentionFlagDefaults.retentionKillSwitchEnabled,
})

function parseBooleanQueryValue(value: string | null): boolean | null {
  if (value === null) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.length === 0) {
    return null
  }

  if (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on' ||
    normalized === 'enabled'
  ) {
    return true
  }

  if (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'off' ||
    normalized === 'disabled'
  ) {
    return false
  }

  return null
}

function resolveSmokeQueryOverride(name: string): boolean | null {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  const isSmokeMode = parseBooleanQueryValue(params.get('smokeTest')) === true
  if (!isSmokeMode) {
    return null
  }

  return parseBooleanQueryValue(params.get(name))
}

function resolveFlag(defaultValue: boolean, queryKey: string): boolean {
  const queryOverride = resolveSmokeQueryOverride(queryKey)
  if (queryOverride === null) {
    return defaultValue
  }

  return queryOverride
}

const objectiveLoopUiEnabled = resolveFlag(
  SOURCE_CONTROLLED_RETENTION_FLAG_DEFAULTS.objectiveLoopUiEnabled,
  'retentionObjectiveUi',
)
const streakBonusEnabled = resolveFlag(
  SOURCE_CONTROLLED_RETENTION_FLAG_DEFAULTS.streakBonusEnabled,
  'retentionStreakBonus',
)
const retentionKillSwitchEnabled = resolveFlag(
  SOURCE_CONTROLLED_RETENTION_FLAG_DEFAULTS.retentionKillSwitchEnabled,
  'retentionKillSwitch',
)

const retentionEnhancementsEnabled = !retentionKillSwitchEnabled

export const retentionFeatureFlags: Readonly<RetentionFeatureFlags> = Object.freeze({
  objectiveLoopUiEnabled: retentionEnhancementsEnabled && objectiveLoopUiEnabled,
  streakBonusEnabled: retentionEnhancementsEnabled && objectiveLoopUiEnabled && streakBonusEnabled,
  retentionKillSwitchEnabled,
})
