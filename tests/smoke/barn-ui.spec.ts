import { expect, test, type Page } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'
const SAVE_STORAGE_KEY = 'tiny-ranch:save-state'
const TELEMETRY_BUFFER_KEY = '__TINY_RANCH_BARN_TELEMETRY__'
const TELEMETRY_BUFFER_STORAGE_KEY = 'tiny-ranch:smoke:telemetry'
const CHEESE_PRESS_INPUT_UNIT_VALUE = 28
const CHEESE_PRESS_OUTPUT_UNIT_VALUE = 60
const CHEESE_PRESS_EXPECTED_NET_VALUE = 4
const BARN_LIFECYCLE_EVENT_NAMES = new Set([
  'barn_job_aborted',
  'barn_job_queued',
  'barn_job_processed',
  'barn_job_claimed',
])

type SmokeSnapshot = {
  activeScene: string | null
  currency: number
  inventory: Record<string, number>
  expansionTier: number
  nextExpansionCost: number | null
  ranchCropCount: number
  saveStateExists: boolean
}

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

type BarnUiSnapshot = {
  selectedRecipeId: string
  inventoryText: string
  recipeDetailText: string
  jobListText: string
  feedbackText: string
  cycleRecipeButtonCenter: { x: number; y: number } | null
  startRecipeButtonCenter: { x: number; y: number } | null
  claimButtonCenter: { x: number; y: number } | null
}

type BufferedTelemetryEvent = {
  name: string
  payload: Record<string, unknown>
}

type BarnSmokeHarness = {
  waitForReady: (timeoutMs?: number) => Promise<void>
  getSnapshot: () => SmokeSnapshot
  getBarnSnapshot: () => BarnSnapshot
  getBarnUiSnapshot: () => BarnUiSnapshot
  debugNavigate: (sceneKey: 'ranch' | 'barn') => void
  debugSeedInventory: (itemId: string, quantity: number) => void
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
      const harness = window[key] as BarnSmokeHarness | undefined
      if (!harness) {
        throw new Error('Barn smoke harness is not available on window.')
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

async function installTelemetryBuffer(page: Page): Promise<void> {
  await page.addInitScript(
    ({ bufferKey, storageKey }) => {
      const key = bufferKey as keyof Window
      const windowRecord = window as unknown as Record<string, unknown>
      let events: unknown[] = []

      try {
        const raw = window.sessionStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            events = parsed
          }
        }
      } catch {
        events = []
      }

      const persist = (): void => {
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(events))
        } catch {
          // Ignore storage write failures in smoke-only helpers.
        }
      }

      windowRecord[key] = events
      persist()

      window.addEventListener('tiny-ranch:telemetry', (event) => {
        const detail = (event as CustomEvent<unknown>).detail
        if (!detail || typeof detail !== 'object') {
          return
        }

        events.push(detail)
        persist()
      })
    },
    { bufferKey: TELEMETRY_BUFFER_KEY, storageKey: TELEMETRY_BUFFER_STORAGE_KEY },
  )
}

async function debugNavigate(page: Page, sceneKey: 'ranch' | 'barn'): Promise<void> {
  await page.evaluate(
    ({ harnessKey, nextSceneKey }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as BarnSmokeHarness | undefined
      if (!harness) {
        throw new Error('Barn smoke harness is not available on window.')
      }

      harness.debugNavigate(nextSceneKey)
    },
    { harnessKey: SMOKE_HARNESS_KEY, nextSceneKey: sceneKey },
  )
}

async function getSnapshot(page: Page): Promise<SmokeSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as BarnSmokeHarness | undefined
    if (!harness) {
      throw new Error('Barn smoke harness is not available on window.')
    }

    return harness.getSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function getBarnSnapshot(page: Page): Promise<BarnSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as BarnSmokeHarness | undefined
    if (!harness) {
      throw new Error('Barn smoke harness is not available on window.')
    }

    return harness.getBarnSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function getBarnUiSnapshot(page: Page): Promise<BarnUiSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as BarnSmokeHarness | undefined
    if (!harness) {
      throw new Error('Barn smoke harness is not available on window.')
    }

    return harness.getBarnUiSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function getTelemetryEvents(page: Page): Promise<BufferedTelemetryEvent[]> {
  return page.evaluate((bufferKey: string) => {
    const key = bufferKey as keyof Window
    const windowRecord = window as unknown as Record<string, unknown>
    const events = windowRecord[key]
    if (!Array.isArray(events)) {
      return []
    }

    return events
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }

        const candidate = entry as {
          name?: unknown
          payload?: unknown
        }
        if (typeof candidate.name !== 'string' || !candidate.payload || typeof candidate.payload !== 'object') {
          return null
        }

        return {
          name: candidate.name,
          payload: candidate.payload as Record<string, unknown>,
        }
      })
      .filter((entry): entry is BufferedTelemetryEvent => entry !== null)
  }, TELEMETRY_BUFFER_KEY)
}

function getCheesePressEconomyValue(snapshot: BarnSnapshot): number {
  return (
    snapshot.balance +
    (snapshot.inventory.milk ?? 0) * CHEESE_PRESS_INPUT_UNIT_VALUE +
    (snapshot.inventory.cheese ?? 0) * CHEESE_PRESS_OUTPUT_UNIT_VALUE
  )
}

async function debugSeedInventory(page: Page, itemId: string, quantity: number): Promise<void> {
  await page.evaluate(
    ({ harnessKey, targetItemId, targetQuantity }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as BarnSmokeHarness | undefined
      if (!harness) {
        throw new Error('Barn smoke harness is not available on window.')
      }

      harness.debugSeedInventory(targetItemId, targetQuantity)
    },
    { harnessKey: SMOKE_HARNESS_KEY, targetItemId: itemId, targetQuantity: quantity },
  )
}

async function tapBarnButton(
  page: Page,
  buttonKey: 'cycleRecipeButtonCenter' | 'startRecipeButtonCenter' | 'claimButtonCenter',
): Promise<void> {
  const canvas = page.locator('canvas').first()
  await canvas.scrollIntoViewIfNeeded()
  const snapshot = await getBarnUiSnapshot(page)
  const point = snapshot[buttonKey]
  if (!point) {
    throw new Error(`Expected Barn UI button coordinates for ${buttonKey}.`)
  }

  await canvas.tap({
    position: {
      x: point.x,
      y: point.y,
    },
  })
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

async function unlockFeedMixThroughSavedProgression(page: Page): Promise<void> {
  await page.evaluate((storageKey: string) => {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      throw new Error('Expected persisted save payload before promoting Barn recipe progression.')
    }

    const payload = JSON.parse(raw) as {
      metadata?: {
        savedAtEpochMs?: number
      }
      currency?: number
      inventory?: Record<string, number>
      progression?: {
        activeScene?: string | null
        expansionTier?: number
      }
    }

    if (!payload.metadata) {
      payload.metadata = {}
    }
    if (!payload.inventory) {
      payload.inventory = {}
    }
    if (!payload.progression) {
      throw new Error('Expected persisted progression state before promoting Barn recipe unlock.')
    }

    payload.metadata.savedAtEpochMs = Date.now()
    payload.currency = Math.max(payload.currency ?? 0, 4)
    payload.inventory.turnip = Math.max(payload.inventory.turnip ?? 0, 2)
    payload.inventory.egg = Math.max(payload.inventory.egg ?? 0, 1)
    payload.progression.activeScene = 'barn'
    payload.progression.expansionTier = 2

    window.localStorage.setItem(storageKey, JSON.stringify(payload))
  }, SAVE_STORAGE_KEY)
}

test('desktop Barn scene keeps keyboard parity for recipe start and claim after reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Keyboard Barn smoke runs only for desktop.')

  await launchSmokeSession(page)
  await debugNavigate(page, 'barn')

  await expect
    .poll(async () => (await getSnapshot(page)).activeScene, {
      timeout: 5_000,
      message: 'Expected Barn scene to become active before keyboard input.',
    })
    .toBe('barn')

  await page.keyboard.press('KeyQ')
  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).selectedRecipeId, {
      timeout: 5_000,
      message: 'Expected Barn keyboard shortcut to cycle the selected recipe.',
    })
    .toBe('feed_mix')

  await page.keyboard.press('KeyQ')
  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).selectedRecipeId, {
      timeout: 5_000,
      message: 'Expected Barn keyboard shortcut to continue cycling recipes.',
    })
    .toBe('wool_bundle')

  await page.keyboard.press('KeyQ')
  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).selectedRecipeId, {
      timeout: 5_000,
      message: 'Expected Barn recipe cycle to wrap back to the first recipe.',
    })
    .toBe('cheese_press')

  await debugSeedInventory(page, 'milk', 2)
  await page.keyboard.press('KeyW')

  await expect
    .poll(async () => (await getBarnSnapshot(page)).jobs.length, {
      timeout: 5_000,
      message: 'Expected Barn keyboard start shortcut to queue a job.',
    })
    .toBe(1)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)
  expect((await getSnapshot(page)).activeScene).toBe('barn')

  await makeFirstBarnJobReady(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  await expect
    .poll(async () => (await getBarnSnapshot(page)).jobs[0]?.isReady ?? false, {
      timeout: 5_000,
      message: 'Expected reloaded Barn job to become ready before keyboard claim.',
    })
    .toBe(true)

  await page.keyboard.press('KeyE')

  await expect
    .poll(async () => (await getBarnSnapshot(page)).jobs.length, {
      timeout: 5_000,
      message: 'Expected Barn keyboard claim shortcut to remove the ready job.',
    })
    .toBe(0)

  await expect
    .poll(async () => (await getBarnSnapshot(page)).inventory.cheese ?? 0, {
      timeout: 5_000,
      message: 'Expected claimed Barn output to persist in inventory after keyboard claim.',
    })
    .toBe(1)
})

test('mobile Barn scene touch flow emits lifecycle telemetry, preserves economy deltas, and persists claim state across reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Touch Barn smoke runs only for mobile.')

  await installTelemetryBuffer(page)
  await launchSmokeSession(page)
  await debugNavigate(page, 'barn')

  await expect
    .poll(async () => (await getSnapshot(page)).activeScene, {
      timeout: 5_000,
      message: 'Expected Barn scene to become active before touch input.',
    })
    .toBe('barn')

  expect((await getBarnUiSnapshot(page)).recipeDetailText).toContain('Controls tap the buttons or press Q / W / E.')

  await tapBarnButton(page, 'startRecipeButtonCenter')
  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).feedbackText, {
      timeout: 5_000,
      message: 'Expected touch start attempt without inventory to show missing-input feedback.',
    })
    .toBe('Missing 2 milk.')

  await debugSeedInventory(page, 'milk', 2)
  const seededSnapshot = await getBarnSnapshot(page)
  const seededEconomyValue = getCheesePressEconomyValue(seededSnapshot)
  expect(seededSnapshot.inventory.milk ?? 0).toBe(2)

  await tapBarnButton(page, 'startRecipeButtonCenter')

  await expect
    .poll(async () => (await getBarnSnapshot(page)).jobs.length, {
      timeout: 5_000,
      message: 'Expected touch start interaction to queue a Barn job.',
    })
    .toBe(1)

  const queuedSnapshot = await getBarnSnapshot(page)
  expect(queuedSnapshot.inventory.milk ?? 0).toBe(0)
  expect(queuedSnapshot.inventory.cheese ?? 0).toBe(0)
  expect(getCheesePressEconomyValue(queuedSnapshot) - seededEconomyValue).toBe(
    -CHEESE_PRESS_INPUT_UNIT_VALUE * 2,
  )

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)
  expect((await getSnapshot(page)).activeScene).toBe('barn')

  const reloadedQueuedSnapshot = await getBarnSnapshot(page)
  expect(getCheesePressEconomyValue(reloadedQueuedSnapshot) - seededEconomyValue).toBe(
    -CHEESE_PRESS_INPUT_UNIT_VALUE * 2,
  )

  await makeFirstBarnJobReady(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  await expect
    .poll(async () => (await getBarnSnapshot(page)).jobs[0]?.isReady ?? false, {
      timeout: 5_000,
      message: 'Expected Barn job to remain ready after reload before touch claim.',
    })
    .toBe(true)

  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).jobListText.includes('(ready)'), {
      timeout: 5_000,
      message: 'Expected Barn queue copy to surface the claim-ready state on mobile.',
    })
    .toBe(true)

  const readySnapshot = await getBarnSnapshot(page)
  expect(getCheesePressEconomyValue(readySnapshot) - seededEconomyValue).toBe(
    -CHEESE_PRESS_INPUT_UNIT_VALUE * 2,
  )

  await tapBarnButton(page, 'claimButtonCenter')

  await expect
    .poll(async () => (await getBarnSnapshot(page)).jobs.length, {
      timeout: 5_000,
      message: 'Expected touch claim interaction to clear the ready Barn job.',
    })
    .toBe(0)

  await expect
    .poll(async () => (await getBarnSnapshot(page)).inventory.cheese ?? 0, {
      timeout: 5_000,
      message: 'Expected touch Barn claim to award cheese inventory.',
    })
    .toBe(1)

  const claimedSnapshot = await getBarnSnapshot(page)
  expect(getCheesePressEconomyValue(claimedSnapshot) - seededEconomyValue).toBe(
    CHEESE_PRESS_EXPECTED_NET_VALUE,
  )

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const persistedSnapshot = await getBarnSnapshot(page)
  expect((await getSnapshot(page)).activeScene).toBe('barn')
  expect(persistedSnapshot.jobs).toHaveLength(0)
  expect(persistedSnapshot.inventory.cheese).toBe(1)
  expect(getCheesePressEconomyValue(persistedSnapshot) - seededEconomyValue).toBe(
    CHEESE_PRESS_EXPECTED_NET_VALUE,
  )

  const lifecycleEvents = (await getTelemetryEvents(page)).filter((event) =>
    BARN_LIFECYCLE_EVENT_NAMES.has(event.name),
  )
  expect(lifecycleEvents.map((event) => event.name)).toEqual([
    'barn_job_aborted',
    'barn_job_queued',
    'barn_job_processed',
    'barn_job_claimed',
  ])

  const [abortedEvent, queuedEvent, processedEvent, claimedEvent] = lifecycleEvents
  const abortedPayload = abortedEvent?.payload ?? {}
  const queuedPayload = queuedEvent?.payload ?? {}
  const processedPayload = processedEvent?.payload ?? {}
  const claimedPayload = claimedEvent?.payload ?? {}

  expect(abortedPayload.reason).toBe('insufficient_items')
  expect(abortedPayload.source).toBe('barn:pointer')
  expect(abortedPayload.jobId).toBeNull()
  expect(queuedPayload.jobId).toBe(processedPayload.jobId)
  expect(processedPayload.jobId).toBe(claimedPayload.jobId)
  expect(queuedPayload.source).toBe('barn:pointer')
  expect(processedPayload.source).toBe('barn:pointer')
  expect(claimedPayload.source).toBe('barn:pointer')
  expect(queuedPayload.activeJobCount).toBe(1)
  expect(processedPayload.activeJobCount).toBe(1)
  expect(claimedPayload.activeJobCount).toBe(0)
  expect(queuedPayload.queuedAtEpochMs).toBe(queuedPayload.eventTimestampMs)
  expect(processedPayload.processedAtEpochMs).toBe(processedPayload.readyAtEpochMs)
  expect(processedPayload.eventTimestampMs).toBe(processedPayload.processedAtEpochMs)
  expect(claimedPayload.processedAtEpochMs).toBe(processedPayload.processedAtEpochMs)
  expect(claimedPayload.claimedAtEpochMs).toBe(claimedPayload.eventTimestampMs)
})

test('mobile Barn locked recipe feedback unlocks through expansion progression', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Locked Barn UX smoke runs only for mobile.')

  await launchSmokeSession(page)
  await debugNavigate(page, 'barn')

  await expect
    .poll(async () => (await getSnapshot(page)).activeScene, {
      timeout: 5_000,
      message: 'Expected Barn scene to become active before locked recipe checks.',
    })
    .toBe('barn')

  await tapBarnButton(page, 'cycleRecipeButtonCenter')
  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).selectedRecipeId, {
      timeout: 5_000,
      message: 'Expected Barn recipe cycle to select the configured locked recipe.',
    })
    .toBe('feed_mix')

  const lockedUi = await getBarnUiSnapshot(page)
  expect(lockedUi.recipeDetailText).toContain('Status Locked')
  expect(lockedUi.recipeDetailText).toContain('Reach Market Expansion (Tier 2)')

  await tapBarnButton(page, 'startRecipeButtonCenter')
  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).feedbackText, {
      timeout: 5_000,
      message: 'Expected locked recipe start to explain the configured unlock requirement.',
    })
    .toBe('Feed Mix locked. Reach Market Expansion (Tier 2).')

  expect((await getBarnSnapshot(page)).jobs).toHaveLength(0)

  await unlockFeedMixThroughSavedProgression(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)
  expect((await getSnapshot(page)).activeScene).toBe('barn')

  await tapBarnButton(page, 'cycleRecipeButtonCenter')
  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).selectedRecipeId, {
      timeout: 5_000,
      message: 'Expected Barn recipe cycle to reselect feed mix after progression unlock.',
    })
    .toBe('feed_mix')

  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).recipeDetailText, {
      timeout: 5_000,
      message: 'Expected feed mix to become available after saved expansion progression.',
    })
    .toContain('Status Unlocked')

  await tapBarnButton(page, 'startRecipeButtonCenter')
  await expect
    .poll(async () => (await getBarnSnapshot(page)).jobs.length, {
      timeout: 5_000,
      message: 'Expected unlocked feed mix to queue after mobile touch start.',
    })
    .toBe(1)

  const unlockedSnapshot = await getBarnSnapshot(page)
  expect(unlockedSnapshot.jobs[0]?.recipeId).toBe('feed_mix')
  expect(unlockedSnapshot.inventory.turnip ?? 0).toBe(0)
  expect(unlockedSnapshot.inventory.egg ?? 0).toBe(0)
  expect(unlockedSnapshot.balance).toBe(0)
})
