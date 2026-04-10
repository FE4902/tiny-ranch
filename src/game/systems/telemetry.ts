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

const SAVE_LIFECYCLE_PAYLOAD_KEYS = ['schemaVersion', 'saveAgeBucket'] as const
const FIRST_SESSION_PAYLOAD_KEYS = [
  'milestone',
  'sessionId',
  'sessionStartedAtMs',
  'eventTimestampMs',
  'elapsedSessionMs',
  'eventIndex',
  'cohort',
  'startupScene',
  'startupOutcome',
  'scene',
  'source',
  'tileX',
  'tileY',
  'itemId',
  'quantity',
  'inventoryTotal',
  'revenue',
  'balance',
] as const

export const TELEMETRY_EVENT_SCHEMA = {
  animal_fed: [
    'animalType',
    'animalLabel',
    'productItemId',
    'tileX',
    'tileY',
    'inputSource',
    'eventTimestampMs',
  ],
  animal_product_collected: [
    'animalType',
    'animalLabel',
    'productItemId',
    'tileX',
    'tileY',
    'inputSource',
    'quantity',
    'inventoryTotal',
    'eventTimestampMs',
  ],
  animal_product_ready: [
    'animalType',
    'animalLabel',
    'productItemId',
    'tileX',
    'tileY',
    'source',
    'isFed',
    'eventTimestampMs',
  ],
  animal_slot_activated: [
    'animalType',
    'animalLabel',
    'productItemId',
    'tileX',
    'tileY',
    'inputSource',
    'productionDurationMs',
    'fedProductionDurationMs',
    'eventTimestampMs',
  ],
  boot_completed: ['width', 'height', 'touch', 'cohort'],
  crop_harvested: [
    'cropType',
    'seedId',
    'tileX',
    'tileY',
    'inputSource',
    'quantity',
    'inventoryTotal',
    'eventTimestampMs',
  ],
  crop_plant_attempt: [
    'result',
    'inputSource',
    'seedId',
    'yieldItemId',
    'stageDurationsMs',
    'cropGrowthDurationMultiplier',
    'tileX',
    'tileY',
  ],
  crop_stage_advanced: [
    'cropType',
    'seedId',
    'tileX',
    'tileY',
    'fromStage',
    'toStage',
    'isMature',
    'eventTimestampMs',
  ],
  currency_changed: ['amount', 'balance', 'reason', 'eventTimestampMs'],
  expansion_interaction: [
    'inputSource',
    'interactableId',
    'sourceContext',
    'result',
    'tierBefore',
    'tierAfter',
    'nextCost',
    'balance',
    'eventTimestampMs',
  ],
  expansion_purchase_attempt: [
    'source',
    'result',
    'tierBefore',
    'tierAfter',
    'cost',
    'balance',
    'eventTimestampMs',
  ],
  expansion_purchased: [
    'source',
    'tierBefore',
    'tierAfter',
    'cost',
    'balance',
    'cropTileCapacity',
    'animalSlotCapacity',
    'unlockedZoneCount',
    'unlockedZoneIds',
    'eventTimestampMs',
  ],
  first_session_end: FIRST_SESSION_PAYLOAD_KEYS,
  first_session_harvest: FIRST_SESSION_PAYLOAD_KEYS,
  first_session_launch: FIRST_SESSION_PAYLOAD_KEYS,
  first_session_move: FIRST_SESSION_PAYLOAD_KEYS,
  first_session_plant: FIRST_SESSION_PAYLOAD_KEYS,
  first_session_sale: FIRST_SESSION_PAYLOAD_KEYS,
  ftue_step_progressed: [
    'completedStepId',
    'completedSignal',
    'nextStepId',
    'isCompleted',
    'eventTimestampMs',
  ],
  inventory_sold: [
    'result',
    'sellPointId',
    'inputSource',
    'soldLineItems',
    'soldQuantity',
    'totalRevenue',
    'balance',
    'sellPriceMultiplier',
    'eventTimestampMs',
  ],
  offline_progress_granted: [
    'offlineElapsedMs',
    'effectiveElapsedMs',
    'wasOfflineTimeCapped',
    'wasRewardCapReached',
    'totalItemsGranted',
    'totalEstimatedSellValue',
    'cropsHarvested',
    'animalProductsCollected',
    'rewardBreakdown',
    'eventTimestampMs',
  ],
  offline_progress_summary_claimed: [
    'source',
    'offlineElapsedMs',
    'effectiveElapsedMs',
    'totalItemsGranted',
    'totalEstimatedSellValue',
    'cropsHarvested',
    'animalProductsCollected',
    'rewardBreakdown',
    'eventTimestampMs',
  ],
  player_spawned: ['scene', 'tileX', 'tileY'],
  preload_complete: ['assets', 'startupScene'],
  ranch_interaction: ['targetId', 'targetLabel', 'targetType'],
  ranch_map_ready: ['widthTiles', 'heightTiles', 'zones', 'collisions', 'landmarks', 'spawnTile'],
  ranch_state_hydrated: ['restoredCrops', 'restoredAnimals', 'activeSeedId'],
  return_objective_assigned: [
    'objectiveId',
    'goalId',
    'metric',
    'targetValue',
    'rewardAmount',
    'assignmentCycle',
    'source',
    'eventTimestampMs',
  ],
  return_objective_progressed: [
    'objectiveId',
    'goalId',
    'metric',
    'progressBefore',
    'progressAfter',
    'targetValue',
    'amount',
    'source',
    'eventTimestampMs',
  ],
  return_objective_completed: [
    'objectiveId',
    'goalId',
    'metric',
    'targetValue',
    'rewardAmount',
    'progressValue',
    'eventTimestampMs',
  ],
  return_objective_claimed: [
    'objectiveId',
    'goalId',
    'metric',
    'targetValue',
    'rewardAmount',
    'balance',
    'source',
    'eventTimestampMs',
  ],
  return_session_started: [
    'startupOutcome',
    'startupScene',
    'hadSavedState',
    'offlineElapsedMs',
    'effectiveElapsedMs',
    'totalItemsGranted',
    'totalEstimatedSellValue',
    'rewardsGranted',
  ],
  save_load_failure: SAVE_LIFECYCLE_PAYLOAD_KEYS,
  save_load_success: SAVE_LIFECYCLE_PAYLOAD_KEYS,
  save_reset_action: SAVE_LIFECYCLE_PAYLOAD_KEYS,
  save_reset_failed: SAVE_LIFECYCLE_PAYLOAD_KEYS,
  save_write_failure: SAVE_LIFECYCLE_PAYLOAD_KEYS,
  save_write_success: SAVE_LIFECYCLE_PAYLOAD_KEYS,
  scene_changed: ['from', 'to'],
  scene_first_frame: ['scene', 'durationMs'],
  scene_loaded: ['scene'],
  seed_planted: ['cropType', 'seedId', 'tileX', 'tileY', 'inputSource', 'eventTimestampMs'],
  startup_first_playable: [
    'scene',
    'bootToFirstPlayableMs',
    'cohort',
    'viewportWidth',
    'viewportHeight',
  ],
  upgrade_purchase_attempt: [
    'upgradeId',
    'inputSource',
    'result',
    'levelBefore',
    'levelAfter',
    'nextCost',
    'balance',
    'eventTimestampMs',
  ],
  upgrade_purchased: [
    'upgradeId',
    'source',
    'levelBefore',
    'levelAfter',
    'cost',
    'balance',
    'cropGrowthDurationMultiplier',
    'sellPriceMultiplier',
    'eventTimestampMs',
  ],
  upgrade_viewed: ['scene', 'panel', 'upgradeCount', 'balance', 'eventTimestampMs'],
} as const satisfies Record<string, readonly string[]>

export type TelemetryEventName = keyof typeof TELEMETRY_EVENT_SCHEMA

interface TelemetryEvent {
  name: TelemetryEventName
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
  event: TelemetryEventName
  properties: Record<string, TelemetryScalar | string>
  timestamp: string
}

const TELEMETRY_WINDOW_EVENT = 'tiny-ranch:telemetry'
const DISTINCT_ID_STORAGE_KEY = 'tiny-ranch:telemetry:distinct-id'
const MAX_EVENT_NAME_LENGTH = 120

const TELEMETRY_EVENT_PAYLOAD_KEY_SETS = (
  Object.keys(TELEMETRY_EVENT_SCHEMA) as TelemetryEventName[]
).reduce(
  (eventMap, eventName) => {
    eventMap[eventName] = new Set<string>(TELEMETRY_EVENT_SCHEMA[eventName])
    return eventMap
  },
  {} as Record<TelemetryEventName, ReadonlySet<string>>,
)

const DISALLOWED_PII_PAYLOAD_KEYS = new Set<string>([
  'address',
  'birthdate',
  'city',
  'country',
  'dob',
  'email',
  'first_name',
  'firstname',
  'full_name',
  'fullname',
  'ip',
  'ip_address',
  'last_name',
  'lastname',
  'name',
  'password',
  'phone',
  'postal_code',
  'postcode',
  'social_security_number',
  'ssn',
  'state',
  'street',
  'tax_id',
  'user_email',
  'username',
])

const SHOULD_WARN_TELEMETRY_VALIDATION = import.meta.env.DEV
const EMITTED_TELEMETRY_VALIDATION_WARNINGS = new Set<string>()

interface SanitizedPayloadResult {
  payload: TelemetryPayload
  unknownKeys: string[]
  blockedPiiKeys: string[]
  invalidValueKeys: string[]
}

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

function isKnownTelemetryEventName(name: string): name is TelemetryEventName {
  return Object.prototype.hasOwnProperty.call(TELEMETRY_EVENT_SCHEMA, name)
}

function warnTelemetryValidationOnce(key: string, message: string): void {
  if (!SHOULD_WARN_TELEMETRY_VALIDATION || EMITTED_TELEMETRY_VALIDATION_WARNINGS.has(key)) {
    return
  }

  EMITTED_TELEMETRY_VALIDATION_WARNINGS.add(key)
  console.warn(`[tiny-ranch] ${message}`)
}

function warnDroppedPayloadKeys(eventName: TelemetryEventName, reason: string, keys: string[]): void {
  for (const key of keys) {
    warnTelemetryValidationOnce(
      `${reason}:${eventName}:${key}`,
      `Telemetry dropped "${eventName}.${key}" (${reason}).`,
    )
  }
}

function sanitizePayload(eventName: TelemetryEventName, payload: TelemetryPayload): SanitizedPayloadResult {
  const allowedPayloadKeys = TELEMETRY_EVENT_PAYLOAD_KEY_SETS[eventName]
  const sanitized: TelemetryPayload = {}
  const unknownKeys: string[] = []
  const blockedPiiKeys: string[] = []
  const invalidValueKeys: string[] = []

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedPayloadKeys.has(key)) {
      unknownKeys.push(key)
      continue
    }

    if (DISALLOWED_PII_PAYLOAD_KEYS.has(key.toLowerCase())) {
      blockedPiiKeys.push(key)
      continue
    }

    if (!isTelemetryScalar(value)) {
      invalidValueKeys.push(key)
      continue
    }

    sanitized[key] = value
  }

  return {
    payload: sanitized,
    unknownKeys,
    blockedPiiKeys,
    invalidValueKeys,
  }
}

function createTelemetryEvent(name: string, payload: TelemetryPayload): TelemetryEvent | null {
  const normalizedName = normalizeEventName(name)
  if (!normalizedName) {
    return null
  }

  if (!isKnownTelemetryEventName(normalizedName)) {
    warnTelemetryValidationOnce(
      `unknown_event:${normalizedName}`,
      `Telemetry dropped unregistered event "${normalizedName}". Add it to TELEMETRY_EVENT_SCHEMA before emitting.`,
    )
    return null
  }

  const sanitizedPayload = sanitizePayload(normalizedName, payload)
  warnDroppedPayloadKeys(normalizedName, 'unknown_payload_key', sanitizedPayload.unknownKeys)
  warnDroppedPayloadKeys(normalizedName, 'disallowed_pii_key', sanitizedPayload.blockedPiiKeys)
  warnDroppedPayloadKeys(normalizedName, 'invalid_scalar_value', sanitizedPayload.invalidValueKeys)

  return {
    name: normalizedName,
    payload: sanitizedPayload.payload,
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
