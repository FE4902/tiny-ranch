import { expect, test, type Page } from '@playwright/test'

const SMOKE_HARNESS_KEY = '__TINY_RANCH_SMOKE__'
const EXPECTED_TITLE = 'Tiny Ranch - Cozy Browser Ranch Game'
const EXPECTED_DESCRIPTION =
  'Tiny Ranch is a cozy browser ranch game where players plant crops, care for animals, craft barn goods, and ship village orders.'
const EXPECTED_SHARE_DESCRIPTION =
  'Plant crops, care for animals, craft barn goods, and ship village orders in a mobile-friendly browser ranch.'
const EXPECTED_TINY_RANCH_SPRITESHEET_KEYS = [
  'tiny-ranch-animals',
  'tiny-ranch-characters',
  'tiny-ranch-crops',
  'tiny-ranch-decorations',
  'tiny-ranch-items',
  'tiny-ranch-structures',
  'tiny-ranch-tiles',
] as const

type LaunchMetadata = {
  title: string
  description: string | null
  applicationName: string | null
  themeColor: string | null
  manifestHref: string | null
  faviconHref: string | null
  appleIconHref: string | null
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  twitterCard: string | null
  twitterTitle: string | null
  twitterDescription: string | null
  twitterImage: string | null
}

type SmokeSnapshot = {
  activeScene: string | null
}

type PreloadAssetSheetSnapshot = {
  key: string
  loaded: boolean
  expectedFrames: number
  loadedFrames: number
}

type PreloadAssetSnapshot = {
  allLoaded: boolean
  totalSheetCount: number
  loadedSheetCount: number
  expectedFrameCount: number
  loadedFrameCount: number
  sheets: PreloadAssetSheetSnapshot[]
}

type CanvasRenderingSnapshot = {
  canvasCount: number
  width: number
  height: number
  cssWidth: number
  cssHeight: number
  imageRendering: string
}

type ScreenPoint = {
  x: number
  y: number
}

type ScreenBounds = {
  x: number
  y: number
  width: number
  height: number
}

type RanchMapSnapshot = {
  widthTiles: number
  heightTiles: number
  tileSize: number
  mapScale: number
  mapBounds: ScreenBounds
  cropPlotCount: number
  visibleCropPlotCount: number
  cropPlotCssSize: number
  cropPlots: Array<{
    id: string
    x: number
    y: number
    center: ScreenPoint
  }>
  decorationSpriteCount: number
}

type HudButtonSnapshot = {
  label: string
  selected: boolean
  center: ScreenPoint
  bounds: ScreenBounds
}

type HudSnapshot = {
  isVisible: boolean
  coinsText: string
  inventoryText: string
  seedText: string
  selectedActionText: string
  toolbarBounds: ScreenBounds
  actionButtons: {
    plant: HudButtonSnapshot
    harvest: HudButtonSnapshot
    sell: HudButtonSnapshot
  }
}

function resolveLaunchMetadata(): LaunchMetadata {
  const readMeta = (selector: string): string | null =>
    document.querySelector<HTMLMetaElement>(selector)?.content ?? null
  const readLink = (selector: string): string | null =>
    document.querySelector<HTMLLinkElement>(selector)?.getAttribute('href') ?? null

  return {
    title: document.title,
    description: readMeta('meta[name="description"]'),
    applicationName: readMeta('meta[name="application-name"]'),
    themeColor: readMeta('meta[name="theme-color"]'),
    manifestHref: readLink('link[rel="manifest"]'),
    faviconHref: readLink('link[rel="icon"]'),
    appleIconHref: readLink('link[rel="apple-touch-icon"]'),
    ogTitle: readMeta('meta[property="og:title"]'),
    ogDescription: readMeta('meta[property="og:description"]'),
    ogImage: readMeta('meta[property="og:image"]'),
    twitterCard: readMeta('meta[name="twitter:card"]'),
    twitterTitle: readMeta('meta[name="twitter:title"]'),
    twitterDescription: readMeta('meta[name="twitter:description"]'),
    twitterImage: readMeta('meta[name="twitter:image"]'),
  }
}

async function expectAssetFetches(page: Page, assetPath: string): Promise<void> {
  const result = await page.evaluate(async (path) => {
    const response = await fetch(path, { cache: 'no-store' })
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
    }
  }, assetPath)

  expect(result.ok, `${assetPath} should be fetchable`).toBe(true)
  expect(result.status, `${assetPath} should return HTTP 200`).toBe(200)
  expect(result.contentType, `${assetPath} should include a content type`).not.toBeNull()
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

async function getPreloadAssetSnapshot(page: Page): Promise<PreloadAssetSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getPreloadAssetSnapshot: () => PreloadAssetSnapshot
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getPreloadAssetSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function getCanvasRenderingSnapshot(page: Page): Promise<CanvasRenderingSnapshot> {
  return page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('#game-root canvas'))
    const canvas = canvases[0]
    if (!canvas) {
      throw new Error('Tiny Ranch canvas was not mounted.')
    }

    const bounds = canvas.getBoundingClientRect()
    return {
      canvasCount: canvases.length,
      width: canvas.width,
      height: canvas.height,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      imageRendering: window.getComputedStyle(canvas).imageRendering,
    }
  })
}

async function getRanchMapSnapshot(page: Page): Promise<RanchMapSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getRanchMapSnapshot: () => RanchMapSnapshot
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getRanchMapSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function getHudSnapshot(page: Page): Promise<HudSnapshot> {
  return page.evaluate((harnessKey: string) => {
    const key = harnessKey as keyof Window
    const harness = window[key] as
      | {
          getHudSnapshot: () => HudSnapshot
        }
      | undefined
    if (!harness) {
      throw new Error('Smoke harness is not available on window.')
    }

    return harness.getHudSnapshot()
  }, SMOKE_HARNESS_KEY)
}

async function debugSeedInventory(page: Page, itemId: string, quantity: number): Promise<void> {
  await page.evaluate(
    ({ harnessKey, itemId: inventoryItemId, quantity: inventoryQuantity }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as
        | {
            debugSeedInventory: (itemId: string, quantity: number) => void
          }
        | undefined
      if (!harness) {
        throw new Error('Smoke harness is not available on window.')
      }

      harness.debugSeedInventory(inventoryItemId, inventoryQuantity)
    },
    { harnessKey: SMOKE_HARNESS_KEY, itemId, quantity },
  )
}

async function debugGrantCoins(page: Page, amount: number): Promise<number> {
  return page.evaluate(
    ({ harnessKey, amount: grantAmount }) => {
      const key = harnessKey as keyof Window
      const harness = window[key] as
        | {
            debugGrantCoins: (amount: number) => number
          }
        | undefined
      if (!harness) {
        throw new Error('Smoke harness is not available on window.')
      }

      return harness.debugGrantCoins(grantAmount)
    },
    { harnessKey: SMOKE_HARNESS_KEY, amount },
  )
}

test('production launch shell exposes metadata and boots the game', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  await page.goto('/?smokeTest=1', { waitUntil: 'domcontentloaded' })

  const metadata = await page.evaluate(resolveLaunchMetadata)
  expect(metadata.title).toBe(EXPECTED_TITLE)
  expect(metadata.description).toBe(EXPECTED_DESCRIPTION)
  expect(metadata.applicationName).toBe('Tiny Ranch')
  expect(metadata.themeColor).toBe('#173c2e')
  expect(metadata.manifestHref).toBe('/site.webmanifest')
  expect(metadata.faviconHref).toBe('/favicon.svg')
  expect(metadata.appleIconHref).toBe('/apple-touch-icon.png')
  expect(metadata.ogTitle).toBe(EXPECTED_TITLE)
  expect(metadata.ogDescription).toBe(EXPECTED_SHARE_DESCRIPTION)
  expect(metadata.ogImage).toBe('/share-card.svg')
  expect(metadata.twitterCard).toBe('summary_large_image')
  expect(metadata.twitterTitle).toBe(EXPECTED_TITLE)
  expect(metadata.twitterDescription).toBe(EXPECTED_SHARE_DESCRIPTION)
  expect(metadata.twitterImage).toBe('/share-card.svg')

  await expectAssetFetches(page, '/favicon.svg')
  await expectAssetFetches(page, '/app-icon.svg')
  await expectAssetFetches(page, '/apple-touch-icon.png')
  await expectAssetFetches(page, '/share-card.svg')

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/site.webmanifest', { cache: 'no-store' })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json(),
    }
  })

  expect(manifest.ok).toBe(true)
  expect(manifest.status).toBe(200)
  expect(manifest.body).toMatchObject({
    name: 'Tiny Ranch',
    short_name: 'Tiny Ranch',
    start_url: '/',
    display: 'standalone',
    theme_color: '#173c2e',
  })
  expect(manifest.body.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: '/app-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      }),
    ]),
  )

  await expect(page.locator('#game-root canvas')).toBeVisible({ timeout: 15_000 })
  await waitForSmokeHarness(page)

  const snapshot = await getSnapshot(page)
  expect(snapshot.activeScene).toBe('ranch')

  const canvas = await getCanvasRenderingSnapshot(page)
  expect(canvas.canvasCount).toBe(1)
  expect(canvas.width).toBeGreaterThan(0)
  expect(canvas.height).toBeGreaterThan(0)
  expect(canvas.cssWidth).toBeGreaterThan(0)
  expect(canvas.cssHeight).toBeGreaterThan(0)
  expect(['crisp-edges', 'pixelated']).toContain(canvas.imageRendering)

  const ranchMap = await getRanchMapSnapshot(page)
  expect(ranchMap.widthTiles).toBe(22)
  expect(ranchMap.heightTiles).toBe(18)
  expect(ranchMap.tileSize).toBe(16)
  expect(ranchMap.cropPlotCount).toBeGreaterThanOrEqual(6)
  expect(ranchMap.visibleCropPlotCount).toBe(ranchMap.cropPlotCount)
  expect(ranchMap.cropPlotCssSize).toBeGreaterThanOrEqual(10)
  expect(ranchMap.decorationSpriteCount).toBeGreaterThanOrEqual(1)
  expect(ranchMap.mapBounds.x).toBeGreaterThanOrEqual(0)
  expect(ranchMap.mapBounds.y).toBeGreaterThanOrEqual(0)
  expect(ranchMap.mapBounds.x + ranchMap.mapBounds.width).toBeLessThanOrEqual(
    canvas.cssWidth + 1,
  )
  expect(ranchMap.mapBounds.y + ranchMap.mapBounds.height).toBeLessThanOrEqual(
    canvas.cssHeight + 1,
  )
  expect(ranchMap.cropPlots.slice(0, 6)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'crop-plot-2-10', x: 2, y: 10 }),
      expect.objectContaining({ id: 'crop-plot-3-10', x: 3, y: 10 }),
      expect.objectContaining({ id: 'crop-plot-4-10', x: 4, y: 10 }),
      expect.objectContaining({ id: 'crop-plot-5-10', x: 5, y: 10 }),
      expect.objectContaining({ id: 'crop-plot-6-10', x: 6, y: 10 }),
      expect.objectContaining({ id: 'crop-plot-7-10', x: 7, y: 10 }),
    ]),
  )

  const hud = await getHudSnapshot(page)
  expect(hud.isVisible).toBe(true)
  expect(hud.coinsText).toBe('Coins: 0')
  expect(hud.inventoryText).toBe('Turnip: 0')
  expect(hud.seedText).toBe('Seed: Turnip Seed')
  expect(hud.selectedActionText).toBe('Action: Plant')
  expect(hud.actionButtons.plant.selected).toBe(true)
  expect(hud.actionButtons.harvest.selected).toBe(false)
  expect(hud.actionButtons.sell.selected).toBe(false)

  Object.values(hud.actionButtons).forEach((button) => {
    expect(button.bounds.width).toBeGreaterThanOrEqual(72)
    expect(button.bounds.height).toBeGreaterThanOrEqual(36)
  })

  const harvestButton = hud.actionButtons.harvest
  if (testInfo.project.name === 'mobile-chromium') {
    await page.touchscreen.tap(harvestButton.center.x, harvestButton.center.y)
  } else {
    await page.mouse.click(harvestButton.center.x, harvestButton.center.y)
  }

  await debugGrantCoins(page, 7)
  await debugSeedInventory(page, 'turnip', 3)

  const updatedHud = await getHudSnapshot(page)
  expect(updatedHud.coinsText).toBe('Coins: 7')
  expect(updatedHud.inventoryText).toBe('Turnip: 3')
  expect(updatedHud.selectedActionText).toBe('Action: Harvest')
  expect(updatedHud.actionButtons.harvest.selected).toBe(true)

  const preloadAssets = await getPreloadAssetSnapshot(page)
  expect(preloadAssets.allLoaded).toBe(true)
  expect(preloadAssets.totalSheetCount).toBe(EXPECTED_TINY_RANCH_SPRITESHEET_KEYS.length)
  expect(preloadAssets.loadedSheetCount).toBe(preloadAssets.totalSheetCount)
  expect(preloadAssets.loadedFrameCount).toBe(preloadAssets.expectedFrameCount)
  expect(preloadAssets.sheets.map((sheet) => sheet.key).sort()).toEqual(
    [...EXPECTED_TINY_RANCH_SPRITESHEET_KEYS].sort(),
  )

  preloadAssets.sheets.forEach((sheet) => {
    expect(sheet.loaded, `${sheet.key} should be loaded by PreloadScene`).toBe(true)
    expect(sheet.loadedFrames, `${sheet.key} should load every expected frame`).toBe(
      sheet.expectedFrames,
    )
  })

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
