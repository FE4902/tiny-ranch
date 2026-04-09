export type TelemetryScalar = number | string | boolean | null
export type TelemetryPayload = Record<string, TelemetryScalar>

export interface TelemetryClient {
  track(name: string, payload?: TelemetryPayload): void
  flush(reason?: string): void
  destroy(): void
}

export type TelemetrySink = 'console' | 'posthog' | 'none'

export interface TelemetryRuntimeConfig {
  sink: TelemetrySink
  posthogApiHost: string
  posthogApiKey: string | null
  posthogBatchSize: number
  posthogFlushIntervalMs: number
  posthogMaxQueueSize: number
}

interface TelemetryEvent {
  name: string
  payload: TelemetryPayload
  timestamp: string
}

interface TelemetryFlushContext {
  reason: string
  useBeacon: boolean
}

interface TelemetryTransport {
  track(event: TelemetryEvent): void
  flush(context: TelemetryFlushContext): void
  destroy(): void
}

interface PostHogCaptureEvent {
  event: string
  properties: Record<string, TelemetryScalar | string>
  timestamp: string
}

const TELEMETRY_WINDOW_EVENT = 'tiny-ranch:telemetry'
const DISTINCT_ID_STORAGE_KEY = 'tiny-ranch:telemetry:distinct-id'
const MAX_EVENT_NAME_LENGTH = 120

const ALLOWED_PAYLOAD_KEYS = new Set<string>([
  'activeSeedId',
  'amount',
  'animalLabel',
  'animalProductsCollected',
  'animalSlotCapacity',
  'animalType',
  'assets',
  'balance',
  'bootToFirstPlayableMs',
  'cohort',
  'collisions',
  'completedSignal',
  'completedStepId',
  'cost',
  'cropGrowthDurationMultiplier',
  'cropTileCapacity',
  'cropType',
  'cropsHarvested',
  'durationMs',
  'effectiveElapsedMs',
  'elapsedSessionMs',
  'eventIndex',
  'eventTimestampMs',
  'fedProductionDurationMs',
  'from',
  'fromStage',
  'hadSavedState',
  'height',
  'heightTiles',
  'inputSource',
  'interactableId',
  'inventoryTotal',
  'isCompleted',
  'isFed',
  'isMature',
  'itemId',
  'landmarks',
  'levelAfter',
  'levelBefore',
  'milestone',
  'nextCost',
  'nextStepId',
  'offlineElapsedMs',
  'panel',
  'productionDurationMs',
  'productItemId',
  'quantity',
  'reason',
  'result',
  'restoredAnimals',
  'restoredCrops',
  'revenue',
  'rewardBreakdown',
  'rewardsGranted',
  'saveAgeBucket',
  'scene',
  'schemaVersion',
  'seedId',
  'sellPointId',
  'sellPriceMultiplier',
  'sessionId',
  'sessionStartedAtMs',
  'soldLineItems',
  'soldQuantity',
  'source',
  'sourceContext',
  'spawnTile',
  'stageDurationsMs',
  'startupOutcome',
  'startupScene',
  'targetId',
  'targetLabel',
  'targetType',
  'tierAfter',
  'tierBefore',
  'tileX',
  'tileY',
  'to',
  'toStage',
  'totalEstimatedSellValue',
  'totalItemsGranted',
  'totalRevenue',
  'touch',
  'unlockedZoneCount',
  'unlockedZoneIds',
  'upgradeCount',
  'upgradeId',
  'viewportHeight',
  'viewportWidth',
  'wasOfflineTimeCapped',
  'wasRewardCapReached',
  'width',
  'widthTiles',
  'yieldItemId',
  'zones',
])

const BLOCKED_PII_KEYS = new Set<string>([
  'address',
  'city',
  'country',
  'email',
  'first_name',
  'full_name',
  'ip',
  'ip_address',
  'last_name',
  'name',
  'password',
  'phone',
  'postal_code',
  'state',
  'street',
  'user_email',
  'username',
])

function isTelemetryScalar(value: unknown): value is TelemetryScalar {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    value === null ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function normalizeEventName(name: string): string | null {
  const normalized = name.trim()
  if (normalized.length === 0) {
    return null
  }

  return normalized.slice(0, MAX_EVENT_NAME_LENGTH)
}

function sanitizePayload(payload: TelemetryPayload): TelemetryPayload {
  const sanitized: TelemetryPayload = {}

  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
      continue
    }

    if (BLOCKED_PII_KEYS.has(key.toLowerCase())) {
      continue
    }

    if (!isTelemetryScalar(value)) {
      continue
    }

    sanitized[key] = value
  }

  return sanitized
}

function createTelemetryEvent(name: string, payload: TelemetryPayload): TelemetryEvent | null {
  const normalizedName = normalizeEventName(name)
  if (!normalizedName) {
    return null
  }

  return {
    name: normalizedName,
    payload: sanitizePayload(payload),
    timestamp: new Date().toISOString(),
  }
}

function scheduleMicrotask(callback: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback)
    return
  }

  void Promise.resolve().then(callback)
}

function createDistinctId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `anon-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000_000).toString(36)}`
}

function resolveDistinctId(): string {
  if (typeof localStorage === 'undefined') {
    return createDistinctId()
  }

  try {
    const existingId = localStorage.getItem(DISTINCT_ID_STORAGE_KEY)
    if (existingId && existingId.trim().length > 0) {
      return existingId
    }

    const nextId = createDistinctId()
    localStorage.setItem(DISTINCT_ID_STORAGE_KEY, nextId)
    return nextId
  } catch {
    return createDistinctId()
  }
}

function isDoNotTrackValue(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.toLowerCase()
  return normalized === '1' || normalized === 'yes'
}

function isDoNotTrackEnabled(): boolean {
  const navigatorValue = typeof navigator === 'undefined' ? undefined : navigator.doNotTrack
  const msDoNotTrackValue =
    typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack
  const windowValue =
    typeof window === 'undefined'
      ? undefined
      : (window as Window & { doNotTrack?: string }).doNotTrack

  return [navigatorValue, msDoNotTrackValue, windowValue].some(isDoNotTrackValue)
}

class NoopTelemetryTransport implements TelemetryTransport {
  track(_event: TelemetryEvent): void {}

  flush(_context: TelemetryFlushContext): void {}

  destroy(): void {}
}

class ConsoleTelemetryTransport implements TelemetryTransport {
  track(event: TelemetryEvent): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<TelemetryEvent>(TELEMETRY_WINDOW_EVENT, { detail: event }))
    }

    console.info('[tiny-ranch]', event)
  }

  flush(_context: TelemetryFlushContext): void {}

  destroy(): void {}
}

class PostHogTelemetryTransport implements TelemetryTransport {
  private readonly apiKey: string
  private readonly batchUrl: string
  private readonly batchSize: number
  private readonly flushIntervalMs: number
  private readonly maxQueueSize: number
  private readonly distinctId: string
  private readonly doNotTrack: boolean

  private queue: PostHogCaptureEvent[] = []
  private flushTimerId: number | null = null
  private isFlushing = false
  private destroyed = false

  constructor(config: TelemetryRuntimeConfig) {
    this.apiKey = config.posthogApiKey ?? ''
    this.batchUrl = `${config.posthogApiHost.replace(/\/$/, '')}/batch/`
    this.batchSize = config.posthogBatchSize
    this.flushIntervalMs = config.posthogFlushIntervalMs
    this.maxQueueSize = config.posthogMaxQueueSize
    this.distinctId = resolveDistinctId()
    this.doNotTrack = isDoNotTrackEnabled()
  }

  track(event: TelemetryEvent): void {
    if (this.destroyed || this.doNotTrack) {
      return
    }

    this.queue.push({
      event: event.name,
      properties: {
        ...event.payload,
        distinct_id: this.distinctId,
        $lib: 'tiny-ranch-web',
        $lib_version: 'mvp',
      },
      timestamp: event.timestamp,
    })

    this.trimQueueToLimit()

    if (this.queue.length >= this.batchSize) {
      this.flush({ reason: 'batch_size', useBeacon: false })
      return
    }

    this.scheduleFlush()
  }

  flush(context: TelemetryFlushContext): void {
    if (this.destroyed) {
      return
    }

    if (this.doNotTrack) {
      this.clearTimer()
      this.queue = []
      return
    }

    if (this.queue.length === 0 || this.isFlushing) {
      return
    }

    this.clearTimer()

    const batch = this.queue.splice(0, this.batchSize)
    this.isFlushing = true

    void this.sendBatch(batch, context.useBeacon)
      .then((sent) => {
        if (!sent) {
          this.requeueBatch(batch)
        }
      })
      .finally(() => {
        this.isFlushing = false

        if (this.destroyed || this.queue.length === 0) {
          return
        }

        if (context.useBeacon) {
          this.flush({ reason: `${context.reason}:drain`, useBeacon: true })
          return
        }

        if (this.queue.length >= this.batchSize) {
          this.flush({ reason: `${context.reason}:batch_ready`, useBeacon: false })
          return
        }

        this.scheduleFlush()
      })
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }

    this.clearTimer()
    this.flush({ reason: 'transport_destroyed', useBeacon: true })
    this.destroyed = true
  }

  private scheduleFlush(): void {
    if (this.flushTimerId !== null || this.destroyed) {
      return
    }

    this.flushTimerId = globalThis.setTimeout(() => {
      this.flushTimerId = null
      this.flush({ reason: 'interval', useBeacon: false })
    }, this.flushIntervalMs)
  }

  private clearTimer(): void {
    if (this.flushTimerId === null) {
      return
    }

    globalThis.clearTimeout(this.flushTimerId)
    this.flushTimerId = null
  }

  private requeueBatch(batch: PostHogCaptureEvent[]): void {
    this.queue = [...batch, ...this.queue]
    this.trimQueueToLimit()
  }

  private trimQueueToLimit(): void {
    if (this.queue.length <= this.maxQueueSize) {
      return
    }

    const overflow = this.queue.length - this.maxQueueSize
    this.queue.splice(0, overflow)
  }

  private async sendBatch(batch: PostHogCaptureEvent[], useBeacon: boolean): Promise<boolean> {
    const body = JSON.stringify({
      api_key: this.apiKey,
      batch,
      sent_at: new Date().toISOString(),
    })

    if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([body], { type: 'application/json' })
        const sent = navigator.sendBeacon(this.batchUrl, blob)
        if (sent) {
          return true
        }
      } catch {
        // If sendBeacon errors we fall through to fetch keepalive.
      }
    }

    try {
      const response = await fetch(this.batchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        credentials: 'omit',
        mode: 'cors',
        keepalive: useBeacon,
      })

      return response.ok
    } catch {
      return false
    }
  }
}

class TransportTelemetryClient implements TelemetryClient {
  private readonly transport: TelemetryTransport
  private readonly teardownLifecycleHooks: (() => void) | null
  private destroyed = false

  constructor(transport: TelemetryTransport) {
    this.transport = transport
    this.teardownLifecycleHooks = this.installLifecycleHooks()
  }

  track(name: string, payload: TelemetryPayload = {}): void {
    if (this.destroyed) {
      return
    }

    const event = createTelemetryEvent(name, payload)
    if (!event) {
      return
    }

    this.transport.track(event)
  }

  flush(reason: string = 'manual'): void {
    if (this.destroyed) {
      return
    }

    this.transport.flush({ reason, useBeacon: false })
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.teardownLifecycleHooks?.()
    this.transport.flush({ reason: 'client_destroyed', useBeacon: true })
    this.transport.destroy()
  }

  private installLifecycleHooks(): (() => void) | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null
    }

    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== 'hidden') {
        return
      }

      scheduleMicrotask(() => {
        this.transport.flush({ reason: 'visibilitychange', useBeacon: true })
      })
    }

    const handlePageHide = (): void => {
      scheduleMicrotask(() => {
        this.transport.flush({ reason: 'pagehide', useBeacon: true })
      })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }
}

function createTransport(config: TelemetryRuntimeConfig): TelemetryTransport {
  switch (config.sink) {
    case 'none':
      return new NoopTelemetryTransport()
    case 'posthog':
      if (!config.posthogApiKey) {
        console.warn('[tiny-ranch] VITE_POSTHOG_API_KEY is missing, falling back to console telemetry sink.')
        return new ConsoleTelemetryTransport()
      }
      return new PostHogTelemetryTransport(config)
    case 'console':
    default:
      return new ConsoleTelemetryTransport()
  }
}

export function createTelemetryClient(config: TelemetryRuntimeConfig): TelemetryClient {
  return new TransportTelemetryClient(createTransport(config))
}

const DEFAULT_CONSOLE_RUNTIME_CONFIG: TelemetryRuntimeConfig = {
  sink: 'console',
  posthogApiHost: 'https://us.i.posthog.com',
  posthogApiKey: null,
  posthogBatchSize: 20,
  posthogFlushIntervalMs: 5_000,
  posthogMaxQueueSize: 200,
}

export class ConsoleTelemetryClient implements TelemetryClient {
  private readonly delegate: TelemetryClient

  constructor() {
    this.delegate = createTelemetryClient(DEFAULT_CONSOLE_RUNTIME_CONFIG)
  }

  track(name: string, payload: TelemetryPayload = {}): void {
    this.delegate.track(name, payload)
  }

  flush(reason?: string): void {
    this.delegate.flush(reason)
  }

  destroy(): void {
    this.delegate.destroy()
  }
}
