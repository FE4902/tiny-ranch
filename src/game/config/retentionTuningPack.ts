import {
  RETENTION_TUNING_SAFE_DEFAULT_PACK_ID,
  loadReturnObjectiveEconomyTuningPack,
  type RetentionTuningPackFallbackReason,
} from './returnObjectiveEconomyTuning.shared.js'

const SOURCE_CONTROLLED_RETENTION_TUNING_PACK_ID = RETENTION_TUNING_SAFE_DEFAULT_PACK_ID

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

function resolveSmokeQueryOverride(name: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  const isSmokeMode = parseBooleanQueryValue(params.get('smokeTest')) === true
  if (!isSmokeMode) {
    return null
  }

  const rawValue = params.get(name)
  if (rawValue === null) {
    return null
  }

  const normalized = rawValue.trim()
  if (normalized.length === 0) {
    return null
  }

  return normalized
}

function resolveEnvConfigPackId(): string | null {
  const rawValue = import.meta.env.VITE_RETENTION_TUNING_PACK
  if (typeof rawValue !== 'string') {
    return null
  }

  const normalized = rawValue.trim()
  if (normalized.length === 0) {
    return null
  }

  return normalized
}

function resolveRequestedPackId(): string {
  const envPackId = resolveEnvConfigPackId()
  const queryPackId = resolveSmokeQueryOverride('retentionTuningPack')
  return queryPackId ?? envPackId ?? SOURCE_CONTROLLED_RETENTION_TUNING_PACK_ID
}

const loadedRetentionTuningPack = loadReturnObjectiveEconomyTuningPack(resolveRequestedPackId())

export interface ActiveRetentionTuningPack {
  requestedPackId: string
  tuningPackId: string
  tuningPackVersion: number
  fallbackReason: RetentionTuningPackFallbackReason | null
  normalizationCount: number
}

export const activeRetentionTuningPack: Readonly<ActiveRetentionTuningPack> = Object.freeze({
  requestedPackId: loadedRetentionTuningPack.requestedPackId,
  tuningPackId: loadedRetentionTuningPack.tuningPackId,
  tuningPackVersion: loadedRetentionTuningPack.tuningPackVersion,
  fallbackReason: loadedRetentionTuningPack.fallbackReason,
  normalizationCount: loadedRetentionTuningPack.normalizationCount,
})

export const retentionObjectiveEconomyTuning = loadedRetentionTuningPack.pack.tuning
export const retentionRewardCaps = loadedRetentionTuningPack.pack.rewardCaps
export const retentionFlagDefaults = loadedRetentionTuningPack.pack.flagDefaults

export interface RetentionTuningTelemetryPayload {
  tuningPackId: string
  tuningPackVersion: number
  fallbackReason: RetentionTuningPackFallbackReason | null
}

export function getRetentionTuningTelemetryPayload(): RetentionTuningTelemetryPayload {
  return {
    tuningPackId: activeRetentionTuningPack.tuningPackId,
    tuningPackVersion: activeRetentionTuningPack.tuningPackVersion,
    fallbackReason: activeRetentionTuningPack.fallbackReason,
  }
}
