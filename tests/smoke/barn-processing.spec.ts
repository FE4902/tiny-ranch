import { expect, test, type Page } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'
const SAVE_STORAGE_KEY = 'tiny-ranch:save-state'

type BarnSnapshot = {
  balance: number
  inventory: Record<string, number>
  jobs: Array<{
    id: string
    recipeId: string
    isReady: boolean
    remainingMs: number
  }>
}

type BarnStartDebugResult = {
  result: 'started' | 'insufficient_items' | 'insufficient_funds'
  jobId: string | null
  balance: number
  jobCount: number
}

type BarnClaimDebugResult = {
  result: 'claimed' | 'processing' | 'not_found'
  recipeId: string | null
  balance: number
  jobCount: number
}

type ReturnObjectiveSnapshot = {
  objectiveLoopEnabled: boolean
  streakBonusEnabled: boolean
  retentionKillSwitchEnabled: boolean
  activeObjectiveId: string | null
  metric: 'harvest_count' | 'sell_value' | 'barn_claim_count' | null
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

type ReturnSessionSummaryModalSnapshot = {
  isVisible: boolean
  titleText: string
  subtitleText: string
  rewardsText: string
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

async function launchSmokeSession(page: Page): Promise<void> {
  await page.goto('/?smokeTest=1', { waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)
}

async function debugSeedInventory(page: Page, itemId: string, quantity: number): Promise<void> {
  await page.evaluate(
    ({ harnessKey, itemId: nextItemId, quantity: nextQuantity }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as
        | {
            debugSeedInventory: (itemId: string, quantity: number) => void
          }
        | undefined
      if (!harness) {
        throw new Error('Smoke harness is not available on window.')
      }

      harness.debugSeedInventory(nextItemId, nextQuantity)
    },
    { harnessKey: SMOKE_HARNESS_KEY, itemId, quantity },
  )
}

async function getBarnSnapshot(page: Page): Promise<BarnSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getBarnSnapshot: () => BarnSnapshot
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getBarnSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function debugStartBarnJob(page: Page, recipeId: string): Promise<BarnStartDebugResult> {
  return page.evaluate(
    ({ harnessKey, recipeId: nextRecipeId }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as
        | {
            debugStartBarnJob: (recipeId: string) => BarnStartDebugResult
          }
        | undefined
      if (!harness) {
        throw new Error('Smoke harness is not available on window.')
      }

      return harness.debugStartBarnJob(nextRecipeId)
    },
    { harnessKey: SMOKE_HARNESS_KEY, recipeId },
  )
}

async function debugClaimBarnJob(page: Page, jobId: string): Promise<BarnClaimDebugResult> {
  return page.evaluate(
    ({ harnessKey, jobId: nextJobId }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as
        | {
            debugClaimBarnJob: (jobId: string) => BarnClaimDebugResult
          }
        | undefined
      if (!harness) {
        throw new Error('Smoke harness is not available on window.')
      }

      return harness.debugClaimBarnJob(nextJobId)
    },
    { harnessKey: SMOKE_HARNESS_KEY, jobId },
  )
}

async function debugSaveGameState(page: Page): Promise<void> {
  await page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          debugSaveGameState: () => unknown
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    harness.debugSaveGameState()
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

async function getReturnSessionSummaryModalSnapshot(
  page: Page,
): Promise<ReturnSessionSummaryModalSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getReturnSessionSummaryModalSnapshot: () => ReturnSessionSummaryModalSnapshot
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getReturnSessionSummaryModalSnapshot()
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

async function makeFirstBarnJobReady(page: Page): Promise<void> {
  await page.evaluate((storageKey: string) => {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      throw new Error('Expected persisted Barn save payload.')
    }

    const payload = JSON.parse(raw) as {
      barn?: {
        jobs?: Array<{
          readyAtEpochMs: number
        }>
      }
    }

    const job = payload.barn?.jobs?.[0]
    if (!job) {
      throw new Error('Expected a persisted Barn job in localStorage.')
    }

    job.readyAtEpochMs = Date.now() - 1
    window.localStorage.setItem(storageKey, JSON.stringify(payload))
  }, SAVE_STORAGE_KEY)
}

async function backdateFirstBarnJobSave(page: Page, elapsedMs: number): Promise<void> {
  await page.evaluate(
    ({ storageKey, elapsedMs: requestedElapsedMs }) => {
      const elapsedMs = Math.max(0, Math.floor(requestedElapsedMs))
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        throw new Error('Expected persisted Barn save payload.')
      }

      const payload = JSON.parse(raw) as {
        metadata?: {
          savedAtEpochMs?: number
        }
        barn?: {
          jobs?: Array<{
            startedAtEpochMs: number
            readyAtEpochMs: number
            processedAtEpochMs: number | null
          }>
        }
      }

      if (!payload.metadata || typeof payload.metadata.savedAtEpochMs !== 'number') {
        throw new Error('Expected persisted save metadata.')
      }

      const job = payload.barn?.jobs?.[0]
      if (!job) {
        throw new Error('Expected a persisted Barn job in localStorage.')
      }

      payload.metadata.savedAtEpochMs = Math.max(0, payload.metadata.savedAtEpochMs - elapsedMs)
      job.startedAtEpochMs = Math.max(0, job.startedAtEpochMs - elapsedMs)
      job.readyAtEpochMs = Math.max(job.startedAtEpochMs, job.readyAtEpochMs - elapsedMs)
      job.processedAtEpochMs = null

      window.localStorage.setItem(storageKey, JSON.stringify(payload))
    },
    { storageKey: SAVE_STORAGE_KEY, elapsedMs },
  )
}

async function readRawSavePayload(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((storageKey: string) => {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  }, SAVE_STORAGE_KEY)
}

test('legacy save without barn state hydrates to an empty barn queue and resaves safely', async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        schemaVersion: 1,
        metadata: {
          savedAtEpochMs: Date.now() - 5_000,
        },
        currency: 12,
        inventory: {
          turnip: 3,
        },
        progression: {
          activeScene: null,
          activeSeedId: 'turnip',
          expansionTier: 1,
        },
        ranch: {
          crops: [],
          animals: [],
        },
      }),
    )
  }, { storageKey: SAVE_STORAGE_KEY })

  await launchSmokeSession(page)

  const barnSnapshot = await getBarnSnapshot(page)
  expect(barnSnapshot.jobs).toHaveLength(0)

  await debugSaveGameState(page)
  const rawSave = await readRawSavePayload(page)
  expect(rawSave).not.toBeNull()
  expect(rawSave?.barn).toEqual({ jobs: [] })
})

test('barn jobs survive reload, become claimable, and persist their outputs', async ({ page }) => {
  await launchSmokeSession(page)

  await debugSeedInventory(page, 'milk', 2)

  const startResult = await debugStartBarnJob(page, 'cheese_press')
  expect(startResult.result).toBe('started')
  expect(startResult.jobId).not.toBeNull()
  expect(startResult.jobCount).toBe(1)

  const startedSnapshot = await getBarnSnapshot(page)
  expect(startedSnapshot.jobs).toHaveLength(1)
  expect(startedSnapshot.jobs[0]?.recipeId).toBe('cheese_press')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const reloadedSnapshot = await getBarnSnapshot(page)
  expect(reloadedSnapshot.jobs).toHaveLength(1)
  expect(reloadedSnapshot.jobs[0]?.id).toBe(startResult.jobId)

  await makeFirstBarnJobReady(page)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const readySnapshot = await getBarnSnapshot(page)
  expect(readySnapshot.jobs).toHaveLength(1)
  expect(readySnapshot.jobs[0]?.isReady).toBe(true)

  const claimResult = await debugClaimBarnJob(page, startResult.jobId ?? '')
  expect(claimResult.result).toBe('claimed')
  expect(claimResult.recipeId).toBe('cheese_press')
  expect(claimResult.jobCount).toBe(0)

  const claimedSnapshot = await getBarnSnapshot(page)
  expect(claimedSnapshot.jobs).toHaveLength(0)
  expect(claimedSnapshot.inventory.cheese).toBe(1)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const persistedSnapshot = await getBarnSnapshot(page)
  expect(persistedSnapshot.jobs).toHaveLength(0)
  expect(persistedSnapshot.inventory.cheese).toBe(1)
})

test('barn jobs become ready through offline hydration, surface in the return summary once, and stay claim-only', async ({
  page,
}) => {
  await launchSmokeSession(page)

  await debugSeedInventory(page, 'milk', 2)

  const startResult = await debugStartBarnJob(page, 'cheese_press')
  expect(startResult.result).toBe('started')
  expect(startResult.jobId).not.toBeNull()

  await backdateFirstBarnJobSave(page, 60_000)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  await expect
    .poll(async () => (await getReturnSessionSummaryModalSnapshot(page)).isVisible, {
      timeout: 5_000,
      message: 'Expected the return-session summary modal to surface the offline-ready Barn job.',
    })
    .toBe(true)

  const summaryModal = await getReturnSessionSummaryModalSnapshot(page)
  expect(summaryModal.titleText).toBe('Welcome Back')
  expect(summaryModal.subtitleText).toContain('Barn finished 1 job while you were away.')
  expect(summaryModal.subtitleText).not.toContain('Auto-collected')
  expect(summaryModal.rewardsText).toContain('Barn: Cheese Press')

  const hydratedSnapshot = await getBarnSnapshot(page)
  expect(hydratedSnapshot.jobs).toHaveLength(1)
  expect(hydratedSnapshot.jobs[0]?.isReady).toBe(true)
  expect(hydratedSnapshot.inventory.cheese ?? 0).toBe(0)

  const rawHydratedSave = await readRawSavePayload(page)
  const hydratedJob = (
    rawHydratedSave?.barn as
      | {
          jobs?: Array<{
            readyAtEpochMs: number
            processedAtEpochMs: number | null
          }>
        }
      | undefined
  )?.jobs?.[0]
  expect(hydratedJob).toBeDefined()
  expect(hydratedJob?.processedAtEpochMs).toBe(hydratedJob?.readyAtEpochMs)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const repeatSummaryModal = await getReturnSessionSummaryModalSnapshot(page)
  expect(repeatSummaryModal.isVisible).toBe(false)

  const preClaimSnapshot = await getBarnSnapshot(page)
  expect(preClaimSnapshot.jobs).toHaveLength(1)
  expect(preClaimSnapshot.jobs[0]?.isReady).toBe(true)
  expect(preClaimSnapshot.inventory.cheese ?? 0).toBe(0)

  const claimResult = await debugClaimBarnJob(page, startResult.jobId ?? '')
  expect(claimResult.result).toBe('claimed')
  expect(claimResult.recipeId).toBe('cheese_press')

  const claimedSnapshot = await getBarnSnapshot(page)
  expect(claimedSnapshot.jobs).toHaveLength(0)
  expect(claimedSnapshot.inventory.cheese).toBe(1)
})

test('barn claim progress completes the Barn return objective without bypassing gameplay hooks', async ({ page }) => {
  await launchSmokeSession(page)

  let barnObjective: ReturnObjectiveSnapshot | null = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = await getReturnObjectiveSnapshot(page)
    if (snapshot.metric === 'barn_claim_count') {
      barnObjective = snapshot
      break
    }

    const claim = await claimCurrentReturnObjective(page)
    expect(claim.result).toBe('claimed')
  }

  expect(barnObjective).not.toBeNull()
  expect(barnObjective?.objectiveLoopEnabled).toBe(true)
  expect(barnObjective?.metric).toBe('barn_claim_count')
  expect(barnObjective?.progressValue).toBe(0)
  expect(barnObjective?.targetValue).toBe(1)

  await debugSeedInventory(page, 'milk', 2)

  const startResult = await debugStartBarnJob(page, 'cheese_press')
  expect(startResult.result).toBe('started')
  expect(startResult.jobId).not.toBeNull()

  await makeFirstBarnJobReady(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const claimResult = await debugClaimBarnJob(page, startResult.jobId ?? '')
  expect(claimResult.result).toBe('claimed')
  expect(claimResult.recipeId).toBe('cheese_press')

  const progressedObjective = await getReturnObjectiveSnapshot(page)
  expect(progressedObjective.metric).toBe('barn_claim_count')
  expect(progressedObjective.progressValue).toBe(progressedObjective.targetValue)

  const rewardClaim = await claimCurrentReturnObjective(page)
  expect(rewardClaim.result).toBe('claimed')
  expect(rewardClaim.awardedRewardAmount).toBeGreaterThan(0)

  const finalBarnSnapshot = await getBarnSnapshot(page)
  expect(finalBarnSnapshot.jobs).toHaveLength(0)
  expect(finalBarnSnapshot.inventory.cheese).toBe(1)
})
