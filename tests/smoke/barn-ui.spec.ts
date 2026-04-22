import { expect, test, type Page } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'
const SAVE_STORAGE_KEY = 'tiny-ranch:save-state'

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

test('mobile Barn scene touch flow shows missing-input feedback and persists claim state across reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Touch Barn smoke runs only for mobile.')

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
  await tapBarnButton(page, 'startRecipeButtonCenter')

  await expect
    .poll(async () => (await getBarnSnapshot(page)).jobs.length, {
      timeout: 5_000,
      message: 'Expected touch start interaction to queue a Barn job.',
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
      message: 'Expected Barn job to remain ready after reload before touch claim.',
    })
    .toBe(true)

  await expect
    .poll(async () => (await getBarnUiSnapshot(page)).jobListText.includes('(ready)'), {
      timeout: 5_000,
      message: 'Expected Barn queue copy to surface the claim-ready state on mobile.',
    })
    .toBe(true)

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

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSmokeHarness(page)

  const persistedSnapshot = await getBarnSnapshot(page)
  expect((await getSnapshot(page)).activeScene).toBe('barn')
  expect(persistedSnapshot.jobs).toHaveLength(0)
  expect(persistedSnapshot.inventory.cheese).toBe(1)
})
