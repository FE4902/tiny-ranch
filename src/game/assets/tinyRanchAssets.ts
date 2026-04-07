import type { Scene } from 'phaser'

import animalsSheetUrl from '../../assets/tiny-ranch/animals/animals.png'
import charactersSheetUrl from '../../assets/tiny-ranch/characters/characters.png'
import cropsSheetUrl from '../../assets/tiny-ranch/crops/crops.png'
import mapDecorationsSheetUrl from '../../assets/tiny-ranch/decorations/map-decorations.png'
import itemsSheetUrl from '../../assets/tiny-ranch/items/items.png'
import structuresSheetUrl from '../../assets/tiny-ranch/structures/structures.png'
import tilesSheetUrl from '../../assets/tiny-ranch/tiles/tiles.png'

export const TINY_RANCH_FRAME_SIZE = 8

export type TinyRanchAssetCategory =
  | 'animals'
  | 'characters'
  | 'crops'
  | 'decorations'
  | 'items'
  | 'structures'
  | 'tiles'

export interface TinyRanchSpritesheetDefinition {
  key: string
  category: TinyRanchAssetCategory
  url: string
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
  frameCount: number
  summary: string
  mvp: boolean
}

interface TinyRanchSpritesheetSeed {
  key: string
  category: TinyRanchAssetCategory
  url: string
  pixelWidth: number
  pixelHeight: number
  summary: string
  mvp: boolean
}

function createSpritesheetDefinition(
  seed: TinyRanchSpritesheetSeed,
): TinyRanchSpritesheetDefinition {
  const columns = seed.pixelWidth / TINY_RANCH_FRAME_SIZE
  const rows = seed.pixelHeight / TINY_RANCH_FRAME_SIZE

  return {
    key: seed.key,
    category: seed.category,
    url: seed.url,
    frameWidth: TINY_RANCH_FRAME_SIZE,
    frameHeight: TINY_RANCH_FRAME_SIZE,
    columns,
    rows,
    frameCount: columns * rows,
    summary: seed.summary,
    mvp: seed.mvp,
  }
}

export const tinyRanchSpritesheets: TinyRanchSpritesheetDefinition[] = [
  createSpritesheetDefinition({
    key: 'tiny-ranch-tiles',
    category: 'tiles',
    url: tilesSheetUrl,
    pixelWidth: 80,
    pixelHeight: 48,
    summary: 'Ground, soil, water-edge, and terrain transition tiles for the ranch map.',
    mvp: true,
  }),
  createSpritesheetDefinition({
    key: 'tiny-ranch-characters',
    category: 'characters',
    url: charactersSheetUrl,
    pixelWidth: 24,
    pixelHeight: 192,
    summary: 'Farmer character variants and directional sprite strips for the player avatar.',
    mvp: true,
  }),
  createSpritesheetDefinition({
    key: 'tiny-ranch-animals',
    category: 'animals',
    url: animalsSheetUrl,
    pixelWidth: 128,
    pixelHeight: 48,
    summary: 'Mixed ranch-animal sprites suited for pens, barns, and roaming livestock.',
    mvp: true,
  }),
  createSpritesheetDefinition({
    key: 'tiny-ranch-structures',
    category: 'structures',
    url: structuresSheetUrl,
    pixelWidth: 64,
    pixelHeight: 128,
    summary: 'Barn pieces, silos, fences, carts, and other buildable ranch structures.',
    mvp: true,
  }),
  createSpritesheetDefinition({
    key: 'tiny-ranch-crops',
    category: 'crops',
    url: cropsSheetUrl,
    pixelWidth: 56,
    pixelHeight: 120,
    summary: 'Planting plots and crop growth states for the core farming loop.',
    mvp: true,
  }),
  createSpritesheetDefinition({
    key: 'tiny-ranch-items',
    category: 'items',
    url: itemsSheetUrl,
    pixelWidth: 56,
    pixelHeight: 32,
    summary: 'Harvest drops, tools, and inventory-friendly object icons.',
    mvp: true,
  }),
  createSpritesheetDefinition({
    key: 'tiny-ranch-decorations',
    category: 'decorations',
    url: mapDecorationsSheetUrl,
    pixelWidth: 64,
    pixelHeight: 48,
    summary: 'Trees, flowers, rocks, and foliage for biome dressing and map polish.',
    mvp: false,
  }),
]

export const tinyRanchSpritesheetCount = tinyRanchSpritesheets.length

export const tinyRanchMvpSpritesheets = tinyRanchSpritesheets.filter((sheet) => sheet.mvp)
export const tinyRanchMvpSpritesheetCount = tinyRanchMvpSpritesheets.length

export function preloadTinyRanchSpritesheets(
  scene: Scene,
  options: { mvpOnly?: boolean } = {},
): TinyRanchSpritesheetDefinition[] {
  const sheetsToLoad = options.mvpOnly ? tinyRanchMvpSpritesheets : tinyRanchSpritesheets

  sheetsToLoad.forEach((sheet) => {
    scene.load.spritesheet(sheet.key, sheet.url, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
    })
  })

  return sheetsToLoad
}
