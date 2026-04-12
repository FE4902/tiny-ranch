import { expect, test, type Page } from '@playwright/test'

import { resolveFrameHealthBudget } from './frameHealthBudgets'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'

type SmokeSnapshot = {
  activeScene: string | null
  currency: number
  expansionTier: number
  nextExpansionCost: number | null
  ranchCropCount: number
  saveStateExists: boolean
}

type CoreLoopRunResult = {
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
  metric: 'harvest_count' | 'sell_value' | null
  progressValue: number
  targetValue: number
  rewardAmount: number
  assignmentCycle: number
  streakTier: number
  claimRewardAmount: number
  nextStreakTier: number
  nextClaimRewardAmount: number
}

type ReturnObjectiveClaimDebugResult = {
  result: 'claimed' | 'not_completed' | 'already_claimed' | 'no_active_objective'
  awardedRewardAmount: number
  awardedStreakTier: number
  assignmentCycleAfterClaim: number
}

type SmokeLaunchOptions = {
  retentionObjectiveUi?: boolean
  retentionStreakBonus?: boolean
  retentionKillSwitch?: boolean
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

async function getSnapshot(page: Page): Promise<SmokeSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getSnapshot: () => SmokeSnapshot
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function runCoreLoopFlow(page: Page): Promise<CoreLoopRunResult> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          runCoreLoopFlow: () => CoreLoopRunResult
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.runCoreLoopFlow()
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

async function persistLegacySaveWithoutStreak(page: Page): Promise<void> {
  await page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          debugPersistLegacySaveWithoutStreak: () => void
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    harness.debugPersistLegacySaveWithoutStreak()
  }, SMOKE_HARNESS_KEY)
}

test('launch -> plant -> harvest -> sell -> expansion -> reload save', async ({ page }, testInfo) => {
  await launchSmokeSession(page)
  const frameHealthBudget = resolveFrameHealthBudget(testInfo.project.name)

  const initialSnapshot = await getSnapshot(page)
  expect(initialSnapshot.activeScene).toBe('ranch')
  expect(initialSnapshot.expansionTier).toBe(1)
  expect(initialSnapshot.nextExpansionCost).not.toBeNull()
  expect(initialSnapshot.nextExpansionCost ?? 0).toBeGreaterThan(0)
  expect(initialSnapshot.ranchCropCount).toBe(0)

  await startFrameHealthSampling(page, frameHealthBudget.longFrameThresholdMs)
  const coreLoopResult = await runCoreLoopFlow(page)
  await page.waitForTimeout(frameHealthBudget.sampleWindowMs)
  const frameHealthMetrics = await stopFrameHealthSampling(page)

  console.log(
    `[frame-health][${testInfo.project.name}] p95=${frameHealthMetrics.p95FrameDurationMs.toFixed(2)}ms longFrames=${frameHealthMetrics.longFrameCount}/${frameHealthMetrics.sampleCount} threshold=${frameHealthMetrics.longFrameThresholdMs}ms max=${frameHealthMetrics.maxFrameDurationMs.toFixed(2)}ms`,
  )
  await testInfo.attach('frame-health-metrics', {
    contentType: 'application/json',
    body: Buffer.from(
      JSON.stringify(
        {
          project: testInfo.project.name,
          budget: frameHealthBudget,
          metrics: frameHealthMetrics,
        },
        null,
        2,
      ),
      'utf8',
    ),
  })

  expect(frameHealthMetrics.sampleCount).toBeGreaterThanOrEqual(frameHealthBudget.minimumSampleCount)
  expect(frameHealthMetrics.p95FrameDurationMs).toBeLessThanOrEqual(
    frameHealthBudget.maxP95FrameDurationMs,
  )
  expect(frameHealthMetrics.longFrameCount).toBeLessThanOrEqual(frameHealthBudget.maxLongFrameCount)

  expect(coreLoopResult.launchScene).toBe('ranch')
  expect(coreLoopResult.planted).toBe(true)
  expect(coreLoopResult.harvested).toBe(true)
  expect(coreLoopResult.sold).toBe(true)
  expect(coreLoopResult.expansionPurchased).toBe(true)
  expect(coreLoopResult.currencyAfterSale).toBeGreaterThanOrEqual(220)
  expect(coreLoopResult.expansionTierAfterPurchase).toBe(2)
  expect(coreLoopResult.persistedExpansionTier).toBe(2)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const reloadedSnapshot = await getSnapshot(page)
  expect(reloadedSnapshot.activeScene).toBe('ranch')
  expect(reloadedSnapshot.expansionTier).toBe(2)
  expect(reloadedSnapshot.currency).toBe(coreLoopResult.currencyAfterPurchase)
  expect(reloadedSnapshot.saveStateExists).toBe(true)
})

test('return objective streak increments on consecutive claims and survives reload', async ({ page }) => {
  await launchSmokeSession(page)

  const initialSnapshot = await getReturnObjectiveSnapshot(page)
  expect(initialSnapshot.objectiveLoopEnabled).toBe(true)
  expect(initialSnapshot.streakBonusEnabled).toBe(true)
  expect(initialSnapshot.retentionKillSwitchEnabled).toBe(false)
  expect(initialSnapshot.activeObjectiveId).not.toBeNull()
  expect(initialSnapshot.streakTier).toBe(0)

  const firstClaim = await claimCurrentReturnObjective(page)
  expect(firstClaim.result).toBe('claimed')
  expect(firstClaim.awardedStreakTier).toBe(1)

  const secondClaim = await claimCurrentReturnObjective(page)
  expect(secondClaim.result).toBe('claimed')
  expect(secondClaim.awardedStreakTier).toBe(2)
  expect(secondClaim.assignmentCycleAfterClaim).toBe(firstClaim.assignmentCycleAfterClaim + 1)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const reloadedSnapshot = await getReturnObjectiveSnapshot(page)
  expect(reloadedSnapshot.activeObjectiveId).not.toBeNull()
  expect(reloadedSnapshot.streakTier).toBe(2)
  expect(reloadedSnapshot.assignmentCycle).toBe(secondClaim.assignmentCycleAfterClaim)
})

test('return objective claim stays base-only when streak bonus flag is off', async ({ page }) => {
  await launchSmokeSession(page, { retentionStreakBonus: false })

  const initialSnapshot = await getReturnObjectiveSnapshot(page)
  expect(initialSnapshot.objectiveLoopEnabled).toBe(true)
  expect(initialSnapshot.streakBonusEnabled).toBe(false)
  expect(initialSnapshot.retentionKillSwitchEnabled).toBe(false)
  expect(initialSnapshot.activeObjectiveId).not.toBeNull()
  expect(initialSnapshot.streakTier).toBe(0)
  expect(initialSnapshot.nextStreakTier).toBe(0)

  const firstClaim = await claimCurrentReturnObjective(page)
  expect(firstClaim.result).toBe('claimed')
  expect(firstClaim.awardedRewardAmount).toBe(initialSnapshot.rewardAmount)
  expect(firstClaim.awardedStreakTier).toBe(0)

  const secondClaim = await claimCurrentReturnObjective(page)
  expect(secondClaim.result).toBe('claimed')
  expect(secondClaim.awardedStreakTier).toBe(0)
  expect(secondClaim.assignmentCycleAfterClaim).toBe(firstClaim.assignmentCycleAfterClaim + 1)
})

test('retention kill switch disables objective boot assignment and claim flow safely', async ({ page }) => {
  await launchSmokeSession(page, { retentionKillSwitch: true })

  const initialSnapshot = await getReturnObjectiveSnapshot(page)
  expect(initialSnapshot.retentionKillSwitchEnabled).toBe(true)
  expect(initialSnapshot.objectiveLoopEnabled).toBe(false)
  expect(initialSnapshot.streakBonusEnabled).toBe(false)
  expect(initialSnapshot.activeObjectiveId).toBeNull()

  const claimAttempt = await claimCurrentReturnObjective(page)
  expect(claimAttempt.result).toBe('no_active_objective')
  expect(claimAttempt.awardedRewardAmount).toBe(0)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const reloadedSnapshot = await getReturnObjectiveSnapshot(page)
  expect(reloadedSnapshot.retentionKillSwitchEnabled).toBe(true)
  expect(reloadedSnapshot.objectiveLoopEnabled).toBe(false)
  expect(reloadedSnapshot.streakBonusEnabled).toBe(false)
  expect(reloadedSnapshot.activeObjectiveId).toBeNull()
})

test('legacy save payload without streak state hydrates safely', async ({ page }) => {
  await launchSmokeSession(page)

  await claimCurrentReturnObjective(page)
  await persistLegacySaveWithoutStreak(page)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const snapshot = await getReturnObjectiveSnapshot(page)
  expect(snapshot.activeObjectiveId).not.toBeNull()
  expect(snapshot.streakTier).toBe(0)
  expect(snapshot.nextStreakTier).toBe(1)
  expect(snapshot.claimRewardAmount).toBe(snapshot.rewardAmount)
})
