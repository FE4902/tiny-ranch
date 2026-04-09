import type { TelemetryRuntimeConfig, TelemetrySink } from '../systems/telemetry'

const DEFAULT_POSTHOG_API_HOST = 'https://us.i.posthog.com'
const DEFAULT_POSTHOG_BATCH_SIZE = 20
const DEFAULT_POSTHOG_FLUSH_INTERVAL_MS = 5_000
const DEFAULT_POSTHOG_MAX_QUEUE_SIZE = 200

function parsePositiveInteger(
  rawValue: string | undefined,
  fallbackValue: number,
  minValue: number,
  maxValue: number,
): number {
  if (!rawValue) {
    return fallbackValue
  }

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed)) {
    return fallbackValue
  }

  return Math.min(maxValue, Math.max(minValue, parsed))
}

function normalizeSink(rawSink: string | undefined): TelemetrySink {
  if (rawSink === 'posthog' || rawSink === 'none' || rawSink === 'console') {
    return rawSink
  }

  return 'console'
}

function normalizeApiHost(rawHost: string | undefined): string {
  if (!rawHost) {
    return DEFAULT_POSTHOG_API_HOST
  }

  const normalized = rawHost.trim()
  return normalized.length > 0 ? normalized : DEFAULT_POSTHOG_API_HOST
}

function normalizeApiKey(rawApiKey: string | undefined): string | null {
  if (!rawApiKey) {
    return null
  }

  const normalized = rawApiKey.trim()
  return normalized.length > 0 ? normalized : null
}

export const telemetryRuntimeConfig: TelemetryRuntimeConfig = {
  sink: normalizeSink(import.meta.env.VITE_TELEMETRY_SINK),
  posthogApiHost: normalizeApiHost(import.meta.env.VITE_POSTHOG_API_HOST),
  posthogApiKey: normalizeApiKey(import.meta.env.VITE_POSTHOG_API_KEY),
  posthogBatchSize: parsePositiveInteger(
    import.meta.env.VITE_POSTHOG_BATCH_SIZE,
    DEFAULT_POSTHOG_BATCH_SIZE,
    1,
    100,
  ),
  posthogFlushIntervalMs: parsePositiveInteger(
    import.meta.env.VITE_POSTHOG_FLUSH_INTERVAL_MS,
    DEFAULT_POSTHOG_FLUSH_INTERVAL_MS,
    250,
    60_000,
  ),
  posthogMaxQueueSize: parsePositiveInteger(
    import.meta.env.VITE_POSTHOG_MAX_QUEUE_SIZE,
    DEFAULT_POSTHOG_MAX_QUEUE_SIZE,
    10,
    2_000,
  ),
}
