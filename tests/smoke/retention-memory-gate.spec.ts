import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'

type SmokeLaunchOptions = {
  retentionObjectiveUi?: boolean
  retentionStreakBonus?: boolean
  retentionKillSwitch?: boolean
}

type FrameHealthMetrics = {
  sampleCount: number
  sampledDurationMs: number
  averageFrameDurationMs: number
  p95FrameDurationMs: number
  maxFrameDurationMs: number
  longFrameCount: number
  longFrameThresholdMs: number
}

type ReturnObjectiveSnapshot = {
  objectiveLoopEnabled: boolean
  streakBonusEnabled: boolean
  retentionKillSwitchEnabled: boolean
  activeObjectiveId: string | null
}

type ReturnObjectiveClaimDebugResult = {
  result: 'claimed' | 'not_completed' | 'already_claimed' | 'no_active_objective'
  awardedRewardAmount: number
  awardedStreakTier: number
  assignmentCycleAfterClaim: number
}

type MemoryGateThresholds = {
  maxNetHeapDriftBytes: number
  maxPeakHeapDriftBytes: number
  maxLongFrameRatio: number
  maxFrameSpikeCorrelation: number
}

type MemoryGateCase = {
  caseKey: string
  sessionCount: number
  flags: SmokeLaunchOptions
  expected: {
    objectiveLoopEnabled: boolean
    streakBonusEnabled: boolean
    retentionKillSwitchEnabled: boolean
    claimResult: ReturnObjectiveClaimDebugResult['result']
  }
  thresholds: MemoryGateThresholds
}

type MemoryGateFixture = {
  sampleWindowMs: number
  saveReloadInterval: number
  longFrameThresholdMs: number
  cases: MemoryGateCase[]
}

type CdpSession = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}

type HeapMetricsResponse = {
  metrics?: Array<{ name?: string; value?: number }>
}

type MemoryWindowSample = {
  sessionIndex: number
  heapUsedBytes: number
  heapDeltaBytes: number
  frameSampleCount: number
  longFrameCount: number
  p95FrameDurationMs: number
  maxFrameDurationMs: number
}

type CaseMetrics = {
  sessionCount: number
  sampleWindowMs: number
  saveReloadInterval: number
  baselineHeapUsedBytes: number
  endingHeapUsedBytes: number
  netHeapDriftBytes: number
  peakHeapDriftBytes: number
  totalFrameSamples: number
  totalLongFrameCount: number
  longFrameRatio: number
  frameSpikeCorrelation: number
}

type ThresholdFailure = {
  metric: keyof MemoryGateThresholds | 'claimResult'
  actual: number | string
  maxAllowed?: number
  expected?: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../fixtures/save/retention-memory-gate-thresholds.fixture.json',
)

function loadFixture(): MemoryGateFixture {
  const raw = readFileSync(FIXTURE_PATH, 'utf8')
  const parsed = JSON.parse(raw) as MemoryGateFixture
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error('retention-memory-gate fixture must include at least one case.')
  }
  if (!Number.isFinite(parsed.sampleWindowMs) || parsed.sampleWindowMs <= 0) {
    throw new Error('retention-memory-gate fixture sampleWindowMs must be a positive number.')
  }
  if (!Number.isFinite(parsed.saveReloadInterval) || parsed.saveReloadInterval <= 0) {
    throw new Error('retention-memory-gate fixture saveReloadInterval must be a positive number.')
  }
  if (!Number.isFinite(parsed.longFrameThresholdMs) || parsed.longFrameThresholdMs <= 0) {
    throw new Error('retention-memory-gate fixture longFrameThresholdMs must be a positive number.')
  }
  return parsed
}

async function waitForSmokeHarness(page: Page): Promise<void> {
  await page.waitForFunction(
    (harnessKey: string) => {
      const key = harnessKey as keyof Window
      return typeof window[key] !== 'undefined'
    },
    SMOKE_HARNESS_KEY,
    { timeout: 15_000 },
  )

  await page.evaluate(
    async (harnessKey: string) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as
        | {
            waitForReady: (timeoutMs?: number) => Promise<void>
          }
        | undefined

      if (!harness) {
        throw new Error('Smoke harness is not available on window.')
      }

      await harness.waitForReady(15_000)
    },
    SMOKE_HARNESS_KEY,
  )
}

async function launchSmokeSession(page: Page, options: SmokeLaunchOptions = {}): Promise<void> {
  const params = new URLSearchParams()
  params.set('smokeTest', '1')

  if (options.retentionObjectiveUi !== undefined) {
    params.set('retentionObjectiveUi', options.retentionObjectiveUi ? '1' : '0')
  }
  if (options.retentionStreakBonus !== undefined) {
    params.set('retentionStreakBonus', options.retentionStreakBonus ? '1' : '0')
  }
  if (options.retentionKillSwitch !== undefined) {
    params.set('retentionKillSwitch', options.retentionKillSwitch ? '1' : '0')
  }

  await page.goto(`/?${params.toString()}`, { waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)
}

async function getReturnObjectiveSnapshot(page: Page): Promise<ReturnObjectiveSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getReturnObjectiveSnapshot: () => ReturnObjectiveSnapshot
        }
      | undefined

    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getReturnObjectiveSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function claimCurrentReturnObjective(page: Page): Promise<ReturnObjectiveClaimDebugResult> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          debugClaimCurrentReturnObjective: () => ReturnObjectiveClaimDebugResult
        }
      | undefined

    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.debugClaimCurrentReturnObjective()
  }, SMOKE_HARNESS_KEY)
}

async function startFrameHealthSampling(page: Page, longFrameThresholdMs: number): Promise<void> {
  await page.evaluate(
    ({ harnessKey, thresholdMs }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as
        | {
            startFrameHealthSampling: (options?: { longFrameThresholdMs?: number }) => void
          }
        | undefined

      if (!harness) {
        throw new Error('Smoke harness is not available on window.')
      }

      harness.startFrameHealthSampling({ longFrameThresholdMs: thresholdMs })
    },
    { harnessKey: SMOKE_HARNESS_KEY, thresholdMs: longFrameThresholdMs },
  )
}

async function stopFrameHealthSampling(page: Page): Promise<FrameHealthMetrics> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          stopFrameHealthSampling: () => FrameHealthMetrics
        }
      | undefined

    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.stopFrameHealthSampling()
  }, SMOKE_HARNESS_KEY)
}

async function sampleHeapUsedBytes(page: Page, cdpSession: CdpSession): Promise<number> {
  await cdpSession.send('HeapProfiler.collectGarbage').catch(() => {
    // Skip hard failure when the runtime does not expose explicit collect-garbage.
  })
  const performanceMetrics = (await cdpSession.send('Performance.getMetrics')) as HeapMetricsResponse
  const heapMetric = performanceMetrics.metrics?.find((metric) => metric.name === 'JSHeapUsedSize')

  if (heapMetric && Number.isFinite(heapMetric.value)) {
    return Math.max(0, Math.floor(heapMetric.value))
  }

  const fallback = await page.evaluate(() => {
    const memoryValue = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
      ?.usedJSHeapSize
    return Number.isFinite(memoryValue) ? Math.floor(memoryValue as number) : null
  })
  if (fallback !== null) {
    return Math.max(0, fallback)
  }

  throw new Error('Unable to sample JS heap usage from Performance.getMetrics or performance.memory.')
}

function calculatePearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) {
    return 0
  }

  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length

  let numerator = 0
  let xVariance = 0
  let yVariance = 0

  for (let index = 0; index < xs.length; index += 1) {
    const xDelta = xs[index] - xMean
    const yDelta = ys[index] - yMean
    numerator += xDelta * yDelta
    xVariance += xDelta * xDelta
    yVariance += yDelta * yDelta
  }

  const denominator = Math.sqrt(xVariance * yVariance)
  if (denominator <= 0) {
    return 0
  }

  return numerator / denominator
}

function evaluateThresholds(
  expectedClaimResult: ReturnObjectiveClaimDebugResult['result'],
  thresholdConfig: MemoryGateThresholds,
  metrics: CaseMetrics,
  claimFailures: number,
): ThresholdFailure[] {
  const failures: ThresholdFailure[] = []

  if (metrics.netHeapDriftBytes > thresholdConfig.maxNetHeapDriftBytes) {
    failures.push({
      metric: 'maxNetHeapDriftBytes',
      actual: metrics.netHeapDriftBytes,
      maxAllowed: thresholdConfig.maxNetHeapDriftBytes,
    })
  }
  if (metrics.peakHeapDriftBytes > thresholdConfig.maxPeakHeapDriftBytes) {
    failures.push({
      metric: 'maxPeakHeapDriftBytes',
      actual: metrics.peakHeapDriftBytes,
      maxAllowed: thresholdConfig.maxPeakHeapDriftBytes,
    })
  }
  if (metrics.longFrameRatio > thresholdConfig.maxLongFrameRatio) {
    failures.push({
      metric: 'maxLongFrameRatio',
      actual: Number(metrics.longFrameRatio.toFixed(6)),
      maxAllowed: thresholdConfig.maxLongFrameRatio,
    })
  }
  if (metrics.frameSpikeCorrelation > thresholdConfig.maxFrameSpikeCorrelation) {
    failures.push({
      metric: 'maxFrameSpikeCorrelation',
      actual: Number(metrics.frameSpikeCorrelation.toFixed(6)),
      maxAllowed: thresholdConfig.maxFrameSpikeCorrelation,
    })
  }
  if (claimFailures > 0) {
    failures.push({
      metric: 'claimResult',
      actual: `${claimFailures} mismatches`,
      expected: expectedClaimResult,
    })
  }

  return failures
}

function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  return testInfo.attach(name, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
  })
}

test('mobile retention memory-drift gate remains within source-controlled thresholds', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'Retention memory-drift gate runs only on mobile Chromium profile.',
  )
  test.setTimeout(240_000)

  const fixture = loadFixture()
  const cdpSession = (await page.context().newCDPSession(page)) as CdpSession
  await cdpSession.send('Performance.enable')
  await cdpSession.send('HeapProfiler.enable').catch(() => {
    // Ignore if unavailable; fallback sampling still works when exposed.
  })

  const caseDiagnostics: unknown[] = []
  const failedDiagnostics: unknown[] = []

  for (const caseConfig of fixture.cases) {
    await launchSmokeSession(page, caseConfig.flags)

    const initialSnapshot = await getReturnObjectiveSnapshot(page)
    expect(initialSnapshot.objectiveLoopEnabled).toBe(caseConfig.expected.objectiveLoopEnabled)
    expect(initialSnapshot.streakBonusEnabled).toBe(caseConfig.expected.streakBonusEnabled)
    expect(initialSnapshot.retentionKillSwitchEnabled).toBe(
      caseConfig.expected.retentionKillSwitchEnabled,
    )

    let previousHeapUsedBytes = await sampleHeapUsedBytes(page, cdpSession)
    const baselineHeapUsedBytes = previousHeapUsedBytes
    const windowSamples: MemoryWindowSample[] = []
    let claimFailureCount = 0

    for (let sessionIndex = 0; sessionIndex < caseConfig.sessionCount; sessionIndex += 1) {
      await startFrameHealthSampling(page, fixture.longFrameThresholdMs)
      const claimResult = await claimCurrentReturnObjective(page)
      if (claimResult.result !== caseConfig.expected.claimResult) {
        claimFailureCount += 1
      }

      await page.waitForTimeout(fixture.sampleWindowMs)
      const frameMetrics = await stopFrameHealthSampling(page)
      const heapUsedBytes = await sampleHeapUsedBytes(page, cdpSession)
      const heapDeltaBytes = heapUsedBytes - previousHeapUsedBytes
      previousHeapUsedBytes = heapUsedBytes

      windowSamples.push({
        sessionIndex,
        heapUsedBytes,
        heapDeltaBytes,
        frameSampleCount: frameMetrics.sampleCount,
        longFrameCount: frameMetrics.longFrameCount,
        p95FrameDurationMs: frameMetrics.p95FrameDurationMs,
        maxFrameDurationMs: frameMetrics.maxFrameDurationMs,
      })

      if (
        (sessionIndex + 1) % fixture.saveReloadInterval === 0 &&
        sessionIndex < caseConfig.sessionCount - 1
      ) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForSmokeHarness(page)
      }
    }

    const endingHeapUsedBytes =
      windowSamples.length > 0 ? windowSamples[windowSamples.length - 1].heapUsedBytes : baselineHeapUsedBytes
    const netHeapDriftBytes = endingHeapUsedBytes - baselineHeapUsedBytes
    const peakHeapDriftBytes = Math.max(
      0,
      ...windowSamples.map((sample) => sample.heapUsedBytes - baselineHeapUsedBytes),
    )
    const totalFrameSamples = windowSamples.reduce((sum, sample) => sum + sample.frameSampleCount, 0)
    const totalLongFrameCount = windowSamples.reduce((sum, sample) => sum + sample.longFrameCount, 0)
    const longFrameRatio = totalFrameSamples > 0 ? totalLongFrameCount / totalFrameSamples : 0
    const frameSpikeCorrelation = calculatePearsonCorrelation(
      windowSamples.map((sample) => sample.heapDeltaBytes),
      windowSamples.map((sample) => sample.longFrameCount),
    )

    const caseMetrics: CaseMetrics = {
      sessionCount: caseConfig.sessionCount,
      sampleWindowMs: fixture.sampleWindowMs,
      saveReloadInterval: fixture.saveReloadInterval,
      baselineHeapUsedBytes,
      endingHeapUsedBytes,
      netHeapDriftBytes,
      peakHeapDriftBytes,
      totalFrameSamples,
      totalLongFrameCount,
      longFrameRatio: Number(longFrameRatio.toFixed(6)),
      frameSpikeCorrelation: Number(frameSpikeCorrelation.toFixed(6)),
    }
    const thresholdExceeded = evaluateThresholds(
      caseConfig.expected.claimResult,
      caseConfig.thresholds,
      caseMetrics,
      claimFailureCount,
    )

    const caseDiagnostic = {
      caseKey: caseConfig.caseKey,
      sampleWindow: {
        sessionStart: 0,
        sessionEnd: Math.max(0, caseConfig.sessionCount - 1),
        sampleWindowMs: fixture.sampleWindowMs,
      },
      driftMetrics: caseMetrics,
      thresholds: caseConfig.thresholds,
      thresholdExceeded,
      recentWindowSamples: windowSamples.slice(-5),
    }

    caseDiagnostics.push(caseDiagnostic)
    if (thresholdExceeded.length > 0) {
      failedDiagnostics.push(caseDiagnostic)
      console.error(`[retention-memory-gate] ${JSON.stringify(caseDiagnostic)}`)
    }
  }

  await attachJson(testInfo, 'retention-memory-gate-results', {
    fixturePath: path.relative(process.cwd(), FIXTURE_PATH),
    cases: caseDiagnostics,
  })

  if (failedDiagnostics.length > 0) {
    await attachJson(testInfo, 'retention-memory-gate-failures', failedDiagnostics)
  }

  expect(
    failedDiagnostics,
    `Retention memory gate exceeded thresholds:\n${JSON.stringify(failedDiagnostics, null, 2)}`,
  ).toHaveLength(0)
})
