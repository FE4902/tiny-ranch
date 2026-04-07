import type { TelemetryClient, TelemetryPayload } from './telemetry'

export type FunnelCohort = 'mobile_web' | 'desktop_web'
export type FunnelMilestone = 'launch' | 'move' | 'plant' | 'harvest' | 'sale' | 'session_end'
export type FirstSessionFunnelEventName =
  | 'first_session_launch'
  | 'first_session_move'
  | 'first_session_plant'
  | 'first_session_harvest'
  | 'first_session_sale'
  | 'first_session_end'

export type FirstSessionFunnelPayload = TelemetryPayload & {
  milestone: FunnelMilestone
  sessionId: string
  sessionStartedAtMs: number
  eventTimestampMs: number
  elapsedSessionMs: number
  eventIndex: number
  cohort: FunnelCohort
  startupScene: string
  startupOutcome: string
  scene: string
  source: string
  tileX: number | null
  tileY: number | null
  itemId: string | null
  quantity: number | null
  inventoryTotal: number | null
  revenue: number | null
  balance: number | null
}

export interface FirstSessionFunnelDebugEvent {
  name: FirstSessionFunnelEventName
  payload: FirstSessionFunnelPayload
  timestamp: string
}

interface FirstSessionFunnelMilestoneContext {
  scene?: string
  source?: string
  tileX?: number
  tileY?: number
  itemId?: string
  quantity?: number
  inventoryTotal?: number
  revenue?: number
  balance?: number
}

interface FirstSessionLaunchContext {
  startupScene: string
  startupOutcome: string
  source?: string
}

export interface FirstSessionFunnelTracker {
  trackLaunch(context: FirstSessionLaunchContext): void
  trackMove(context?: FirstSessionFunnelMilestoneContext): void
  trackPlant(context?: FirstSessionFunnelMilestoneContext): void
  trackHarvest(context?: FirstSessionFunnelMilestoneContext): void
  trackSale(context?: FirstSessionFunnelMilestoneContext): void
  trackSessionEnd(context?: FirstSessionFunnelMilestoneContext): void
}

export const FIRST_SESSION_FUNNEL_DEBUG_EVENT = 'tiny-ranch:first-session-funnel'

const FIRST_SESSION_FUNNEL_LOG_WINDOW_KEY = '__tinyRanchFirstSessionFunnelLog'
const FIRST_SESSION_FUNNEL_LOG_LIMIT = 64

const eventNameByMilestone: Readonly<Record<FunnelMilestone, FirstSessionFunnelEventName>> = {
  launch: 'first_session_launch',
  move: 'first_session_move',
  plant: 'first_session_plant',
  harvest: 'first_session_harvest',
  sale: 'first_session_sale',
  session_end: 'first_session_end',
}

type FirstSessionFunnelWindow = Window & {
  [FIRST_SESSION_FUNNEL_LOG_WINDOW_KEY]?: FirstSessionFunnelDebugEvent[]
}

function normalizeString(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function normalizeOptionalInteger(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.floor(value)
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const timestamp = Date.now().toString(36)
  const entropy = Math.floor(Math.random() * 1_000_000_000).toString(36)
  return `session-${timestamp}-${entropy}`
}

function appendToDebugLog(event: FirstSessionFunnelDebugEvent): void {
  if (typeof window === 'undefined') {
    return
  }

  const debugWindow = window as FirstSessionFunnelWindow
  const log = debugWindow[FIRST_SESSION_FUNNEL_LOG_WINDOW_KEY] ?? []
  const nextLog = [...log, event].slice(-FIRST_SESSION_FUNNEL_LOG_LIMIT)
  debugWindow[FIRST_SESSION_FUNNEL_LOG_WINDOW_KEY] = nextLog
  window.dispatchEvent(
    new CustomEvent<FirstSessionFunnelDebugEvent>(FIRST_SESSION_FUNNEL_DEBUG_EVENT, {
      detail: event,
    }),
  )
}

export function getFirstSessionFunnelDebugLog(): FirstSessionFunnelDebugEvent[] {
  if (typeof window === 'undefined') {
    return []
  }

  const debugWindow = window as FirstSessionFunnelWindow
  const log = debugWindow[FIRST_SESSION_FUNNEL_LOG_WINDOW_KEY] ?? []
  return [...log]
}

class FirstSessionFunnelTrackerImpl implements FirstSessionFunnelTracker {
  private readonly sessionId = createSessionId()
  private readonly sessionStartedAtMs = Date.now()
  private readonly emittedMilestones = new Set<FunnelMilestone>()
  private eventIndex = 0
  private startupScene = 'unknown'
  private startupOutcome = 'unknown'
  private readonly telemetry: TelemetryClient
  private readonly cohort: FunnelCohort

  constructor(telemetry: TelemetryClient, cohort: FunnelCohort) {
    this.telemetry = telemetry
    this.cohort = cohort
  }

  trackLaunch(context: FirstSessionLaunchContext): void {
    this.startupScene = normalizeString(context.startupScene, 'unknown')
    this.startupOutcome = normalizeString(context.startupOutcome, 'unknown')
    this.emitMilestone('launch', {
      scene: this.startupScene,
      source: context.source ?? 'system',
    })
  }

  trackMove(context: FirstSessionFunnelMilestoneContext = {}): void {
    this.emitMilestone('move', context)
  }

  trackPlant(context: FirstSessionFunnelMilestoneContext = {}): void {
    this.emitMilestone('plant', context)
  }

  trackHarvest(context: FirstSessionFunnelMilestoneContext = {}): void {
    this.emitMilestone('harvest', context)
  }

  trackSale(context: FirstSessionFunnelMilestoneContext = {}): void {
    this.emitMilestone('sale', context)
  }

  trackSessionEnd(context: FirstSessionFunnelMilestoneContext = {}): void {
    this.emitMilestone('session_end', context)
  }

  private emitMilestone(
    milestone: FunnelMilestone,
    context: FirstSessionFunnelMilestoneContext = {},
  ): void {
    if (this.emittedMilestones.has(milestone)) {
      return
    }

    this.emittedMilestones.add(milestone)
    this.eventIndex += 1

    const eventTimestampMs = Date.now()
    const payload: FirstSessionFunnelPayload = {
      milestone,
      sessionId: this.sessionId,
      sessionStartedAtMs: this.sessionStartedAtMs,
      eventTimestampMs,
      elapsedSessionMs: Math.max(0, eventTimestampMs - this.sessionStartedAtMs),
      eventIndex: this.eventIndex,
      cohort: this.cohort,
      startupScene: this.startupScene,
      startupOutcome: this.startupOutcome,
      scene: normalizeString(context.scene, this.startupScene),
      source: normalizeString(context.source, 'system'),
      tileX: normalizeOptionalInteger(context.tileX),
      tileY: normalizeOptionalInteger(context.tileY),
      itemId: normalizeOptionalString(context.itemId),
      quantity: normalizeOptionalInteger(context.quantity),
      inventoryTotal: normalizeOptionalInteger(context.inventoryTotal),
      revenue: normalizeOptionalInteger(context.revenue),
      balance: normalizeOptionalInteger(context.balance),
    }

    const name = eventNameByMilestone[milestone]
    this.telemetry.track(name, payload)
    appendToDebugLog({
      name,
      payload,
      timestamp: new Date(eventTimestampMs).toISOString(),
    })
  }
}

export function createFirstSessionFunnelTracker(
  telemetry: TelemetryClient,
  cohort: FunnelCohort,
): FirstSessionFunnelTracker {
  return new FirstSessionFunnelTrackerImpl(telemetry, cohort)
}
